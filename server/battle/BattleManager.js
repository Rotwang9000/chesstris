/**
 * BattleManager — lifecycle for private 2-4 player battle arenas.
 *
 * Arenas are remote regions of the single global world (see
 * `docs/battle-mode-design.md`): a neutral ring of shared cells forms a
 * circular wall (diameter 32), and each participant plays a dedicated
 * **seat** — a fresh player record (`battle-<code>-s<n>`) with a home
 * zone at a fixed position facing the arena centre. A human's main-world
 * kingdom is untouched while they battle; gameplay handlers resolve
 * their acting id through `effectivePlayerId()`.
 *
 * Registry shape (persisted at `world.battles[battleId]`):
 *   {
 *     id, code,           // id === code (6-char shareable key)
 *     status,             // 'lobby' | 'active' | 'finished'
 *     slot, centre,       // arena grid slot + centre cell
 *     seatCount,          // requested seats (2-4)
 *     hostId,             // real player id of the creator
 *     createdAt, startedAt, finishedAt,
 *     winnerSeatId,
 *     seats: [{ seatId, index, controlledBy, isAi, name }],
 *   }
 */

'use strict';

const World = require('../world/World');
const Sessions = require('../world/Sessions');
const { generateGameKey } = require('../auth/gameKey');
const { BATTLE, arenaCentreForSlot, ringCells, seatHomeZones } = require('./geometry');
const {
	COMPUTER_DIFFICULTY,
	MIN_COMPUTER_MOVE_INTERVAL_MS,
	generateComputerStrategy,
} = require('../ai/strategy');

const LOBBY_TIMEOUT_MS = 15 * 60 * 1000;   // Unstarted battles evaporate.
const ACTIVE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // Hard cap on battle length.
const FINISHED_LINGER_MS = 60 * 1000;      // Leave the result on show, then clean.
const SWEEP_INTERVAL_MS = 5 * 1000;        // Elimination poll + timeouts.

const RING_COLOR = '#8a8a99';
// High-contrast fixed seat colours (N, S, W, E).
const SEAT_COLORS = ['#e6e6e6', '#454545', '#4488dd', '#dd8844'];
const BOT_DIFFICULTY = COMPUTER_DIFFICULTY.MEDIUM;

function seatIdFor(code, index) {
	return `battle-${String(code).toLowerCase()}-s${index}`;
}

function createBattleManager({ gameManager, aiRunner, broadcaster, persistence, lifecycleService, io }) {
	if (!gameManager) throw new Error('createBattleManager: gameManager required');
	if (!aiRunner) throw new Error('createBattleManager: aiRunner required');
	if (!broadcaster) throw new Error('createBattleManager: broadcaster required');
	if (!persistence) throw new Error('createBattleManager: persistence required');
	if (!lifecycleService) throw new Error('createBattleManager: lifecycleService required');
	if (!io) throw new Error('createBattleManager: io required');

	function battles() {
		const world = World.getWorld();
		if (!world.battles || typeof world.battles !== 'object') world.battles = {};
		return world.battles;
	}

	function getBattle(battleId) {
		return battleId ? battles()[String(battleId)] || null : null;
	}

	function battleByCode(code) {
		return getBattle(String(code || '').trim().toUpperCase());
	}

	/** The unfinished battle this REAL player controls a seat in, if any. */
	function battleForPlayer(realPlayerId) {
		const rid = String(realPlayerId);
		for (const battle of Object.values(battles())) {
			if (!battle || battle.status === 'finished') continue;
			if (battle.seats.some(s => !s.isAi && String(s.controlledBy) === rid)) return battle;
		}
		return null;
	}

	function seatFor(battle, realPlayerId) {
		if (!battle) return null;
		const rid = String(realPlayerId);
		return battle.seats.find(s => !s.isAi && String(s.controlledBy) === rid) || null;
	}

	/**
	 * The id gameplay handlers should act as for this socket's player:
	 * their seat id while they're in an ACTIVE battle, else their own.
	 */
	function effectivePlayerId(realPlayerId) {
		const battle = battleForPlayer(realPlayerId);
		if (!battle || battle.status !== 'active') return realPlayerId;
		const seat = seatFor(battle, realPlayerId);
		return seat ? seat.seatId : realPlayerId;
	}

	function allocateSlot() {
		const used = new Set();
		for (const battle of Object.values(battles())) {
			if (battle && battle.status !== 'finished' && Number.isInteger(battle.slot)) {
				used.add(battle.slot);
			}
		}
		for (let slot = 0; slot < BATTLE.MAX_ARENAS; slot++) {
			if (!used.has(slot)) return slot;
		}
		return null;
	}

	function publicState(battle) {
		if (!battle) return null;
		return {
			id: battle.id,
			code: battle.code,
			status: battle.status,
			centre: battle.centre,
			seatCount: battle.seatCount,
			hostId: battle.hostId,
			createdAt: battle.createdAt,
			startedAt: battle.startedAt || null,
			finishedAt: battle.finishedAt || null,
			winnerSeatId: battle.winnerSeatId || null,
			seats: battle.seats.map(s => ({
				seatId: s.seatId,
				index: s.index,
				isAi: !!s.isAi,
				name: s.name,
				controlledBy: s.controlledBy || null,
				eliminated: !!World.getPlayer(s.seatId)?.eliminated,
			})),
		};
	}

	function emitToSeatHumans(battle, event, payload) {
		for (const seat of battle.seats) {
			if (seat.isAi || !seat.controlledBy) continue;
			const socket = Sessions.socketForPlayer(seat.controlledBy);
			if (socket) {
				try { socket.emit(event, payload); } catch (_e) { /* socket closing */ }
			}
		}
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Create a battle lobby. The host takes seat 0.
	 * @returns {{success: boolean, error?: string, battle?: Object}}
	 */
	function createBattle({ hostId, hostName, seatCount = 2 }) {
		const seats = Number(seatCount);
		if (!Number.isInteger(seats) || seats < BATTLE.MIN_SEATS || seats > BATTLE.MAX_SEATS) {
			return { success: false, error: `Seat count must be ${BATTLE.MIN_SEATS}-${BATTLE.MAX_SEATS}` };
		}
		if (battleForPlayer(hostId)) {
			return { success: false, error: 'You are already in a battle' };
		}
		if (allocateSlot() === null) {
			return { success: false, error: 'All arenas are busy — try again later' };
		}

		// Codes collide vanishingly rarely, but the registry is tiny so
		// re-rolling until unique costs nothing.
		let code = generateGameKey();
		let guard = 0;
		while (battles()[code] && guard++ < 20) code = generateGameKey();

		const battle = {
			id: code,
			code,
			status: 'lobby',
			slot: null,
			centre: null,
			seatCount: seats,
			hostId: String(hostId),
			createdAt: Date.now(),
			startedAt: null,
			finishedAt: null,
			winnerSeatId: null,
			seats: [{
				seatId: seatIdFor(code, 0),
				index: 0,
				controlledBy: String(hostId),
				isAi: false,
				name: hostName || 'Player 1',
			}],
		};
		battles()[code] = battle;
		World.markDirty();
		persistence.markDirty();

		console.log(`[Battle] ${hostId} created battle ${code} (${seats} seats)`);
		return { success: true, battle: publicState(battle) };
	}

	/**
	 * Join an existing lobby by code.
	 */
	function joinBattle({ code, playerId, playerName }) {
		const battle = battleByCode(code);
		if (!battle) return { success: false, error: 'Battle not found' };
		if (battle.status !== 'lobby') return { success: false, error: 'Battle already started' };

		const existing = seatFor(battle, playerId);
		if (existing) {
			return { success: true, battle: publicState(battle), seatId: existing.seatId };
		}
		const otherBattle = battleForPlayer(playerId);
		if (otherBattle) return { success: false, error: 'You are already in a battle' };
		if (battle.seats.length >= battle.seatCount) {
			return { success: false, error: 'Battle is full' };
		}

		const index = battle.seats.length;
		const seat = {
			seatId: seatIdFor(battle.code, index),
			index,
			controlledBy: String(playerId),
			isAi: false,
			name: playerName || `Player ${index + 1}`,
		};
		battle.seats.push(seat);
		World.markDirty();
		persistence.markDirty();

		emitToSeatHumans(battle, 'battle_lobby_update', { battle: publicState(battle) });
		console.log(`[Battle] ${playerId} joined battle ${battle.code} (seat ${index})`);
		return { success: true, battle: publicState(battle), seatId: seat.seatId };
	}

	/**
	 * Start the battle: fill empty seats with bots, build the arena
	 * (ring + seat home zones + pieces), arm AI tickers and aliases.
	 * Only the host may start.
	 */
	function startBattle({ battleId, playerId }) {
		const battle = getBattle(battleId) || battleByCode(battleId);
		if (!battle) return { success: false, error: 'Battle not found' };
		if (battle.status !== 'lobby') return { success: false, error: 'Battle already started' };
		if (String(battle.hostId) !== String(playerId)) {
			return { success: false, error: 'Only the host can start the battle' };
		}

		const slot = allocateSlot();
		if (slot === null) return { success: false, error: 'All arenas are busy — try again later' };

		// Fill the remaining seats with bots.
		while (battle.seats.length < battle.seatCount) {
			const index = battle.seats.length;
			battle.seats.push({
				seatId: seatIdFor(battle.code, index),
				index,
				controlledBy: null,
				isAi: true,
				name: `Bot ${index + 1}`,
			});
		}

		battle.slot = slot;
		battle.centre = arenaCentreForSlot(slot);
		buildArena(battle);
		battle.status = 'active';
		battle.startedAt = Date.now();

		World.markDirty();
		persistence.markDirty();
		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });

		const payload = { battle: publicState(battle) };
		emitToSeatHumans(battle, 'battle_started', payload);
		console.log(
			`[Battle] ${battle.code} started at (${battle.centre.x}, ${battle.centre.z}) `
			+ `with ${battle.seats.filter(s => !s.isAi).length} human(s), `
			+ `${battle.seats.filter(s => s.isAi).length} bot(s)`
		);
		return { success: true, battle: publicState(battle) };
	}

	function buildArena(battle) {
		const world = World.getWorld();

		// Neutral ring wall. Overwrite whatever might linger from a
		// badly-cleaned previous battle on this slot.
		for (const { x, z } of ringCells(battle.centre)) {
			world.board.cells[`${x},${z}`] = [{
				type: 'tetromino',
				player: null,
				battleRing: battle.id,
				color: RING_COLOR,
			}];
		}

		const zones = seatHomeZones(battle.centre, battle.seats.length);
		for (const seat of battle.seats) {
			const zone = zones[seat.index];
			const record = World.upsertPlayer(seat.seatId, {
				name: `⚔ ${seat.name}`,
				color: SEAT_COLORS[seat.index % SEAT_COLORS.length],
				battleId: battle.id,
				controlledBy: seat.controlledBy || null,
				isComputer: !!seat.isAi,
				eliminated: false,
				connected: !seat.isAi,
				lastActiveAt: Date.now(),
				...(seat.isAi ? {
					difficulty: BOT_DIFFICULTY,
					minMoveInterval: MIN_COMPUTER_MOVE_INTERVAL_MS[BOT_DIFFICULTY] || 10000,
					strategy: generateComputerStrategy(BOT_DIFFICULTY),
					lastMoveTime: 0,
				} : {}),
			});

			world.homeZones[seat.seatId] = zone;
			const pieces = gameManager.chessManager.initializeChessPieces(world, seat.seatId, zone);
			if (Array.isArray(pieces) && pieces.length > 0) {
				world.chessPieces.push(...pieces);
			}
			record.availableTetrominos = gameManager.tetrominoManager.generateTetrominos(world, seat.seatId);

			if (seat.isAi) {
				aiRunner.startAiPlayer(seat.seatId);
			} else {
				Sessions.setAlias(seat.seatId, seat.controlledBy);
			}
		}

		gameManager.boardManager.recalculateBoardBoundaries(world.board);
	}

	/**
	 * Leave a battle. In the lobby, the host leaving cancels it and any
	 * other player just frees their seat. Mid-battle, leaving forfeits:
	 * the seat is eliminated and the sweep settles the outcome.
	 */
	function leaveBattle({ playerId }) {
		const battle = battleForPlayer(playerId);
		if (!battle) return { success: false, error: 'You are not in a battle' };
		const seat = seatFor(battle, playerId);

		if (battle.status === 'lobby') {
			if (String(battle.hostId) === String(playerId)) {
				emitToSeatHumans(battle, 'battle_cancelled', { battleId: battle.id });
				delete battles()[battle.id];
				console.log(`[Battle] ${battle.code} cancelled by host`);
			} else {
				battle.seats = battle.seats.filter(s => s !== seat);
				battle.seats.forEach((s, i) => { s.index = i; s.seatId = seatIdFor(battle.code, i); });
				emitToSeatHumans(battle, 'battle_lobby_update', { battle: publicState(battle) });
				console.log(`[Battle] ${playerId} left lobby ${battle.code}`);
			}
			World.markDirty();
			persistence.markDirty();
			return { success: true };
		}

		if (battle.status === 'active' && seat) {
			const record = World.getPlayer(seat.seatId);
			if (record && !record.eliminated) {
				record.eliminated = true;
				record.eliminatedAt = Date.now();
				World.markDirty();
				console.log(`[Battle] ${playerId} forfeited seat ${seat.seatId} in ${battle.code}`);
			}
			// The elimination poll picks the forfeit up on the next sweep.
			return { success: true, forfeited: true };
		}

		return { success: true };
	}

	// ── Sweep: eliminations, timeouts, cleanup ───────────────────────────

	function seatIsAlive(seat) {
		const world = World.getWorld();
		const record = World.getPlayer(seat.seatId);
		if (!record || record.eliminated) return false;
		// A seat with no king left is dead even if the elimination flag
		// hasn't landed yet (e.g. king detonation edge cases).
		return (world.chessPieces || []).some(p =>
			p
			&& String(p.player) === String(seat.seatId)
			&& String(p.type || '').toUpperCase() === 'KING'
		);
	}

	function finishBattle(battle, { reason }) {
		const alive = battle.seats.filter(seatIsAlive);
		battle.status = 'finished';
		battle.finishedAt = Date.now();
		battle.winnerSeatId = alive.length === 1 ? alive[0].seatId : null;

		const payload = { battle: publicState(battle), reason };
		emitToSeatHumans(battle, 'battle_finished', payload);

		// Winner toast for the whole world — battles are a spectacle.
		const winnerSeat = battle.seats.find(s => s.seatId === battle.winnerSeatId);
		if (winnerSeat) {
			try {
				io.to(World.getWorldId()).emit('server_toast', {
					message: `⚔ ${winnerSeat.name} won battle ${battle.code}!`,
					tone: 'success',
				});
			} catch (_e) { /* best-effort */ }
		}

		World.markDirty();
		persistence.markDirty();
		console.log(`[Battle] ${battle.code} finished (${reason}); winner: ${battle.winnerSeatId || 'none'}`);
	}

	/** Remove every trace of a battle from the world. */
	function cleanupBattle(battle) {
		const world = World.getWorld();

		for (const seat of battle.seats) {
			Sessions.clearAlias(seat.seatId);
			try { aiRunner.stopAiPlayer(seat.seatId); } catch (_e) { /* not armed */ }
			if (World.getPlayer(seat.seatId)) {
				try { lifecycleService.removePlayerCompletely(seat.seatId); }
				catch (err) { console.warn(`[Battle] seat cleanup failed for ${seat.seatId}:`, err.message); }
			}
		}

		// Strip the ring.
		let ringRemoved = 0;
		for (const [key, contents] of Object.entries(world.board.cells)) {
			if (!Array.isArray(contents)) continue;
			const filtered = contents.filter(item => !item || String(item.battleRing || '') !== String(battle.id));
			if (filtered.length === contents.length) continue;
			if (filtered.length > 0) world.board.cells[key] = filtered;
			else delete world.board.cells[key];
			ringRemoved++;
		}

		delete battles()[battle.id];
		gameManager.boardManager.recalculateBoardBoundaries(world.board);
		World.markDirty();
		persistence.markDirty();
		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
		console.log(`[Battle] ${battle.code} cleaned up (${ringRemoved} ring cells removed)`);
	}

	function tick({ now = Date.now() } = {}) {
		for (const battle of Object.values(battles())) {
			if (!battle) continue;

			if (battle.status === 'lobby') {
				if (now - battle.createdAt > LOBBY_TIMEOUT_MS) {
					emitToSeatHumans(battle, 'battle_cancelled', { battleId: battle.id, reason: 'timeout' });
					delete battles()[battle.id];
					World.markDirty();
					persistence.markDirty();
					console.log(`[Battle] ${battle.code} lobby timed out`);
				}
				continue;
			}

			if (battle.status === 'active') {
				const alive = battle.seats.filter(seatIsAlive);
				if (alive.length <= 1) {
					finishBattle(battle, { reason: 'elimination' });
				} else if (now - (battle.startedAt || battle.createdAt) > ACTIVE_TIMEOUT_MS) {
					finishBattle(battle, { reason: 'timeout' });
				}
				continue;
			}

			if (battle.status === 'finished'
				&& now - (battle.finishedAt || 0) > FINISHED_LINGER_MS) {
				cleanupBattle(battle);
			}
		}

		// Orphan GC: seat records whose battle vanished (bad shutdown,
		// manual registry edits) would otherwise linger forever because
		// every other sweep skips `battleId` players.
		for (const player of World.listPlayers()) {
			if (!player || !player.battleId) continue;
			if (getBattle(player.battleId)) continue;
			console.warn(`[Battle] GC: orphaned seat ${player.id} (battle ${player.battleId} gone)`);
			Sessions.clearAlias(player.id);
			try { aiRunner.stopAiPlayer(player.id); } catch (_e) { /* not armed */ }
			try { lifecycleService.removePlayerCompletely(player.id); }
			catch (err) { console.warn(`[Battle] GC failed for ${player.id}:`, err.message); }
		}
	}

	/**
	 * Boot-time restore: re-arm AI tickers and socket aliases for
	 * battles restored from the world snapshot.
	 */
	function init() {
		for (const battle of Object.values(battles())) {
			if (!battle || battle.status !== 'active') continue;
			for (const seat of battle.seats) {
				const record = World.getPlayer(seat.seatId);
				if (!record) continue;
				if (seat.isAi) {
					if (!record.strategy) record.strategy = generateComputerStrategy(record.difficulty || BOT_DIFFICULTY);
					aiRunner.startAiPlayer(seat.seatId);
				} else if (seat.controlledBy) {
					Sessions.setAlias(seat.seatId, seat.controlledBy);
				}
			}
			console.log(`[Battle] Restored active battle ${battle.code}`);
		}
	}

	return {
		createBattle,
		joinBattle,
		startBattle,
		leaveBattle,
		effectivePlayerId,
		battleForPlayer,
		battleByCode,
		getBattle,
		publicState,
		tick,
		init,
		SWEEP_INTERVAL_MS,
	};
}

module.exports = { createBattleManager };

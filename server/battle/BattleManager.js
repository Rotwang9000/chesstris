/**
 * BattleManager — lifecycle for private 2-4 player battle arenas.
 *
 * Arenas are remote regions of the single global world (see
 * `docs/battle-mode-design.md`): a neutral ring of shared cells forms a
 * circular wall (diameter 32), and each participant plays a dedicated
 * **seat** — a fresh player record (`battle-<id>-s<n>`) with a home
 * zone at a fixed position facing the arena centre. A human's main-world
 * kingdom is untouched while they battle; gameplay handlers resolve
 * their acting id through `effectivePlayerId()`.
 *
 * Registry shape (persisted at `world.battles[battleId]`):
 *   {
 *     id, code,           // id: internal, public (seat ids, ring cells,
 *                         //   players list). code: the 6-char invite
 *                         //   secret — only ever sent to seated players.
 *                         //   (Battles created before this split have
 *                         //   id === code and keep working.)
 *     status,             // 'lobby' | 'active' | 'finished'
 *     slot, centre,       // arena grid slot + centre cell
 *     seatCount,          // requested seats (2-4)
 *     mode,               // 'quick' (the sea rises) | 'classic'
 *     edition,            // 'standard' | 'viking' (longships; see shipRules.js)
 *     fleet,              // viking only: ship bookkeeping (see ships.js)
 *     isPublic,           // a Quick-match lobby anyone looking can join
 *     autoStartAt,        // quick match: bots fill the seats at this time
 *     seaSunkUntil,       // quick: sink times up to here are applied
 *     hostId,             // real player id of the creator
 *     createdAt, startedAt, finishedAt,
 *     winnerSeatId,
 *     seats: [{ seatId, index, controlledBy, isAi, name,
 *               outAt, forfeited, drowned, leftBy, offlineSince }],
 *   }
 */

'use strict';

const crypto = require('crypto');

const World = require('../world/World');
const Sessions = require('../world/Sessions');
const { generateGameKey } = require('../auth/gameKey');
const {
	BATTLE,
	arenaCentreForSlot,
	ringCells,
	seatHomeZones,
	playRadiusForSeats,
} = require('./geometry');
const {
	COMPUTER_DIFFICULTY,
	MIN_COMPUTER_MOVE_INTERVAL_MS,
	generateComputerStrategy,
} = require('../ai/strategy');
const {
	BOT_PACE,
	normaliseBotDifficulty,
	pushPaceSample,
	adaptiveBotIntervalMs,
} = require('./pacing');
const {
	BATTLE_MODES,
	SEA,
	normaliseBattleMode,
	hasSea,
	seaStartMs,
	seaEndMs,
	cellsSinkingBetween,
	publicSea,
} = require('./sea');
const pieces = require('../game/pieces');
const { EDITIONS, normaliseEdition, battleEdition, isVikingBattle } = require('./edition');
const ships = require('./ships');

const LOBBY_TIMEOUT_MS = 15 * 60 * 1000;   // Unstarted battles evaporate.
const ACTIVE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // Hard cap on battle length.
const FINISHED_LINGER_MS = 60 * 1000;      // Leave the result on show, then clean.
const SWEEP_INTERVAL_MS = 5 * 1000;        // Elimination poll + timeouts.
const OFFLINE_HANDOVER_MS = 60 * 1000;     // Gone this long → a bot takes the seat.
const QUICKMATCH_WAIT_MS = 20 * 1000;      // Nobody turns up in this long → a bot.
const QUICKMATCH_SEATS = 2;
// Safety net: the sea takes every cell, but a king's final detonation
// is animated, so allow it to land before forcing a result.
const SEA_END_GRACE_MS = 30 * 1000;

const RING_COLOR = '#8a8a99';
// High-contrast fixed seat colours (N, S, W, E).
const SEAT_COLORS = ['#e6e6e6', '#454545', '#4488dd', '#dd8844'];
const BOT_DIFFICULTY = COMPUTER_DIFFICULTY.MEDIUM;

function seatIdFor(battleId, index) {
	return `battle-${String(battleId).toLowerCase()}-s${index}`;
}

// The id leaks to everyone (every seat's pieces carry it), so it must
// not be the invite code or any spectator could join a private battle.
function newBattleId() {
	return `b${crypto.randomBytes(5).toString('hex')}`;
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
		const wanted = String(code || '').trim().toUpperCase();
		if (!wanted) return null;
		for (const battle of Object.values(battles())) {
			if (battle && String(battle.code).toUpperCase() === wanted) return battle;
		}
		return null;
	}

	/** Every unfinished battle this REAL player controls a seat in. */
	function battlesForPlayer(realPlayerId) {
		const rid = String(realPlayerId);
		const out = [];
		for (const battle of Object.values(battles())) {
			if (!battle || battle.status === 'finished') continue;
			if (battle.seats.some(s => !s.isAi && String(s.controlledBy) === rid)) out.push(battle);
		}
		return out;
	}

	/** The first unfinished battle this REAL player is seated in, if any. */
	function battleForPlayer(realPlayerId) {
		return battlesForPlayer(realPlayerId)[0] || null;
	}

	function seatFor(battle, realPlayerId) {
		if (!battle) return null;
		const rid = String(realPlayerId);
		return battle.seats.find(s => !s.isAi && String(s.controlledBy) === rid) || null;
	}

	/**
	 * The id gameplay handlers should act as for this socket's player.
	 *
	 * A player may hold seats in several battles at once, so each
	 * socket carries a FOCUS (set by the client via `battle_focus`):
	 *   • focusBattleId undefined — legacy: first active battle seat,
	 *     else the real id (old clients never emit a focus).
	 *   • focusBattleId null — the world view: always the real id.
	 *   • focusBattleId set — that battle's seat while it's active.
	 */
	function effectivePlayerId(realPlayerId, { focusBattleId } = {}) {
		if (focusBattleId === null) return realPlayerId;
		if (focusBattleId !== undefined) {
			const battle = getBattle(focusBattleId);
			if (!battle || battle.status !== 'active') return realPlayerId;
			const seat = seatFor(battle, realPlayerId);
			return seat ? seat.seatId : realPlayerId;
		}
		for (const battle of battlesForPlayer(realPlayerId)) {
			if (battle.status !== 'active') continue;
			const seat = seatFor(battle, realPlayerId);
			if (seat) return seat.seatId;
		}
		return realPlayerId;
	}

	function allocateSlot() {
		const used = new Set();
		for (const battle of Object.values(battles())) {
			// FINISHED battles keep their slot until cleanup removes them
			// from the registry — during the linger window their ring,
			// zones and pieces still occupy the arena, and a new battle
			// building there would overwrite the ring tags (breaking the
			// old battle's cleanup) and leave stale enemy pieces inside
			// the fresh arena.
			if (battle && Number.isInteger(battle.slot)) {
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
			// Clients mirror the arena-bounds and view-isolation rules,
			// so they need the actual radius (3-4 seat arenas are larger).
			playRadius: battle.playRadius || playRadiusForSeats(battle.seatCount || 2),
			seatCount: battle.seatCount,
			botDifficulty: battle.botDifficulty || 'auto',
			mode: battle.mode || BATTLE_MODES.CLASSIC,
			// Clients adopt the battle's edition (never their own URL) on
			// join, bot takeover and reconnect.
			edition: battleEdition(battle),
			sea: publicSea(battle),
			isPublic: !!battle.isPublic,
			startsInMs: battle.isPublic && battle.status === 'lobby'
				? Math.max(0, (battle.autoStartAt || 0) - Date.now())
				: null,
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

	function emitToSeatHumans(battle, event, payload, { except = null } = {}) {
		for (const seat of battle.seats) {
			if (seat.isAi || !seat.controlledBy) continue;
			if (except && String(seat.controlledBy) === String(except)) continue;
			// Every tab the player has open must hear battle events —
			// emitting to a single "current" socket meant a host with a
			// second tab open never saw joins or the battle starting.
			Sessions.emitToPlayerSockets(seat.controlledBy, event, payload);
		}
	}

	/**
	 * Stamp / clear `activeBattleId` on a REAL player's record.
	 *
	 * Battle-only players (who never joined the shared world) own no
	 * chess pieces under their real id, so the ghost-player sweep would
	 * flag them "eliminated" after a minute — and an eliminated cookie
	 * id is reissued on reconnect, silently costing them their seat.
	 * The stamp lets the sweep recognise and skip them. Clearing
	 * `eliminated` here covers players the sweep flagged BEFORE they
	 * entered the lobby (they're clearly alive — they're clicking).
	 */
	function stampRealPlayer(playerId, battleId) {
		const record = World.getPlayer(playerId);
		if (!record) return;
		// Multi-battle: "clearing" one battle's stamp falls back to any
		// OTHER battle the player still holds a seat in, so the ghost
		// sweep keeps protecting them until they're out of all of them.
		const effective = battleId || (battlesForPlayer(playerId)[0]?.id ?? null);
		if (effective) {
			record.activeBattleId = String(effective);
			if (record.eliminated) {
				record.eliminated = false;
				delete record.eliminatedAt;
			}
		} else {
			delete record.activeBattleId;
		}
		World.markDirty();
	}

	function clearAllSeatStamps(battle) {
		for (const seat of battle.seats) {
			if (!seat.isAi && seat.controlledBy) stampRealPlayer(seat.controlledBy, null);
		}
	}

	// ── Lifecycle ────────────────────────────────────────────────────────

	/**
	 * Create a battle lobby. The host takes seat 0.
	 * @returns {{success: boolean, error?: string, battle?: Object}}
	 */
	function createBattle({
		hostId, hostName, seatCount = 2, botDifficulty = 'auto', mode = BATTLE_MODES.QUICK,
		edition = EDITIONS.STANDARD,
	}) {
		const seats = Number(seatCount);
		if (!Number.isInteger(seats) || seats < BATTLE.MIN_SEATS || seats > BATTLE.MAX_SEATS) {
			return { success: false, error: `Seat count must be ${BATTLE.MIN_SEATS}-${BATTLE.MAX_SEATS}` };
		}
		// A player may hold seats in several battles (and the world) at
		// once and switch views between them — but hosting an unlimited
		// pile of lobbies would leak arena slots.
		const hosting = battlesForPlayer(hostId).filter(b => String(b.hostId) === String(hostId) && b.status === 'lobby');
		if (hosting.length >= 2) {
			return { success: false, error: 'You already have two open lobbies — start or cancel one first' };
		}
		if (allocateSlot() === null) {
			return { success: false, error: 'All arenas are busy — try again later' };
		}

		// Codes collide vanishingly rarely, but the registry is tiny so
		// re-rolling until unique costs nothing.
		let code = generateGameKey();
		let guard = 0;
		while (battleByCode(code) && guard++ < 20) code = generateGameKey();
		const id = newBattleId();

		const battle = {
			id,
			code,
			status: 'lobby',
			slot: null,
			centre: null,
			seatCount: seats,
			botDifficulty: normaliseBotDifficulty(botDifficulty),
			mode: normaliseBattleMode(mode),
			edition: normaliseEdition(edition),
			hostId: String(hostId),
			createdAt: Date.now(),
			startedAt: null,
			finishedAt: null,
			winnerSeatId: null,
			seats: [{
				seatId: seatIdFor(id, 0),
				index: 0,
				controlledBy: String(hostId),
				isAi: false,
				name: hostName || 'Player 1',
			}],
		};
		battles()[id] = battle;
		stampRealPlayer(hostId, battle.id);
		World.markDirty();
		persistence.markDirty();

		console.log(`[Battle] ${hostId} created battle ${code} (${seats} seats, ${battle.mode}, ${battle.edition})`);
		return { success: true, battle: publicState(battle) };
	}

	/**
	 * Join a battle by code.
	 *
	 * • Lobby: take a free seat.
	 * • Active: take over a live BOT seat, keeping its pieces — this is
	 *   how a friend can rescue you mid-battle or claim the bot from an
	 *   invite link after the host started without them.
	 *
	 * A player may hold seats in several battles at once (and keep
	 * their world kingdom); the client switches views between them via
	 * `battle_focus`.
	 */
	function joinBattle({ code, playerId, playerName }) {
		const battle = battleByCode(code);
		if (!battle) return { success: false, error: 'Battle not found' };
		if (battle.status === 'finished') return { success: false, error: 'Battle already finished' };

		const existing = seatFor(battle, playerId);
		if (existing) {
			return { success: true, battle: publicState(battle), seatId: existing.seatId };
		}

		if (battle.status === 'active') {
			return takeOverBotSeat({ battle, playerId, playerName });
		}

		if (battle.seats.length >= battle.seatCount) {
			return { success: false, error: 'Battle is full' };
		}

		const index = battle.seats.length;
		const seat = {
			seatId: seatIdFor(battle.id, index),
			index,
			controlledBy: String(playerId),
			isAi: false,
			name: playerName || `Player ${index + 1}`,
		};
		battle.seats.push(seat);
		stampRealPlayer(playerId, battle.id);
		World.markDirty();
		persistence.markDirty();

		emitToSeatHumans(battle, 'battle_lobby_update', { battle: publicState(battle) });
		console.log(`[Battle] ${playerId} joined battle ${battle.code} (seat ${index})`);
		return { success: true, battle: publicState(battle), seatId: seat.seatId };
	}

	/**
	 * Mid-battle join: hand a live bot seat (pieces and all) to a human.
	 */
	function takeOverBotSeat({ battle, playerId, playerName }) {
		const liveBots = battle.seats.filter(s => {
			if (!s.isAi) return false;
			const record = World.getPlayer(s.seatId);
			return record && !record.eliminated;
		});
		// Back after a dropped connection: reclaim your own army first.
		const seat = liveBots.find(s => String(s.leftBy || '') === String(playerId)) || liveBots[0];
		if (!seat) {
			return { success: false, error: 'No bot seat left to take over — battle is all humans' };
		}

		aiRunner.stopAiPlayer(seat.seatId);
		seat.isAi = false;
		seat.controlledBy = String(playerId);
		delete seat.leftBy;
		delete seat.offlineSince;
		if (playerName) seat.name = playerName;

		const record = World.getPlayer(seat.seatId);
		if (record) {
			record.isComputer = false;
			record.controlledBy = String(playerId);
			record.connected = true;
			if (playerName) record.name = `⚔ ${playerName}`;
			delete record.strategy;
			record.lastActiveAt = Date.now();
		}
		Sessions.setAlias(seat.seatId, String(playerId));
		stampRealPlayer(playerId, battle.id);
		World.markDirty();
		persistence.markDirty();

		const payload = { battle: publicState(battle) };
		emitToSeatHumans(battle, 'battle_lobby_update', payload, { except: playerId });
		// The joiner's client adopts the seat off `battle_started`,
		// exactly as if they had been in the lobby at start time.
		Sessions.emitToPlayerSockets(playerId, 'battle_started', payload);
		emitToSeatHumans(battle, 'server_toast', {
			message: `⚔ ${seat.name} took over a bot in battle ${battle.code}!`,
			tone: 'info',
		}, { except: playerId });

		console.log(`[Battle] ${playerId} took over bot seat ${seat.seatId} in ${battle.code}`);
		return { success: true, battle: publicState(battle), seatId: seat.seatId, tookOverBot: true };
	}

	// ── Quick match ──────────────────────────────────────────────────────

	/**
	 * Find this player a game now: join the oldest open public lobby
	 * (starting it the moment it's full), or open one that bots fill
	 * after QUICKMATCH_WAIT_MS if nobody else turns up.
	 */
	function quickMatch({ playerId, playerName, edition = EDITIONS.STANDARD }) {
		// Viking and standard players are never paired: the edition is a
		// property of the lobby, and a lobby only matches its own.
		const wanted = normaliseEdition(edition);
		for (const battle of battlesForPlayer(playerId)) {
			if (battle.isPublic && battle.status === 'lobby') {
				return { success: true, battle: publicState(battle), seatId: seatFor(battle, playerId).seatId };
			}
		}

		const open = Object.values(battles())
			.filter(b => b && b.isPublic && b.status === 'lobby' && b.seats.length < b.seatCount
				&& battleEdition(b) === wanted
				&& !seatFor(b, playerId))
			.sort((a, b) => a.createdAt - b.createdAt)[0];
		if (open) {
			const joined = joinBattle({ code: open.code, playerId, playerName });
			if (!joined.success) return joined;
			if (open.seats.length >= open.seatCount) {
				const started = startBattle({ battleId: open.id, playerId: open.hostId });
				if (!started.success) return started;
				return { ...joined, battle: started.battle };
			}
			return { ...joined, battle: publicState(open) };
		}

		const created = createBattle({
			hostId: playerId, hostName: playerName, seatCount: QUICKMATCH_SEATS,
			botDifficulty: BOT_PACE.AUTO, mode: BATTLE_MODES.QUICK, edition: wanted,
		});
		if (!created.success) return created;
		const battle = getBattle(created.battle.id);
		battle.isPublic = true;
		battle.autoStartAt = Date.now() + QUICKMATCH_WAIT_MS;
		World.markDirty();
		persistence.markDirty();
		console.log(`[Battle] ${playerId} is looking for a quick match (${battle.code})`);
		return { success: true, battle: publicState(battle), seatId: battle.seats[0].seatId };
	}

	/** How busy Quick match is, for the battle menu. */
	function quickMatchInfo() {
		let looking = 0;
		let playing = 0;
		for (const battle of Object.values(battles())) {
			if (!battle) continue;
			const humans = battle.seats.filter(s => !s.isAi && s.controlledBy && Sessions.isOnline(s.controlledBy)).length;
			if (battle.isPublic && battle.status === 'lobby') looking += humans;
			else if (battle.status === 'active') playing += humans;
		}
		return { looking, playing, waitMs: QUICKMATCH_WAIT_MS };
	}

	/** A public lobby whose wait is over: start it with bots, or drop it if nobody's there. */
	function settleQuickMatchLobby(battle, now) {
		if (!battle.isPublic || now < (battle.autoStartAt || Infinity)) return;
		const anyoneHere = battle.seats.some(s => !s.isAi && s.controlledBy && Sessions.isOnline(s.controlledBy));
		if (!anyoneHere) {
			delete battles()[battle.id];
			clearAllSeatStamps(battle);
			World.markDirty();
			persistence.markDirty();
			console.log(`[Battle] quick match ${battle.code} dropped (nobody waiting)`);
			return;
		}
		const started = startBattle({ battleId: battle.id, playerId: battle.hostId });
		if (!started.success) console.warn(`[Battle] quick match ${battle.code} failed to start: ${started.error}`);
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
				seatId: seatIdFor(battle.id, index),
				index,
				controlledBy: null,
				isAi: true,
				name: `Bot ${index + 1}`,
			});
		}

		battle.slot = slot;
		battle.centre = arenaCentreForSlot(slot);
		battle.playRadius = playRadiusForSeats(battle.seats.length);
		buildArena(battle);
		battle.status = 'active';
		battle.startedAt = Date.now();
		// Sinking covers (since, now], so start just before the first cell.
		if (hasSea(battle)) battle.seaSunkUntil = seaStartMs(battle) - 1;

		World.markDirty();
		persistence.markDirty();
		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });

		const payload = { battle: publicState(battle) };
		emitToSeatHumans(battle, 'battle_started', payload);
		console.log(
			`[Battle] ${battle.code} started at (${battle.centre.x}, ${battle.centre.z}) `
			+ `with ${battle.seats.filter(s => !s.isAi).length} human(s), `
			+ `${battle.seats.filter(s => s.isAi).length} bot(s), ${battle.mode}`
		);
		return { success: true, battle: publicState(battle) };
	}

	function buildArena(battle) {
		const world = World.getWorld();

		// Neutral ring wall. Overwrite whatever might linger from a
		// badly-cleaned previous battle on this slot.
		for (const { x, z } of ringCells(battle.centre, battle.playRadius)) {
			world.board.cells[`${x},${z}`] = [{
				type: 'tetromino',
				player: null,
				battleRing: battle.id,
				color: RING_COLOR,
			}];
		}

		// Fixed difficulties map straight onto the shared AI profiles;
		// 'auto' starts bots at a relaxed default and the sweep retunes
		// their cadence to the humans' measured tempo as the battle runs.
		const chosen = normaliseBotDifficulty(battle.botDifficulty);
		const isAuto = chosen === BOT_PACE.AUTO;
		const botProfile = isAuto ? BOT_DIFFICULTY : chosen;
		const botInterval = isAuto
			? BOT_PACE.DEFAULT_INTERVAL_MS
			: (MIN_COMPUTER_MOVE_INTERVAL_MS[botProfile] || 10000);

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
					difficulty: botProfile,
					minMoveInterval: botInterval,
					strategy: generateComputerStrategy(botProfile),
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

		// Viking: one longship moored behind each queen. After every seat
		// is built, so a mooring can never be overwritten by a zone.
		if (isVikingBattle(battle)) ships.spawnFleet(world, battle);

		gameManager.boardManager.recalculateBoardBoundaries(world.board);
	}

	/**
	 * Leave a battle. In the lobby, the host leaving cancels it and any
	 * other player just frees their seat. Mid-battle, leaving forfeits:
	 * the seat is eliminated and the sweep settles the outcome.
	 *
	 * `battleId` picks WHICH battle to leave when the player holds
	 * several seats; omitted, it falls back to their first battle
	 * (legacy single-battle clients).
	 */
	function leaveBattle({ playerId, battleId = null }) {
		const battle = battleId
			? (getBattle(battleId) || battleByCode(battleId))
			: battleForPlayer(playerId);
		if (!battle || !seatFor(battle, playerId)) {
			return { success: false, error: 'You are not in that battle' };
		}
		const seat = seatFor(battle, playerId);

		if (battle.status === 'lobby') {
			if (String(battle.hostId) === String(playerId)) {
				emitToSeatHumans(battle, 'battle_cancelled', { battleId: battle.id });
				// Delete BEFORE clearing stamps: the stamp fallback scans
				// remaining battles and must not see the one being binned.
				delete battles()[battle.id];
				clearAllSeatStamps(battle);
				console.log(`[Battle] ${battle.code} cancelled by host`);
			} else {
				battle.seats = battle.seats.filter(s => s !== seat);
				battle.seats.forEach((s, i) => { s.index = i; s.seatId = seatIdFor(battle.id, i); });
				stampRealPlayer(playerId, null);
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
				seat.forfeited = true;
				World.markDirty();
				console.log(`[Battle] ${playerId} forfeited seat ${seat.seatId} in ${battle.code}`);
			}
			// The elimination poll picks the forfeit up on the next sweep.
			return { success: true, forfeited: true };
		}

		return { success: true };
	}

	// ── Sweep: eliminations, timeouts, cleanup ───────────────────────────

	/**
	 * 'Auto' bot pacing: sample the humans' cumulative committed-move
	 * count (tetromino placements + chess moves both bump `moveCount`)
	 * on a rolling window and retune every living bot's move interval
	 * to match their tempo. Runs from the 5s sweep — cheap, and the
	 * cadence only needs coarse adjustment.
	 */
	function retuneAutoBots(battle, now) {
		if (normaliseBotDifficulty(battle.botDifficulty) !== BOT_PACE.AUTO) return;
		const botSeats = battle.seats.filter(s => s.isAi);
		if (botSeats.length === 0) return;

		let humanMoves = 0;
		for (const seat of battle.seats) {
			if (seat.isAi) continue;
			const record = World.getPlayer(seat.seatId);
			humanMoves += Number(record?.moveCount) || 0;
		}

		battle.paceSamples = pushPaceSample(battle.paceSamples, { t: now, moves: humanMoves });
		const interval = adaptiveBotIntervalMs(battle.paceSamples);

		for (const seat of botSeats) {
			const record = World.getPlayer(seat.seatId);
			if (!record || record.eliminated) continue;
			if (record.minMoveInterval !== interval) {
				record.minMoveInterval = interval;
			}
		}
	}

	// ── The rising sea (Quick battles) ───────────────────────────────────

	/**
	 * Sink one arena cell: everything standing on it goes into the water
	 * and the cell is deleted. A king caught by the sea is out for good —
	 * no spare lives — and goes off in the usual final detonation.
	 */
	function sinkCell(battle, x, z, sinkAt) {
		const world = World.getWorld();
		const key = `${x},${z}`;
		const kingLifeService = gameManager.kingLifeService || null;
		// A longship on this square goes down with whoever is aboard —
		// note the passenger before the sea removes them.
		const sunkShip = ships.noteSinking(world, battle, x, z);
		const standing = (world.chessPieces || []).filter(p =>
			p && p.position && p.position.x === x && p.position.z === z);
		for (const piece of standing) {
			const isKing = String(piece.type || '').toUpperCase() === 'KING';
			const record = World.getPlayer(piece.player);
			if (isKing && record && !record.eliminated) {
				record.kingLives = 1;
				const seat = battle.seats.find(st => String(st.seatId) === String(piece.player));
				if (seat) {
					seat.drowned = true;
					// The exact moment it went under — the last king to sink
					// wins even if several go within one sweep.
					if (!seat.outAt) seat.outAt = Math.round(sinkAt);
				}
				emitToSeatHumans(battle, 'server_toast', {
					message: `🌊 The sea took ${seat ? `${seat.name}'s` : 'a'} king!`,
					tone: 'info',
				});
			}
			pieces.removePiece(world, piece, {
				reason: pieces.REMOVAL_REASONS.FELL_TO_WATER,
				kingLifeService,
				note: 'the sea rose',
			});
		}
		if (sunkShip) emitToSeatHumans(battle, 'ship_sunk', sunkShip);
		if (world.board.cells[key]) {
			delete world.board.cells[key];
			return true;
		}
		return standing.length > 0;
	}

	/**
	 * Sink every cell whose time has come since the last pass. Sink times
	 * are a pure function of the clock, so a pass after a restart (or a
	 * stalled timer) simply catches up.
	 */
	function seaTick({ now = Date.now() } = {}) {
		let changed = false;
		for (const battle of Object.values(battles())) {
			// Quick-match lobbies start on the second, not the 5 s sweep.
			if (battle && battle.status === 'lobby' && battle.isPublic) {
				settleQuickMatchLobby(battle, now);
				continue;
			}
			if (!battle || battle.status !== 'active' || !hasSea(battle)) continue;
			const since = Number.isFinite(battle.seaSunkUntil) ? battle.seaSunkUntil : seaStartMs(battle) - 1;
			if (now <= since) continue;
			for (const { x, z, t } of cellsSinkingBetween(battle, since, now)) {
				if (sinkCell(battle, x, z, t)) changed = true;
			}
			battle.seaSunkUntil = now;
		}
		if (changed) {
			World.markDirty();
			persistence.markDirty();
			broadcaster.broadcastGameUpdate();
		}
		return changed;
	}

	// ── Dropped connections ──────────────────────────────────────────────

	/**
	 * A human gone too long hands their army to a bot so the battle goes
	 * on. Coming back with the code reclaims the same seat.
	 */
	function handSeatToBot(battle, seat) {
		const realId = seat.controlledBy;
		const record = World.getPlayer(seat.seatId);
		const chosen = normaliseBotDifficulty(battle.botDifficulty);
		const profile = chosen === BOT_PACE.AUTO ? BOT_DIFFICULTY : chosen;
		seat.isAi = true;
		seat.leftBy = realId;
		seat.controlledBy = null;
		delete seat.offlineSince;
		Sessions.clearAlias(seat.seatId);
		if (record) {
			record.isComputer = true;
			record.controlledBy = null;
			record.connected = false;
			record.difficulty = profile;
			record.minMoveInterval = chosen === BOT_PACE.AUTO
				? BOT_PACE.DEFAULT_INTERVAL_MS
				: (MIN_COMPUTER_MOVE_INTERVAL_MS[profile] || 10000);
			record.strategy = generateComputerStrategy(profile);
			record.lastMoveTime = 0;
		}
		aiRunner.startAiPlayer(seat.seatId);
		if (realId) stampRealPlayer(realId, null);
		emitToSeatHumans(battle, 'server_toast', {
			message: `📡 ${seat.name} lost connection — a bot has taken over their army`,
			tone: 'info',
		});
		World.markDirty();
		persistence.markDirty();
		console.log(`[Battle] ${realId} offline — bot took over ${seat.seatId} in ${battle.code}`);
	}

	/** Watch living human seats for dropped connections. */
	function checkConnections(battle, now) {
		for (const seat of battle.seats) {
			if (seat.isAi || !seat.controlledBy || !seatIsAlive(seat)) continue;
			if (Sessions.isOnline(seat.controlledBy)) {
				delete seat.offlineSince;
				continue;
			}
			if (!seat.offlineSince) {
				seat.offlineSince = now;
			} else if (now - seat.offlineSince > OFFLINE_HANDOVER_MS) {
				handSeatToBot(battle, seat);
			}
		}
	}

	/**
	 * Nobody left to play or watch: every human seat is a bot now, or
	 * its player is offline (a living seat gets the handover minute).
	 */
	function isAbandoned(battle, now) {
		return !battle.seats.some(seat => !seat.isAi && seat.controlledBy && (
			Sessions.isOnline(seat.controlledBy)
			|| (seat.offlineSince && now - seat.offlineSince <= OFFLINE_HANDOVER_MS)));
	}

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

	/**
	 * Stamp `outAt` on every seat that has just died, so the standings
	 * can rank seats by how long they lasted. Returns the newly-out seats.
	 */
	function stampKnockouts(battle, now) {
		const out = [];
		for (const seat of battle.seats) {
			if (seat.outAt || seatIsAlive(seat)) continue;
			const record = World.getPlayer(seat.seatId);
			seat.outAt = Number(record?.eliminatedAt) || now;
			out.push(seat);
		}
		return out;
	}

	/** Name of whoever captured this seat's king, if anyone did. */
	function knockedOutBy(battle, seat) {
		const prison = World.getWorld().kingPrison;
		if (!Array.isArray(prison)) return null;
		const entry = prison.slice().reverse()
			.find(e => e && String(e.originalOwner) === String(seat.seatId));
		if (!entry) return null;
		const captor = battle.seats.find(st => String(st.seatId) === String(entry.capturedBy));
		return captor ? captor.name : (World.getPlayer(entry.capturedBy)?.name || null);
	}

	/**
	 * Standings for the end-of-battle scene: survivors first (most pieces
	 * left), then the knocked-out seats, latest out first.
	 */
	function battleResults(battle, now = Date.now()) {
		const world = World.getWorld();
		const piecesLeft = {};
		for (const p of world.chessPieces || []) {
			if (p) piecesLeft[p.player] = (piecesLeft[p.player] || 0) + 1;
		}
		const rows = battle.seats.map(seat => {
			const record = World.getPlayer(seat.seatId);
			const alive = !seat.outAt && seatIsAlive(seat);
			return {
				seatId: seat.seatId,
				name: seat.name,
				isAi: !!seat.isAi,
				controlledBy: seat.isAi ? null : (seat.controlledBy || null),
				alive,
				outAt: seat.outAt || null,
				forfeited: !!seat.forfeited,
				knockedOutBy: alive || seat.forfeited ? null
					: (seat.drowned ? 'the sea' : knockedOutBy(battle, seat)),
				moves: Number(record?.moveCount) || 0,
				captures: Number(record?.captureCount) || 0,
				piecesLeft: piecesLeft[seat.seatId] || 0,
			};
		});
		rows.sort((a, b) => {
			if (a.seatId === battle.winnerSeatId) return -1;
			if (b.seatId === battle.winnerSeatId) return 1;
			if (a.alive !== b.alive) return a.alive ? -1 : 1;
			if (a.alive) return b.piecesLeft - a.piecesLeft;
			return (b.outAt || 0) - (a.outAt || 0);
		});
		rows.forEach((row, i) => { row.place = i + 1; });
		const startedAt = battle.startedAt || battle.createdAt;
		return {
			durationMs: Math.max(0, (battle.finishedAt || now) - startedAt),
			standings: rows,
		};
	}

	/**
	 * The sweep runs every few seconds, so the last kings can drown
	 * within one pass. The one that went under last still wins — unless
	 * they truly went together.
	 */
	function lastKingAboveWater(battle, alive) {
		if (alive.length > 0) return null;
		const byLastOut = battle.seats.filter(seat => seat.outAt)
			.sort((a, b) => b.outAt - a.outAt);
		const [last, next] = byLastOut;
		if (!last || !last.drowned) return null;
		return !next || last.outAt > next.outAt ? last.seatId : null;
	}

	function finishBattle(battle, { reason }) {
		const now = Date.now();
		stampKnockouts(battle, now);
		const alive = battle.seats.filter(seatIsAlive);
		battle.status = 'finished';
		battle.finishedAt = now;
		battle.winnerSeatId = alive.length === 1 ? alive[0].seatId : lastKingAboveWater(battle, alive);

		const payload = { battle: publicState(battle), reason, results: { ...battleResults(battle, now), reason } };
		emitToSeatHumans(battle, 'battle_finished', payload);
		clearAllSeatStamps(battle);

		// Winner toast for the whole world — battles are a spectacle.
		const winnerSeat = battle.seats.find(s => s.seatId === battle.winnerSeatId);
		if (winnerSeat) {
			try {
				io.to(World.getWorldId()).emit('server_toast', {
					// World-wide toast: never include the invite code.
					message: `⚔ ${winnerSeat.name} won a battle!`,
					tone: 'success',
					// Lets the battle's own players skip it (they have the results card).
					battleId: battle.id,
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
		clearAllSeatStamps(battle);

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
		// Longships carry the battle id, not a ring tag; a reused slot
		// must never inherit the last battle's fleet.
		ships.stripBattleShips(world, battle.id);

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
				if (battle.isPublic) {
					settleQuickMatchLobby(battle, now);
					continue;
				}
				if (now - battle.createdAt > LOBBY_TIMEOUT_MS) {
					emitToSeatHumans(battle, 'battle_cancelled', { battleId: battle.id, reason: 'timeout' });
					// Delete before clearing stamps (stamp fallback scans
					// remaining battles).
					delete battles()[battle.id];
					clearAllSeatStamps(battle);
					World.markDirty();
					persistence.markDirty();
					console.log(`[Battle] ${battle.code} lobby timed out`);
				}
				continue;
			}

			if (battle.status === 'active') {
				checkConnections(battle, now);
				const alive = battle.seats.filter(seatIsAlive);
				if (alive.length > 1) {
					// Knocked out while the fight goes on (3-4 seat
					// battles): tell that human where they placed.
					for (const seat of stampKnockouts(battle, now)) {
						if (seat.isAi || seat.forfeited || !seat.controlledBy) continue;
						Sessions.emitToPlayerSockets(seat.controlledBy, 'battle_seat_out', {
							battle: publicState(battle),
							results: battleResults(battle, now),
						});
					}
				}
				if (alive.length <= 1) {
					finishBattle(battle, { reason: 'elimination' });
				} else if (isAbandoned(battle, now)) {
					finishBattle(battle, { reason: 'abandoned' });
				} else if (hasSea(battle) && now > seaEndMs(battle) + SEA_END_GRACE_MS) {
					finishBattle(battle, { reason: 'sea' });
				} else if (now - (battle.startedAt || battle.createdAt) > ACTIVE_TIMEOUT_MS) {
					finishBattle(battle, { reason: 'timeout' });
				} else {
					retuneAutoBots(battle, now);
					// Viking: spot lost ships and rebuild at the moorings.
					if (ships.reconcileShips(World.getWorld(), battle, { now, seatIsAlive })) {
						World.markDirty();
						persistence.markDirty();
						broadcaster.broadcastGameUpdate();
					}
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
			if (!player) continue;
			// Stale real-player stamps (battle gone) must not keep their
			// owner permanently exempt from the ghost sweep.
			if (player.activeBattleId && !getBattle(player.activeBattleId)) {
				delete player.activeBattleId;
				World.markDirty();
			}
			if (!player.battleId) continue;
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
		quickMatch,
		quickMatchInfo,
		startBattle,
		leaveBattle,
		effectivePlayerId,
		battleForPlayer,
		battlesForPlayer,
		battleByCode,
		getBattle,
		publicState,
		tick,
		seaTick,
		init,
		SWEEP_INTERVAL_MS,
		SEA_TICK_MS: SEA.TICK_MS,
	};
}

module.exports = { createBattleManager };

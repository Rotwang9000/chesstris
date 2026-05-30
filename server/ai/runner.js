/**
 * AI player runner.
 *
 * Owns:
 *   • the tick intervals for each AI player
 *   • the king-only self-detonation + respawn workflow
 *   • the helpers for adding individual AI bots and topping the global
 *     game's AI roster up after restoration.
 *
 * Player records (including AI metadata: difficulty, lastMoveTime,
 * minMoveInterval, strategy) live on the world via
 * `World.upsertPlayer`.  This module never owns its own state besides
 * the active `setInterval` handles.
 */

const { v4: uuidv4 } = require('uuid');

const World = require('../world/World');
const { validatePlayerName } = require('../utils/validation');
const {
	COMPUTER_DIFFICULTY,
	MIN_COMPUTER_MOVE_INTERVAL_MS,
	AI_ROSTER_TEMPLATE,
	generateComputerStrategy,
	labelForDifficulty,
	checkForThreatenedPieces,
	isKingExposed,
	hasAttackOpportunity,
} = require('./strategy');

const TICK_CHECK_MS = 1000;
const RESPAWN_DELAY_MS = 5000;
const AI_TARGET_COUNT = 3;
/** Respawn when an AI has this many pieces or fewer and no owned terrain. */
const AI_MAROONED_PIECE_MAX = 4;
const AI_STUCK_NO_OP_THRESHOLD = 6;

function createAiRunner({
	io,
	gameManager,
	broadcaster,
	integrityService,
	aiActions,
	kingCaptureService,
	kingDetonationService,
	checkService = null,
	persistence,
	spectatorRegistry,
}) {
	if (!io) throw new Error('createAiRunner: io required');
	if (!gameManager) throw new Error('createAiRunner: gameManager required');
	if (!broadcaster) throw new Error('createAiRunner: broadcaster required');
	if (!integrityService) throw new Error('createAiRunner: integrityService required');
	if (!aiActions) throw new Error('createAiRunner: aiActions required');
	if (!kingCaptureService) throw new Error('createAiRunner: kingCaptureService required');
	if (!kingDetonationService) throw new Error('createAiRunner: kingDetonationService required');
	if (!persistence) throw new Error('createAiRunner: persistence required');

	const tickIntervals = new Map();

	// Dev stress-test escape hatch: when true, `trimDuplicateAis` is a
	// no-op so a tester can pile on many bots of the same difficulty
	// without the continuous trim collapsing them back to one-per-tier.
	// Never set in production (guarded at the socket handler).
	let trimSuspended = false;
	function setTrimSuspended(value) { trimSuspended = !!value; }

	function startAiPlayer(playerId) {
		stopAiPlayer(playerId);

		const interval = setInterval(() => {
			const player = World.getPlayer(playerId);
			if (!player) {
				stopAiPlayer(playerId);
				return;
			}

			const now = Date.now();
			if (now - (player.lastMoveTime || 0) < (player.minMoveInterval || 10000)) return;

			performComputerAction(playerId);
			player.lastMoveTime = now;
			player.consecutiveMoves = (player.consecutiveMoves || 0) + 1;
		}, TICK_CHECK_MS);

		tickIntervals.set(playerId, interval);
	}

	function stopAiPlayer(playerId) {
		const handle = tickIntervals.get(playerId);
		if (handle) {
			clearInterval(handle);
			tickIntervals.delete(playerId);
		}
	}

	function aiOwnsTerrain(world, computerId) {
		const cells = world.board?.cells;
		if (!cells) return false;
		for (const cellContents of Object.values(cells)) {
			if (!Array.isArray(cellContents)) continue;
			if (cellContents.some(
				item => item && String(item.player) === String(computerId) && item.type !== 'home'
			)) {
				return true;
			}
		}
		return false;
	}

	function performComputerAction(computerId) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer || !computerPlayer.isComputer) return;
		if (computerPlayer.pendingRespawn) return;

		// Highest-priority response: if this AI is the defender in a
		// pending Check, try to escape NOW. Tetromino placement and
		// other strategic moves are useless if the king is about to
		// die — and they'd be rejected by the chess handler anyway
		// (only escape moves are accepted while in check).
		if (checkService && world.pendingCheck
			&& String(world.pendingCheck.defenderId) === String(computerId)) {
			const escaped = aiActions.performCheckEscape(
				computerId, checkService, kingCaptureService
			);
			if (escaped) return;
			// No escape available — let the deadline timer handle it.
			return;
		}

		// AI players that were marked `eliminated` (e.g. by the
		// ghost-sweep or by a previous king capture that never finished
		// its respawn) used to spin forever doing nothing because every
		// tick returned here. Recover them automatically: if they still
		// have a king on the board, clear the flag; otherwise kick off a
		// fresh respawn so the seat is filled again.
		if (computerPlayer.eliminated) {
			const aiPieces = (world.chessPieces || []).filter(
				p => p && String(p.player) === String(computerId)
			);
			const kingPiece = aiPieces.find(p => String(p.type).toUpperCase() === 'KING');
			if (kingPiece) {
				console.log(
					`[AI] ${computerId} was flagged eliminated but still has a king — clearing flag.`
				);
				computerPlayer.eliminated = false;
				delete computerPlayer.eliminatedAt;
				World.markDirty();
			} else {
				console.log(`[AI] ${computerId} eliminated with no king — respawning fresh seat.`);
				computerPlayer.pendingRespawn = true;
				const difficulty = computerPlayer.difficulty || COMPUTER_DIFFICULTY.MEDIUM;
				const minMoveInterval = computerPlayer.minMoveInterval
					|| MIN_COMPUTER_MOVE_INTERVAL_MS[difficulty]
					|| 10000;
				setTimeout(() => respawnAfterDetonation(computerId, difficulty, minMoveInterval), 0);
				return;
			}
		}

		const strategy = computerPlayer.strategy || generateComputerStrategy(computerPlayer.difficulty);

		const aiPieces = (world.chessPieces || []).filter(
			p => p && String(p.player) === String(computerId)
		);
		const onlyKingLeft = aiPieces.length === 1
			&& String(aiPieces[0].type).toUpperCase() === 'KING';

		if (onlyKingLeft) {
			handleAiKingOnlyDetonation(computerId, aiPieces[0]);
			return;
		}

		const kingPiece = aiPieces.find(
			p => String(p.type).toUpperCase() === 'KING'
		);
		if (aiPieces.length <= AI_MAROONED_PIECE_MAX && !aiOwnsTerrain(world, computerId) && kingPiece) {
			console.log(
				`[AI] ${computerId} marooned (${aiPieces.length} pieces, no cells) — respawning.`
			);
			handleAiKingOnlyDetonation(computerId, kingPiece);
			return;
		}

		let actionType;
		if (checkForThreatenedPieces(world, computerId) && Math.random() < strategy.defensiveness) {
			actionType = 'chess';
		} else if (isKingExposed(world, computerId) && Math.random() < strategy.kingProtection) {
			actionType = 'tetromino';
		} else if (hasAttackOpportunity(world, computerId) && Math.random() < strategy.aggressiveness) {
			actionType = 'chess';
		} else {
			actionType = Math.random() < strategy.buildSpeed ? 'tetromino' : 'chess';
		}

		let acted = false;
		if (actionType === 'tetromino') {
			acted = !!aiActions.performStrategicTetrominoPlacement(computerId);
		} else {
			acted = !!aiActions.performStrategicChessMove(computerId, kingCaptureService, checkService);
		}

		if (acted) {
			computerPlayer.aiStuckTicks = 0;
			return;
		}

		computerPlayer.aiStuckTicks = (computerPlayer.aiStuckTicks || 0) + 1;
		if (computerPlayer.aiStuckTicks >= AI_STUCK_NO_OP_THRESHOLD && kingPiece) {
			// Only RECYCLE (self-detonate + respawn) an AI that's
			// genuinely out of options. An AI that still has a healthy
			// roster AND owns terrain shouldn't blow itself up just
			// because it whiffed a handful of move attempts — that
			// produced the "AI suicides right after I capture one of
			// its pieces, even though it had loads left" report. Give
			// it a clean slate and let it try again next tick; the
			// marooned / king-only guards above already catch the
			// truly hopeless cases.
			const ownsTerrain = aiOwnsTerrain(world, computerId);
			const hasFightingForce = aiPieces.length > AI_MAROONED_PIECE_MAX;
			computerPlayer.aiStuckTicks = 0;
			if (ownsTerrain && hasFightingForce) {
				console.log(
					`[AI] ${computerId} stuck (idle) but still has ${aiPieces.length} ` +
					`pieces and owns terrain — skipping turn instead of detonating.`
				);
			} else {
				console.log(
					`[AI] ${computerId} stuck and low on resources ` +
					`(${aiPieces.length} pieces, terrain=${ownsTerrain}) — recycling.`
				);
				handleAiKingOnlyDetonation(computerId, kingPiece);
			}
		}
	}

	function handleAiKingOnlyDetonation(computerId, kingPiece) {
		const computerPlayer = World.getPlayer(computerId);
		if (!computerPlayer || computerPlayer.pendingRespawn) return;
		computerPlayer.pendingRespawn = true;
		computerPlayer.eliminated = true;

		console.log(`[AI] ${computerId} has only a king remaining – detonating Lemmings-style.`);
		stopAiPlayer(computerId);

		const difficulty = computerPlayer.difficulty || COMPUTER_DIFFICULTY.MEDIUM;
		const minMoveInterval = computerPlayer.minMoveInterval
			|| MIN_COMPUTER_MOVE_INTERVAL_MS[difficulty]
			|| 10000;

		const result = kingDetonationService.detonateKing({
			playerId: computerId,
			kingPieceId: kingPiece.id,
			reason: 'ai_lone_king',
			onComplete: () => {
				setTimeout(() => {
					respawnAfterDetonation(computerId, difficulty, minMoveInterval);
				}, RESPAWN_DELAY_MS);
			},
		});

		if (!result.success) {
			console.warn(`[AI] Failed king self-detonation for ${computerId}: ${result.error || 'unknown'}`);
			computerPlayer.pendingRespawn = false;
			computerPlayer.eliminated = false;
			startAiPlayer(computerId);
		}
	}

	function respawnAfterDetonation(oldId, difficulty, minMoveInterval) {
		const world = World.getWorld();
		if (!world) return;

		const newId = `ai-${labelForDifficulty(difficulty).toLowerCase()}-${uuidv4().substring(0, 8)}`;
		const aiName = validatePlayerName(`AI ${labelForDifficulty(difficulty)}`);

		// Drop the old bot completely (removes its world entry and any
		// remaining tick interval), then register the replacement fresh.
		stopAiPlayer(oldId);
		World.removePlayer(oldId);
		registerAi(newId, difficulty, minMoveInterval, aiName);

		persistence.markDirty();
		broadcaster.broadcastGameUpdate({ forceFullUpdate: true });
		console.log(`[AI] Respawned ${aiName} (${newId}) replacing ${oldId}`);
	}

	function registerAi(id, difficulty, minMoveInterval, name = null) {
		const validatedName = validatePlayerName(name || `AI ${labelForDifficulty(difficulty)}`);

		// register first so home zone + pieces are created
		const registration = gameManager.registerPlayer(World.GLOBAL_WORLD_ID, id, validatedName, false);

		World.upsertPlayer(id, {
			name: validatedName,
			isComputer: true,
			difficulty,
			minMoveInterval,
			lastMoveTime: 0,
			consecutiveMoves: 0,
			strategy: generateComputerStrategy(difficulty),
		});

		startAiPlayer(id);

		io.to(World.GLOBAL_WORLD_ID).emit('player_joined', {
			playerId: id,
			playerName: validatedName,
			gameId: World.GLOBAL_WORLD_ID,
			isComputer: true,
			difficulty,
			players: broadcaster.buildPlayersList(),
		});

		console.log(`AI opponent ${validatedName} (${difficulty}, ${id}) added to global game`);
		return registration;
	}

	/**
	 * Convenience: add a single computer player with a given difficulty.
	 */
	function addComputerPlayer(difficulty = COMPUTER_DIFFICULTY.MEDIUM) {
		const valid = Object.values(COMPUTER_DIFFICULTY).includes(difficulty)
			? difficulty
			: COMPUTER_DIFFICULTY.MEDIUM;

		const id = `ai-${labelForDifficulty(valid).toLowerCase()}-${uuidv4().substring(0, 8)}`;
		const minMoveInterval = MIN_COMPUTER_MOVE_INTERVAL_MS[valid] || 10000;
		registerAi(id, valid, minMoveInterval);
		return id;
	}

	/**
	 * Make sure the world has the full Novice/Standard/Expert roster.
	 * Called on boot after persistence has restored.  Also (re)attaches
	 * tick intervals to any AI players already in the world (their
	 * strategy callbacks aren't persisted).
	 */
	/**
	 * Remove every AI player except the strongest representative for
	 * each difficulty in `AI_ROSTER_TEMPLATE`. "Strongest" is defined
	 * as: most chess pieces, with most recent activity used to break
	 * ties. Duplicate AIs accumulate when respawn races or persistence
	 * restores stale records — without this trim the world can carry
	 * 5+ "AI Standard" littering the map.
	 *
	 * @returns {number} number of AI players removed
	 */
	function trimDuplicateAis() {
		if (trimSuspended) return 0;
		const world = World.getWorld();
		if (!world) return 0;
		const allAi = World.listComputerPlayers();
		if (allAi.length === 0) return 0;

		// Bucket by difficulty
		const byDifficulty = new Map();
		const pieceCount = new Map();
		for (const piece of (world.chessPieces || [])) {
			if (!piece || !piece.player) continue;
			pieceCount.set(String(piece.player), (pieceCount.get(String(piece.player)) || 0) + 1);
		}
		for (const ai of allAi) {
			const key = ai.difficulty || 'medium';
			if (!byDifficulty.has(key)) byDifficulty.set(key, []);
			byDifficulty.get(key).push(ai);
		}

		let removed = 0;
		for (const [, list] of byDifficulty.entries()) {
			if (list.length <= 1) continue;
			// Sort: most pieces first, then most recent activity.
			list.sort((a, b) => {
				const pa = pieceCount.get(String(a.id)) || 0;
				const pb = pieceCount.get(String(b.id)) || 0;
				if (pa !== pb) return pb - pa;
				const ta = Number(a.lastChessMoveAt || a.lastTetrominoPlacementAt || 0);
				const tb = Number(b.lastChessMoveAt || b.lastTetrominoPlacementAt || 0);
				return tb - ta;
			});
			// Keep [0], remove the rest.
			for (let i = 1; i < list.length; i++) {
				const dupe = list[i];
				console.log(
					`[AI] Trimming duplicate ${dupe.name || dupe.id} (${dupe.difficulty}) ` +
					`— keeping ${list[0].name || list[0].id}.`,
				);
				try { stopAiPlayer(dupe.id); } catch (_e) { /* ignore */ }
				try { World.removePlayer(dupe.id); } catch (_e) { /* ignore */ }
				removed++;
			}
		}

		if (removed > 0) {
			persistence.markDirty();
			try { broadcaster.broadcastGameUpdate({ forceFullUpdate: true }); }
			catch (_e) { /* best-effort */ }
		}
		return removed;
	}

	function ensureRoster() {
		const world = World.getWorld();
		if (!world) return;

		// Trim first so the top-up logic below sees a clean count.
		trimDuplicateAis();

		const existingAi = World.listComputerPlayers();
		for (const ai of existingAi) {
			if (!ai.strategy) ai.strategy = generateComputerStrategy(ai.difficulty || 'medium');
			// Stale `pendingRespawn` from before a restart would keep the
			// AI inert forever. The respawn setTimeout is gone, so reset
			// it now — `performComputerAction` will respawn properly if
			// the AI truly has no king.
			if (ai.pendingRespawn) {
				console.log(`[AI] Clearing stale pendingRespawn on ${ai.id} during boot.`);
				ai.pendingRespawn = false;
			}
			startAiPlayer(ai.id);
		}

		const usedDifficulties = new Set(existingAi.map(a => a.difficulty));
		let needed = AI_TARGET_COUNT - existingAi.length;
		if (needed <= 0) return;

		for (const tmpl of AI_ROSTER_TEMPLATE) {
			if (needed <= 0) break;
			if (usedDifficulties.has(tmpl.difficulty)) continue;

			const id = `ai-${tmpl.label.toLowerCase()}-${uuidv4().substring(0, 8)}`;
			const name = validatePlayerName(`AI ${tmpl.label}`);
			registerAi(id, tmpl.difficulty, tmpl.interval, name);
			console.log(`[Startup] Topped-up AI: ${name} (${tmpl.difficulty})`);
			needed--;
		}
	}

	function stopAll() {
		for (const interval of tickIntervals.values()) {
			clearInterval(interval);
		}
		tickIntervals.clear();
	}

	return {
		startAiPlayer,
		stopAiPlayer,
		performComputerAction,
		registerAi,
		addComputerPlayer,
		ensureRoster,
		trimDuplicateAis,
		setTrimSuspended,
		stopAll,
	};
}

module.exports = { createAiRunner };

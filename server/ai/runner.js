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

function createAiRunner({
	io,
	gameManager,
	broadcaster,
	integrityService,
	aiActions,
	kingCaptureService,
	kingDetonationService,
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

	function performComputerAction(computerId) {
		const world = World.getWorld();
		const computerPlayer = World.getPlayer(computerId);
		if (!world || !computerPlayer || !computerPlayer.isComputer) return;

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

		if (actionType === 'tetromino') {
			aiActions.performStrategicTetrominoPlacement(computerId);
		} else {
			aiActions.performStrategicChessMove(computerId, kingCaptureService);
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
	function ensureRoster() {
		const world = World.getWorld();
		if (!world) return;

		const existingAi = World.listComputerPlayers();
		for (const ai of existingAi) {
			if (!ai.strategy) ai.strategy = generateComputerStrategy(ai.difficulty || 'medium');
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
		stopAll,
	};
}

module.exports = { createAiRunner };

/**
 * The game's services, wired together: the world logic, kings, AI,
 * battles and the per-socket connection handler.
 *
 * Shared by the Node server (`bootstrap.js`) and the offline engine
 * (`offline/engine.js`), which runs this same code in a Web Worker with
 * an in-memory stand-in for socket.io. Anything Node-only (HTTP, the
 * Express app, disk persistence, boats with advertiser sails) stays in
 * the caller and comes in through the arguments.
 *
 * Composition order matters:
 *
 *   broadcasts → integrity → home-zones → king → AI → lifecycle → battles
 *   (each layer depends on those above it)
 */

const World = require('./world/World');
const logger = require('./observability/logger');
const metrics = require('./observability/metrics');
const { GameManager } = require('./game');
const { createBroadcaster } = require('./net/broadcasts');
const { createSpectatorRegistry } = require('./net/spectators');
const { createIntegrityService } = require('./world/integrity');
const { createHomeZoneDegradationService } = require('./world/homeZones');
const { createLifecycleService } = require('./world/lifecycle');
const { createWorldGravityService, GRAVITY_TICK_MS } = require('./world/gravity');
const { createGhostPlayerSweepService } = require('./world/ghostPlayerSweep');
const { createDormantKingdomService } = require('./world/dormantKingdom');
const { createPauseService } = require('./world/pause');
const { createKingCaptureService } = require('./king/capture');
const { createCheckService } = require('./king/checkService');
const { createKingDuelService } = require('./king/duels');
const { createKingDetonationService } = require('./king/detonation');
const { createKingLifeService } = require('./king/kingLives');
const { createLoneKingSweepService } = require('./king/loneKingSweep');
const { createMissingKingSweepService } = require('./king/missingKingSweep');
const { createActivityLogService } = require('./world/activityLog');
const { createLineClearService } = require('./game/LineClearService');
const { createPowerUpManager } = require('./game/PowerUpManager');
const { createAiActions } = require('./ai/actions');
const { createAiRunner } = require('./ai/runner');
const { createBattleManager } = require('./battle/BattleManager');
const { createConnectionHandler } = require('./sockets/connection');

const HOME_ZONE_DEGRADATION_CHECK_MS = 30000;
const WORLD_INTEGRITY_CHECK_MS = 10000;
const LONE_KING_SWEEP_MS = 15000;
const GHOST_PLAYER_SWEEP_MS = 20000;
const DORMANT_KINGDOM_CHECK_MS = 30 * 60 * 1000;
const POWER_UP_TICK_MS = 45000;
const METRICS_TICK_MS = 5000;

/**
 * @param {Object} deps
 * @param {Object} deps.io           socket.io server (or the offline stand-in)
 * @param {Object} deps.persistence  disk persistence (or an in-memory stub)
 * @param {Object} [deps.boatManager]
 * @param {Function} [deps.getBundleVersion]
 */
function createServices({ io, persistence, boatManager = null, getBundleVersion = () => '' }) {
	const gameManager = new GameManager();

	// ── Services ──────────────────────────────────────────────────────────
	const broadcaster = createBroadcaster({ io, persistence });
	// Spectators get the same whitelisted state everyone else gets —
	// never the raw world (battle codes, bags, session hashes).
	const spectatorRegistry = createSpectatorRegistry({
		buildPayload: (world) => ({
			state: broadcaster.buildGameStatePayload(world),
			players: broadcaster.buildPlayersList(world),
		}),
	});
	const activityLog = createActivityLogService({ io, persistence });

	// Expose the activity log to every subsystem reachable through
	// `gameManager` so per-piece removals (decay, integrity drops,
	// AI captures, king-detonation collateral) can record events
	// without us having to thread the dependency through every
	// signature.
	gameManager.activityLog = activityLog;
	gameManager.islandManager.activityLog = activityLog;
	gameManager.chessManager.activityLog = activityLog;
	gameManager.tetrominoManager.activityLog = activityLog;

	const integrityService = createIntegrityService({
		gameManager,
		broadcaster,
		persistence,
		activityLog,
	});

	const homeZoneDegradation = createHomeZoneDegradationService({
		gameManager,
		broadcaster,
		persistence,
	});

	const pauseService = createPauseService({
		io,
		broadcaster,
		persistence,
	});

	const worldGravity = createWorldGravityService({
		boardManager: gameManager.boardManager,
		broadcaster,
		persistence,
	});

	const kingCaptureService = createKingCaptureService({
		io,
		gameManager,
		broadcaster,
		activityLog,
	});

	const checkService = createCheckService({
		io,
		gameManager,
		broadcaster,
		kingCaptureService,
		activityLog,
	});

	const kingDuelService = createKingDuelService({
		io,
		kingCaptureService,
	});
	// Late-bind the duel service into the capture service so the shared
	// `resolveKingCapture` entry-point can hand off to a King's Duel when
	// two kings fall within the simultaneous-capture window. (Avoids a
	// constructor-time circular dependency between the two services.)
	if (typeof kingCaptureService.setDuelService === 'function') {
		kingCaptureService.setDuelService(kingDuelService);
	}

	const kingDetonationService = createKingDetonationService({
		io,
		gameManager,
		broadcaster,
		integrityService,
		persistence,
		activityLog,
	});

	const kingLifeService = createKingLifeService({
		io,
		broadcaster,
		persistence,
		activityLog,
		// When a king runs out of lives the final death plays the same
		// lemming-style detonation as a voluntary/lone-king self-destruct,
		// so the player's pieces and cells go out with drama instead of
		// the king silently vanishing.
		kingDetonationService,
	});
	// Expose the king-life service on the GameManager so the deep
	// removePiece callers (BoardManager.settleAirbornePieces,
	// IslandManager.checkForIslandsAfterRowClear, integrity sweep)
	// can pass it into pieces.removePiece without us threading a
	// fresh constructor parameter through five layers of classes.
	gameManager.kingLifeService = kingLifeService;
	gameManager.boardManager.kingLifeService = kingLifeService;
	gameManager.islandManager.kingLifeService = kingLifeService;

	const lineClearService = createLineClearService({
		io,
		gameManager,
		broadcaster,
		integrityService,
		persistence,
		activityLog,
	});

	const loneKingSweep = createLoneKingSweepService({
		kingDetonationService,
		broadcaster,
		persistence,
		activityLog,
	});

	const missingKingSweep = createMissingKingSweepService({
		broadcaster,
		persistence,
	});

	const powerUpManager = createPowerUpManager({
		io,
		broadcaster,
		persistence,
		activityLog,
	});

	const aiActions = createAiActions({
		io,
		gameManager,
		broadcaster,
		integrityService,
		spectatorRegistry,
		lineClearService,
		powerUpManager,
	});

	const aiRunner = createAiRunner({
		io,
		gameManager,
		broadcaster,
		integrityService,
		aiActions,
		kingCaptureService,
		kingDetonationService,
		checkService,
		persistence,
		spectatorRegistry,
	});

	const lifecycleService = createLifecycleService({
		io,
		gameManager,
		broadcaster,
		integrityService,
		homeZoneDegradation,
		aiRunner,
		persistence,
		spectatorRegistry,
		activityLog,
	});

	const ghostPlayerSweep = createGhostPlayerSweepService({
		broadcaster,
		persistence,
		lifecycleService,
		aiRunner,
		activityLog,
	});

	const dormantKingdom = createDormantKingdomService({
		gameManager,
		broadcaster,
		persistence,
		integrityService,
	});

	const battleManager = createBattleManager({
		gameManager,
		aiRunner,
		broadcaster,
		persistence,
		lifecycleService,
		io,
	});

	// ── Sockets ───────────────────────────────────────────────────────────
	const handleConnection = createConnectionHandler({
		io,
		gameManager,
		broadcaster,
		integrityService,
		lifecycleService,
		kingCaptureService,
		kingDuelService,
		kingDetonationService,
		checkService,
		lineClearService,
		powerUpManager,
		aiRunner,
		spectatorRegistry,
		persistence,
		activityLog,
		pauseService,
		boatManager,
		missingKingSweep,
		battleManager,
		dormantKingdom,
		getBundleVersion,
	});

	return {
		gameManager,
		broadcaster,
		spectatorRegistry,
		activityLog,
		integrityService,
		homeZoneDegradation,
		pauseService,
		worldGravity,
		kingCaptureService,
		checkService,
		kingDuelService,
		kingDetonationService,
		kingLifeService,
		lineClearService,
		loneKingSweep,
		missingKingSweep,
		powerUpManager,
		aiActions,
		aiRunner,
		lifecycleService,
		ghostPlayerSweep,
		dormantKingdom,
		battleManager,
		handleConnection,
	};
}

/** Start the periodic sweeps and ticks. Returns the interval handles. */
function startServiceTimers(services) {
	const {
		homeZoneDegradation, integrityService, worldGravity, loneKingSweep,
		ghostPlayerSweep, dormantKingdom, aiRunner, missingKingSweep,
		powerUpManager, battleManager,
	} = services;
	return [
	setInterval(() => homeZoneDegradation.tick(), HOME_ZONE_DEGRADATION_CHECK_MS),
	setInterval(
		() => integrityService.processWorldIntegrityMaintenance({
			emitAnimation: true,
			broadcast: true,
		}),
		WORLD_INTEGRITY_CHECK_MS
	),
	setInterval(() => worldGravity.tick(), GRAVITY_TICK_MS),
	setInterval(() => loneKingSweep.tick(), LONE_KING_SWEEP_MS),
	setInterval(() => ghostPlayerSweep.tick(), GHOST_PLAYER_SWEEP_MS),
	setInterval(() => {
		try { dormantKingdom.tick(); }
		catch (err) { logger.warn({ err: err.message }, 'dormant kingdom tick failed'); }
	}, DORMANT_KINGDOM_CHECK_MS),
	// Continuously trim duplicate AI players (e.g. when respawn
	// races leave extra "AI Standard" littering the board). Cheap
	// enough to run at the same cadence as the ghost sweep.
	setInterval(() => {
		try { aiRunner.trimDuplicateAis(); }
		catch (err) { logger.warn({ err: err.message }, 'AI trim tick failed'); }
	}, GHOST_PLAYER_SWEEP_MS),
	// Rescue stuck players (missing king + pieces, not eliminated)
	// and dedupe chess pieces on a slow cadence. Cheap; idempotent.
	setInterval(() => {
		try { missingKingSweep.tick(); }
		catch (err) { logger.warn({ err: err.message }, 'missing-king sweep tick failed'); }
	}, GHOST_PLAYER_SWEEP_MS * 3),
	setInterval(() => powerUpManager.tick(), POWER_UP_TICK_MS),
	setInterval(() => {
		try { battleManager.tick(); }
		catch (err) { logger.warn({ err: err.message }, 'battle sweep tick failed'); }
	}, battleManager.SWEEP_INTERVAL_MS),
	setInterval(() => {
		try { battleManager.seaTick(); }
		catch (err) { logger.warn({ err: err.message }, 'battle sea tick failed'); }
	}, battleManager.SEA_TICK_MS),
	setInterval(() => {
		try { metrics.refreshWorldGauges(World.getWorld()); }
		catch (err) { logger.warn({ err: err.message }, 'metrics tick failed'); }
	}, METRICS_TICK_MS),
	];
}

module.exports = { createServices, startServiceTimers };

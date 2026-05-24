/**
 * Startup orchestration.  Wires the world, the services and the socket
 * layer together, then returns a `{ app, server, io }` triple plus a
 * graceful-shutdown handler.
 *
 * Composition order matters:
 *
 *   World          — singleton state, restored from disk
 *   Services       — broadcasts → integrity → home-zones → king → AI →
 *                    lifecycle (each layer depends on those above it)
 *   Sockets        — register handlers on every new connection
 *   Timers         — auto-save, home-zone degradation, integrity sweep
 */

const http = require('http');
const socketIO = require('socket.io');

const persistence = require('./persistence');
const { parseAllowedOrigins, isOriginAllowed } = require('./security/origins');
const metrics = require('./observability/metrics');
const logger = require('./observability/logger');
const sentry = require('./observability/sentry');
const World = require('./world/World');

// Initialise Sentry first so anything that fails during the rest of
// the bootstrap gets reported. Safe to call early — does nothing if
// SENTRY_DSN isn't set.
sentry.initSentry();
sentry.installProcessHandlers();
const Sessions = require('./world/Sessions');
const Disconnects = require('./world/Disconnects');

const { GameManager } = require('./game');
const { createBroadcaster } = require('./net/broadcasts');
const { createSpectatorRegistry } = require('./net/spectators');
const { createIntegrityService } = require('./world/integrity');
const { createHomeZoneDegradationService } = require('./world/homeZones');
const { createLifecycleService } = require('./world/lifecycle');
const { createWorldGravityService, GRAVITY_TICK_MS } = require('./world/gravity');
const { createGhostPlayerSweepService } = require('./world/ghostPlayerSweep');
const { createPauseService } = require('./world/pause');
const { createBoatManager } = require('./world/boats');
const advertisersRouter = require('../routes/advertisers');
const { createKingCaptureService } = require('./king/capture');
const { createKingDuelService } = require('./king/duels');
const { createKingDetonationService } = require('./king/detonation');
const { createKingLifeService } = require('./king/kingLives');
const { createLoneKingSweepService } = require('./king/loneKingSweep');
const { createActivityLogService } = require('./world/activityLog');
const { createLineClearService } = require('./game/LineClearService');
const { createPowerUpManager } = require('./game/PowerUpManager');
const { createAiActions } = require('./ai/actions');
const { createAiRunner } = require('./ai/runner');
const { createConnectionHandler } = require('./sockets/connection');

const { createApp } = require('./app');

const HOME_ZONE_DEGRADATION_CHECK_MS = 30000;
const WORLD_INTEGRITY_CHECK_MS = 10000;
const LONE_KING_SWEEP_MS = 15000;
const GHOST_PLAYER_SWEEP_MS = 20000;
const POWER_UP_TICK_MS = 45000;
const METRICS_TICK_MS = 5000;

function bootstrap({ projectRoot = process.cwd() } = {}) {
	const app = createApp({ projectRoot });
	const server = http.createServer(app);

	// Same allowlist as the Express CORS layer. In production the
	// browser refuses Socket.IO handshakes from origins not in this
	// list; in development localhost on any port is allowed so the
	// dev tools work without `ALLOWED_ORIGIN` being set.
	const isDevelopment = process.env.NODE_ENV !== 'production';
	const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGIN);
	const io = socketIO(server, {
		cors: {
			origin(origin, callback) {
				if (!origin) return callback(null, true);
				if (isOriginAllowed(origin, allowedOrigins, { allowLocalhost: isDevelopment })) {
					return callback(null, true);
				}
				return callback(new Error(`Origin not allowed: ${origin}`), false);
			},
			credentials: true,
		},
		// Trim runaway clients: don't keep a half-open transport
		// alive forever.
		pingInterval: 25_000,
		pingTimeout: 20_000,
	});

	const gameManager = new GameManager();

	// ── Services ──────────────────────────────────────────────────────────
	const broadcaster = createBroadcaster({ io, persistence });
	const spectatorRegistry = createSpectatorRegistry();
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

	// Viking longships drifting around the playable area. The
	// advertisers router exposes a `pickAdvertiserForBoat` helper
	// that round-robins through the active bid ranking — boats
	// pull a fresh sail banner every ~90s from it.
	const boatManager = createBoatManager({
		io,
		pickAdvertiser:
			typeof advertisersRouter.pickAdvertiserForBoat === 'function'
				? advertisersRouter.pickAdvertiserForBoat
				: null,
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

	const kingDuelService = createKingDuelService({
		io,
		kingCaptureService,
	});

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

	// ── World restore ──────────────────────────────────────────────────────
	const snapshot = persistence.loadWorld();
	if (snapshot) {
		try {
			persistence.restoreWorld(snapshot);
		} catch (error) {
			console.warn('[Startup] World restore failed, creating fresh world:', error.message);
			lifecycleService.applyWorldSettings({});
		}
	} else {
		lifecycleService.applyWorldSettings({});
	}

	// Eagerly reap any persisted-yet-dead players right at boot so the
	// first joiner doesn't get pushed miles away by a corpse the
	// previous session never cleaned up. The user reported this
	// directly: "I spawn into a new game and was miles away from any
	// other player". Has to happen BEFORE ensureRoster so the topped-up
	// AI roster doesn't get its slots stolen by ghost AI records.
	ghostPlayerSweep.reapImmediately();
	aiRunner.ensureRoster();
	integrityService.processWorldIntegrityMaintenance({ emitAnimation: false, broadcast: false });

	// Kick off the longship fleet. `start` spawns the boats and
	// arms the internal tick + broadcast intervals.
	boatManager.start();

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
		lineClearService,
		powerUpManager,
		aiRunner,
		spectatorRegistry,
		persistence,
		activityLog,
		pauseService,
		boatManager,
	});
	io.on('connection', socket => {
		metrics.setSocketCount(io.engine.clientsCount);
		socket.on('disconnect', () => metrics.setSocketCount(io.engine.clientsCount));
		handleConnection(socket);
	});

	// ── Timers ────────────────────────────────────────────────────────────
	const timers = [
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
		setInterval(() => powerUpManager.tick(), POWER_UP_TICK_MS),
		setInterval(() => {
			try { metrics.refreshWorldGauges(World.getWorld()); }
			catch (err) { logger.warn({ err: err.message }, 'metrics tick failed'); }
		}, METRICS_TICK_MS),
	];
	persistence.startAutoSave();

	// ── Graceful shutdown ─────────────────────────────────────────────────
	function shutdown(signal) {
		console.log(`\n[Shutdown] Received ${signal}, saving world...`);
		for (const t of timers) clearInterval(t);
		aiRunner.stopAll();
		persistence.stopAutoSave();
		persistence.saveWorldSync();
		Disconnects.clearAll();
		kingDuelService.reset();
		homeZoneDegradation.reset();
		loneKingSweep.reset();
		ghostPlayerSweep.reset();
		powerUpManager.reset();
		pauseService.shutdown();
		boatManager.stop();
		Sessions.clearAll && Sessions.clearAll();
		process.exit(0);
	}

	process.once('SIGINT', () => shutdown('SIGINT'));
	process.once('SIGTERM', () => shutdown('SIGTERM'));

	return { app, server, io, shutdown };
}

module.exports = { bootstrap };

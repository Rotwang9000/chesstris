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
const World = require('./world/World');
const Sessions = require('./world/Sessions');
const Disconnects = require('./world/Disconnects');

const { GameManager } = require('./game');
const { createBroadcaster } = require('./net/broadcasts');
const { createSpectatorRegistry } = require('./net/spectators');
const { createIntegrityService } = require('./world/integrity');
const { createHomeZoneDegradationService } = require('./world/homeZones');
const { createLifecycleService } = require('./world/lifecycle');
const { createWorldGravityService, GRAVITY_TICK_MS } = require('./world/gravity');
const { createKingCaptureService } = require('./king/capture');
const { createKingDuelService } = require('./king/duels');
const { createKingDetonationService } = require('./king/detonation');
const { createLoneKingSweepService } = require('./king/loneKingSweep');
const { createActivityLogService } = require('./world/activityLog');
const { createLineClearService } = require('./game/LineClearService');
const { createAiActions } = require('./ai/actions');
const { createAiRunner } = require('./ai/runner');
const { createConnectionHandler } = require('./sockets/connection');

const { createApp } = require('./app');

const HOME_ZONE_DEGRADATION_CHECK_MS = 30000;
const WORLD_INTEGRITY_CHECK_MS = 10000;
const LONE_KING_SWEEP_MS = 15000;

function bootstrap({ projectRoot = process.cwd() } = {}) {
	const app = createApp({ projectRoot });
	const server = http.createServer(app);
	const io = socketIO(server);

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

	const aiActions = createAiActions({
		io,
		gameManager,
		broadcaster,
		integrityService,
		spectatorRegistry,
		lineClearService,
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

	aiRunner.ensureRoster();
	integrityService.processWorldIntegrityMaintenance({ emitAnimation: false, broadcast: false });

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
		aiRunner,
		spectatorRegistry,
		persistence,
		activityLog,
	});
	io.on('connection', handleConnection);

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
		Sessions.clearAll && Sessions.clearAll();
		process.exit(0);
	}

	process.once('SIGINT', () => shutdown('SIGINT'));
	process.once('SIGTERM', () => shutdown('SIGTERM'));

	return { app, server, io, shutdown };
}

module.exports = { bootstrap };

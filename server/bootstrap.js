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
		// Boats wander RELATIVE to the live board centre, not the
		// world origin. Saved worlds in particular can have their
		// occupied cells offset by 20+ units from (0, 0) — if the
		// boats stay parked around the origin they sail off-screen
		// the moment the camera frames the play area.
		getWorldCentre: () => {
			const world = World.getWorld();
			const cells = world && world.board && world.board.cells;
			if (!cells) return null;
			let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
			for (const key of Object.keys(cells)) {
				const idx = key.indexOf(',');
				if (idx === -1) continue;
				const x = Number(key.slice(0, idx));
				const z = Number(key.slice(idx + 1));
				if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (z < minZ) minZ = z;
				if (z > maxZ) maxZ = z;
				n++;
			}
			if (n === 0) return null;
			return {
				centreX: (minX + maxX) / 2,
				centreZ: (minZ + maxZ) / 2,
				extent: Math.max(maxX - minX, maxZ - minZ),
			};
		},
		// Feed the BoatManager the set of occupied cell positions so
		// the boats can steer around them. Sampled every couple of
		// seconds inside the manager.
		getOccupiedCells: () => {
			const world = World.getWorld();
			const cells = world && world.board && world.board.cells;
			if (!cells) return [];
			const out = [];
			for (const key of Object.keys(cells)) {
				const idx = key.indexOf(',');
				if (idx === -1) continue;
				const x = Number(key.slice(0, idx));
				const z = Number(key.slice(idx + 1));
				if (Number.isFinite(x) && Number.isFinite(z)) out.push({ x, z });
			}
			return out;
		},
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

	// Resume any outstanding `pendingCheck` deadline from the snapshot
	// so a server restart mid-check doesn't strand the defender (the
	// timer is in-memory only). `rehydrate()` reads `world.pendingCheck`,
	// reschedules a setTimeout for the remaining ms, and immediately
	// expires it if the deadline already passed during downtime.
	try { checkService.rehydrate(); }
	catch (e) { console.warn('[Check] rehydrate failed:', e.message); }

	// Backfill forwardDistance for pawns restored from snapshots taken
	// before that field was tracked. Without this, veteran pawns sitting
	// deep in enemy territory still report `forwardDistance: 0` and can
	// never trigger the new frozen-pawn promotion flow.
	try {
		const backfilled = gameManager.chessManager.backfillPawnForwardDistance(World.getWorld());
		if (backfilled > 0) {
			console.log(`[Startup] Backfilled forwardDistance on ${backfilled} veteran pawns.`);
			persistence.markDirty();
		}
	} catch (err) {
		console.warn('[Startup] Pawn forwardDistance backfill failed:', err.message);
	}

	// Rescue any persisted player whose king vanished without going
	// through the king-life service. Without this they're stuck — the
	// client tetromino spawn pipeline needs a king anchor to position
	// new pieces. Also dedupes duplicate chess-piece entries.
	try {
		const result = missingKingSweep.tick();
		if (result.rescued.length > 0) {
			console.log(
				`[Startup] Rescued ${result.rescued.length} player(s) with missing kings.`,
			);
		}
		if (result.deduped > 0) {
			console.log(`[Startup] Deduped ${result.deduped} chess-piece entries.`);
		}
	} catch (err) {
		console.warn('[Startup] Missing-king rescue failed:', err.message);
	}

	// Viking longships disabled — advertising is on sponsored cells again.
	// if (boatManager) boatManager.start();

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
		getBundleVersion: app._getBundleVersion || (() => ''),
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

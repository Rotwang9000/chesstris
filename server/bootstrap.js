/**
 * Startup orchestration.  Wires the world, the services and the socket
 * layer together, then returns a `{ app, server, io }` triple plus a
 * graceful-shutdown handler.
 *
 * Composition order matters:
 *
 *   Services       — the game logic, wired in `services.js` (shared with
 *                    the offline engine)
 *   World          — singleton state, restored from disk
 *   Sockets        — register handlers on every new connection
 *   Timers         — auto-save, home-zone degradation, integrity sweep
 */

const http = require('http');
const socketIO = require('socket.io');

const persistence = require('./persistence');
const { parseAllowedOrigins, isOriginAllowed } = require('./security/origins');
const { isDevelopmentEnv } = require('./security/env');
const metrics = require('./observability/metrics');
const sentry = require('./observability/sentry');
const World = require('./world/World');

// Initialise Sentry first so anything that fails during the rest of
// the bootstrap gets reported. Safe to call early — does nothing if
// SENTRY_DSN isn't set.
sentry.initSentry();
sentry.installProcessHandlers();
const Sessions = require('./world/Sessions');
const Disconnects = require('./world/Disconnects');

const { protoRoomFor } = require('./net/broadcasts');
const { createBoatManager } = require('./world/boats');
const advertisersRouter = require('../routes/advertisers');
const { isBattleRegionCell } = require('./battle/geometry');
const { createServices, startServiceTimers } = require('./services');

const { createApp } = require('./app');

function bootstrap({ projectRoot = process.cwd() } = {}) {
	const app = createApp({ projectRoot });
	const server = http.createServer(app);

	// The MCP bridge dials the game's own Socket.IO endpoint over
	// loopback; the actual port is only known once `listen` resolves
	// (tests bind port 0), so expose it as a live resolver.
	app.locals.getSelfPort = () => {
		const address = server.address();
		if (address && typeof address === 'object' && address.port) return address.port;
		const parsed = Number(process.env.PORT);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
	};

	// Same allowlist as the Express CORS layer. In production the
	// browser refuses Socket.IO handshakes from origins not in this
	// list; in development localhost on any port is allowed so the
	// dev tools work without `ALLOWED_ORIGIN` being set.
	const isDevelopment = isDevelopmentEnv();
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
		// Game messages are a few hundred bytes; the 1 MB default let a
		// single packet carry megabytes of junk into handlers.
		maxHttpBufferSize: 64 * 1024,
		// Trim runaway clients: don't keep a half-open transport
		// alive forever.
		pingInterval: 25_000,
		pingTimeout: 20_000,
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
				// Battle arenas sit on their own grid — they must not
				// drag the boats (or the framing) off the organic world.
				if (isBattleRegionCell(x, z)) continue;
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
				if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
				if (isBattleRegionCell(x, z)) continue;
				out.push({ x, z });
			}
			return out;
		},
	});

	const services = createServices({
		io,
		persistence,
		boatManager,
		getBundleVersion: app._getBundleVersion || (() => ''),
	});
	const {
		gameManager, aiRunner, lifecycleService, ghostPlayerSweep, dormantKingdom,
		integrityService, checkService, missingKingSweep, battleManager,
		handleConnection, kingDuelService, homeZoneDegradation, loneKingSweep,
		powerUpManager, pauseService,
	} = services;

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
	try {
		const dormantBoot = dormantKingdom.stowImmediately();
		if (dormantBoot.stowed?.length > 0) {
			console.log(`[Startup] Stowed ${dormantBoot.stowed.length} dormant kingdom(s).`);
		}
	} catch (err) {
		console.warn('[Startup] Dormant-kingdom boot sweep failed:', err.message);
	}
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

	// Re-arm AI seats and socket aliases for battles restored from the
	// snapshot (must run after ensureRoster so roster trims can't touch
	// battle bots — they filter on `battleId`).
	try { battleManager.init(); }
	catch (err) { console.warn('[Startup] Battle restore failed:', err.message); }

	// Viking longships disabled — advertising is on sponsored cells again.
	// if (boatManager) boatManager.start();

	// ── Sockets ───────────────────────────────────────────────────────────
	io.on('connection', socket => {
		// Which kind of game_update this socket can take (piece deltas or not).
		socket.join(protoRoomFor(socket));
		metrics.setSocketCount(io.engine.clientsCount);
		socket.on('disconnect', () => metrics.setSocketCount(io.engine.clientsCount));
		handleConnection(socket);
	});

	// ── Timers ────────────────────────────────────────────────────────────
	const timers = startServiceTimers(services);
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

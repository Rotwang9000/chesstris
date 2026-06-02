/**
 * Express app builder.  Pure routing/middleware setup — no game-state
 * dependencies live in here.  See `server/bootstrap.js` for how the
 * world and socket layer are wired up.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const apiRoutes = require('../routes/api');
const advertiserRoutes = require('../routes/advertisers');
const { router: walletAuthRouter } = require('../routes/walletAuth');
const { mountAuthRoutes } = require('./auth/routes');
const { parseAllowedOrigins, isOriginAllowed } = require('./security/origins');
const metrics = require('./observability/metrics');
const sentry = require('./observability/sentry');
const { createIndexHtmlBundleSwap } = require('./bundling/indexHtmlBundleSwap');

/**
 * Build the Content-Security-Policy directive set. We're strict but
 * pragmatic — the game pulls THREE.js, OrbitControls, and the
 * Socket.IO client from jsdelivr, plus Google Fonts CSS. The
 * connect-src has to include the wss:// upgrades and any WS origin
 * the same host serves from.
 */
function buildCSPDirectives() {
	return {
		defaultSrc: ["'self'"],
		// Inline + the jsdelivr CDN. `'unsafe-inline'` is needed
		// because index.html embeds bootstrap JS inline — splitting
		// that out is a P2 cleanup. `cdn.auth0.com` serves the Auth0
		// SPA SDK (sign-in is feature-flagged off in the client for
		// now, but the policy is kept ready so re-enabling it Just Works).
		scriptSrc: [
			"'self'",
			"'unsafe-inline'",
			'https://cdn.jsdelivr.net',
			'https://cdn.auth0.com',
		],
		styleSrc: [
			"'self'",
			"'unsafe-inline'",
			'https://fonts.googleapis.com',
		],
		fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
		imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
		// Socket.IO upgrade target (wss://tetches.com / ws://localhost:*)
		// plus the Auth0 tenant API for token/session calls.
		connectSrc: ["'self'", 'ws:', 'wss:', 'https://*.auth0.com'],
		// Auth0 uses a hidden iframe for silent token renewal.
		frameSrc: ["'self'", 'https://*.auth0.com'],
		// Block plugins; no <object> / <embed>.
		objectSrc: ["'none'"],
		frameAncestors: ["'self'"],
		baseUri: ["'self'"],
		formAction: ["'self'"],
	};
}

/**
 * True when a request originates from the same host (loopback). Used to
 * keep `/metrics` reachable by a same-box Prometheus scraper while hiding
 * it from the public internet. With `trust proxy` enabled, a direct
 * localhost scrape has no `X-Forwarded-For`, so `req.ip` falls back to the
 * loopback socket address; a request proxied in by nginx carries the real
 * client IP instead.
 */
function isLoopbackRequest(req) {
	const ip = String((req && (req.ip || (req.socket && req.socket.remoteAddress))) || '')
		.replace('::ffff:', '');
	return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

function createApp({ projectRoot = process.cwd() } = {}) {
	const app = express();
	const isDevelopment = process.env.NODE_ENV !== 'production';
	const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGIN);

	// trust proxy — we're behind nginx, so X-Forwarded-* is what
	// `express-rate-limit` needs to identify a unique client.
	if (!isDevelopment) app.set('trust proxy', 1);

	// Sentry request handler must come BEFORE any other middleware
	// so it can wrap the entire chain (including helmet errors).
	sentry.wireSentryRequestHandler(app);

	// Helmet first: CSP, HSTS, XFO etc. CSP is only enforced in
	// production — in development we get a more permissive policy
	// so devtools / inline scripts don't break iteration.
	app.use(helmet({
		contentSecurityPolicy: isDevelopment ? false : {
			directives: buildCSPDirectives(),
		},
		// Cross-Origin-Embedder-Policy: 'require-corp' breaks
		// jsdelivr loads. Disable it; the rest of helmet is fine.
		crossOriginEmbedderPolicy: false,
	}));

	// CORS allowlist — only same-origin in development, only the
	// configured production hosts in production. Socket.IO has its
	// own CORS layer (set in bootstrap.js).
	app.use(cors({
		origin(origin, callback) {
			if (!origin) return callback(null, true);  // curl / server-to-server
			if (isOriginAllowed(origin, allowedOrigins, { allowLocalhost: isDevelopment })) {
				return callback(null, true);
			}
			return callback(new Error(`Origin not allowed: ${origin}`), false);
		},
		credentials: true,
	}));

	app.use(bodyParser.json({ limit: '64kb' }));
	app.use(bodyParser.urlencoded({ extended: true, limit: '64kb' }));

	// Generic API rate limit: 120 requests / minute / IP. Auth
	// endpoints (which can spend real money via SendGrid) get a
	// tighter limit applied inside `server/auth/routes.js`.
	const apiLimiter = rateLimit({
		windowMs: 60 * 1000,
		max: 120,
		standardHeaders: true,
		legacyHeaders: false,
		message: { success: false, error: 'rate_limited' },
	});
	app.use('/api', apiLimiter);

	// Bundle-aware index.html serving (rewrites the entrypoint
	// script tag to `dist/app.bundle.js` when one exists). Mounted
	// BEFORE express.static so it claims `/` and `/index.html`
	// before the static handler serves the raw template.
	const indexSwap = createIndexHtmlBundleSwap({ projectRoot });
	app.use(indexSwap.middleware);
	app._indexBundleStatus = indexSwap.bundleStatus;
	app._getBundleVersion = indexSwap.getBundleVersion;

	// `/node_modules` is only needed by the unbundled dev client (raw ES
	// modules). Production serves the esbuild bundle (deps inlined, THREE
	// & socket.io from CDN), so exposing the dependency tree there is
	// needless attack surface.
	if (isDevelopment) {
		app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));
	}
	app.use(express.static(path.join(projectRoot, 'public')));

	if (!isDevelopment) {
		app.use(express.static(path.join(projectRoot, 'client/build')));
	}

	app.get('/js/*', (req, res, next) => {
		const rel = String(req.path || '').replace(/^\/js\//, '');
		if (!rel || rel.includes('..')) {
			res.status(400).end();
			return;
		}
		const file = path.join(projectRoot, 'public', 'js', rel);
		if (!fs.existsSync(file) && fs.existsSync(`${file}.js`)) {
			res.redirect(`${req.path}.js`);
			return;
		}
		next();
	});

	// Counts every REST hit by route + status. The listener runs
	// after the route resolves so `req.route?.path` is populated.
	app.use((req, res, next) => {
		res.on('finish', () => {
			const route = (req.route && req.route.path) || req.path || 'unknown';
			metrics.incApiRequest(req.method, route, res.statusCode);
		});
		next();
	});

	app.use('/api', apiRoutes);
	app.use('/api/advertisers', advertiserRoutes);
	app.use('/api/wallet-auth', walletAuthRouter);
	mountAuthRoutes(app);

	// Prometheus scrape target. In production it's restricted to same-host
	// scrapers (loopback) or callers presenting the admin token, so the
	// internal gauges aren't exposed on the public internet. Unknown
	// callers get a 404 (hides its existence). Open in development.
	app.get('/metrics', async (req, res) => {
		if (!isDevelopment) {
			const adminToken = process.env.ADMIN_TOKEN;
			const provided = req.get('x-admin-token') || req.query.adminToken;
			const tokenOk = !!adminToken && provided === adminToken;
			if (!isLoopbackRequest(req) && !tokenOk) {
				return res.status(404).end();
			}
		}
		try {
			res.set('Content-Type', metrics.register.contentType);
			res.end(await metrics.renderMetrics());
		} catch (err) {
			res.status(500).end(err.message);
		}
	});

	// `/2d` and `/` both go through `indexSwap.middleware` so they
	// receive the bundle-swapped HTML automatically. We only need
	// explicit handlers here for the *other* HTML entry points.
	app.get('/advertise', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'advertise.html'));
	});
	app.get('/admin/advertisers', (req, res) => {
		// In production the admin panel is gated behind ADMIN_TOKEN.
		// Browser-friendly: token via `?adminToken=…` query string.
		if (process.env.NODE_ENV === 'production') {
			const expected = process.env.ADMIN_TOKEN;
			if (!expected) {
				return res.status(503).send('Admin panel disabled (ADMIN_TOKEN not configured).');
			}
			const provided = req.query.adminToken;
			if (!provided || provided !== expected) {
				return res.status(401).send('Admin token required.');
			}
		}
		res.sendFile(path.join(projectRoot, 'public', 'admin', 'advertisers.html'));
	});

	app.get('*', (req, res, next) => {
		// Pass HTML SPA routes through the bundle-swap middleware so
		// they pick up the same script-tag rewrite that `/` does.
		req.url = '/';
		return indexSwap.middleware(req, res, next);
	});

	// Sentry's error handler must be the LAST middleware before any
	// other error handlers. Without it Express swallows the error
	// before the SDK gets a look.
	sentry.wireSentryErrorHandler(app);

	return app;
}

module.exports = { createApp };

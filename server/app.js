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
const { mountAuthRoutes } = require('./auth/routes');
const { parseAllowedOrigins, isOriginAllowed } = require('./security/origins');
const metrics = require('./observability/metrics');
const sentry = require('./observability/sentry');

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
		// that out is a P2 cleanup.
		scriptSrc: [
			"'self'",
			"'unsafe-inline'",
			'https://cdn.jsdelivr.net',
		],
		styleSrc: [
			"'self'",
			"'unsafe-inline'",
			'https://fonts.googleapis.com',
		],
		fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
		imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
		// Socket.IO upgrade target. The browser issues these as
		// wss://tetches.com or ws://localhost:* — same-origin is
		// the only requirement.
		connectSrc: ["'self'", 'ws:', 'wss:'],
		// Block plugins; no <object> / <embed>.
		objectSrc: ["'none'"],
		frameAncestors: ["'self'"],
		baseUri: ["'self'"],
		formAction: ["'self'"],
	};
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

	app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));
	app.use(express.static(path.join(projectRoot, 'public')));

	if (!isDevelopment) {
		app.use(express.static(path.join(projectRoot, 'client/build')));
	}

	app.get('/js/*', (req, res, next) => {
		const file = path.join(projectRoot, 'public', req.url);
		if (!fs.existsSync(file) && fs.existsSync(`${file}.js`)) {
			res.redirect(`${req.url}.js`);
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
	mountAuthRoutes(app);

	// Prometheus scrape target. Public for now (Prometheus on the
	// same host can scrape without auth); restrict at the nginx
	// layer if you ever expose it externally.
	app.get('/metrics', async (_req, res) => {
		try {
			res.set('Content-Type', metrics.register.contentType);
			res.end(await metrics.renderMetrics());
		} catch (err) {
			res.status(500).end(err.message);
		}
	});

	app.get('/2d', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'index.html'));
	});
	app.get('/advertise', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'advertise.html'));
	});
	app.get('/admin/advertisers', (_req, res) => {
		res.sendFile(path.join(projectRoot, 'public', 'admin', 'advertisers.html'));
	});

	app.get('*', (_req, res) => {
		if (isDevelopment) {
			res.sendFile(path.join(projectRoot, 'public', 'index.html'));
		} else {
			res.sendFile(path.join(projectRoot, 'client/build', 'index.html'));
		}
	});

	// Sentry's error handler must be the LAST middleware before any
	// other error handlers. Without it Express swallows the error
	// before the SDK gets a look.
	sentry.wireSentryErrorHandler(app);

	return app;
}

module.exports = { createApp };

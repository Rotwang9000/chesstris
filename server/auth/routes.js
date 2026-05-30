/**
 * Auth + lightweight game-key routes.
 *
 * Authentication is delegated entirely to Auth0 (passwordless email).
 * Auth0 hosts the whole sign-in journey AND email delivery, so this
 * server never sends, receives, or stores email addresses / PII. The
 * SPA talks to Auth0 directly; we only expose the *public* Auth0 config
 * (domain + client id) so the client SDK can initialise, plus the
 * unrelated shareable game-key generator.
 *
 * Domain + client id are not secrets — they ship inside the SPA bundle
 * regardless — so serving them here just lets staging/production
 * override them via env without rebuilding the client.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const gameKeyModule = require('./gameKey');

// Public Auth0 SPA settings. Fallbacks are the live "Shaktris" tenant
// app; override per-environment with AUTH0_DOMAIN / AUTH0_CLIENT_ID.
const DEFAULT_AUTH0_DOMAIN = 'cde.uk.auth0.com';
const DEFAULT_AUTH0_CLIENT_ID = '2a5LEQbCnjcx8t7yQWEeDZRUsd5W7BdQ';

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 60;

const apiLimiter = rateLimit({
	windowMs: RATE_WINDOW_MS,
	max: RATE_MAX,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	message: { success: false, error: 'rate_limited' },
});

function getAuth0Config() {
	return {
		domain: process.env.AUTH0_DOMAIN || DEFAULT_AUTH0_DOMAIN,
		clientId: process.env.AUTH0_CLIENT_ID || DEFAULT_AUTH0_CLIENT_ID,
		// Optionally pin the hosted-login connection (e.g. 'email' for
		// passwordless). Empty = let Auth0 present every method enabled
		// for the app. Configurable so we can switch the experience
		// without a client rebuild.
		connection: process.env.AUTH0_CONNECTION || '',
	};
}

function mountAuthRoutes(app) {
	app.get('/api/auth/config', handleAuthConfig);
	app.post('/api/auth/generate-game-key', apiLimiter, handleGenerateGameKey);
}

function handleAuthConfig(_req, res) {
	const config = getAuth0Config();
	if (!config.domain || !config.clientId) {
		console.error('Auth0 config missing domain/clientId');
		return res.status(500).json({ success: false, error: 'auth_unconfigured' });
	}
	// Cacheable: these values change only on (rare) tenant reconfig.
	res.set('Cache-Control', 'public, max-age=300');
	return res.json(config);
}

function handleGenerateGameKey(_req, res) {
	try {
		const gameKey = gameKeyModule.generateGameKey();
		return res.json({ success: true, gameKey });
	} catch (error) {
		console.error('Error generating game key:', error);
		return res.status(500).json({ success: false, error: 'Internal server error' });
	}
}

module.exports = { mountAuthRoutes, getAuth0Config };

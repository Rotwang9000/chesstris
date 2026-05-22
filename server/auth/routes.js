/**
 * Magic-link authentication routes.
 *
 * The actual link generation/verification + email delivery live in
 * `./magicLink.js` and `./emailService.js`.  This module just plumbs the
 * Express routes into them.
 *
 * Note the asymmetric mount points: `/api/auth/*` for actions the
 * frontend invokes, but the verify endpoint sits at `/auth/verify` (no
 * `/api` prefix) because that's the URL embedded in magic-link emails.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const magicLinkModule = require('./magicLink');
const emailServiceModule = require('./emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Magic-link is the only endpoint that can spend real money (SendGrid
// credits) per request. Default of 5 attempts / 10 min / IP is
// generous for humans, brutal for bots. The verify endpoint is read-
// only but still rate-limited to defeat token-bruteforce attempts.
const magicLinkLimiter = rateLimit({
	windowMs: 10 * 60 * 1000,
	max: 5,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator(req) {
		// Bucket per-IP+email so a shared NAT can't exhaust a victim's
		// quota by spamming their email — and so a single bad actor
		// can't whack many victims from one IP. ipKeyGenerator
		// normalises IPv6 ranges so a /64 doesn't bypass the limit.
		const email = (req.body && req.body.email ? String(req.body.email) : '').toLowerCase();
		return `${ipKeyGenerator(req.ip)}|${email}`;
	},
	message: {
		success: false,
		error: 'rate_limited',
		message: 'Too many magic-link requests; try again in a few minutes.',
	},
});

const verifyLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: { success: false, error: 'rate_limited' },
});

function mountAuthRoutes(app) {
	app.post('/api/auth/magic-link', magicLinkLimiter, handleRequestMagicLink);
	app.get('/auth/verify', verifyLimiter, handleVerify);
	app.post('/api/auth/generate-game-key', handleGenerateGameKey);
}

async function handleRequestMagicLink(req, res) {
	try {
		const { email, gameKey } = req.body || {};
		if (!email || typeof email !== 'string') {
			return res.status(400).json({ success: false, error: 'Email is required' });
		}
		if (!EMAIL_REGEX.test(email)) {
			return res.status(400).json({ success: false, error: 'Invalid email format' });
		}

		const linkData = magicLinkModule.createMagicLink(email, gameKey || null);
		const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
		const baseUrl = `${protocol}://${req.headers.host}`;
		const result = await emailServiceModule.sendMagicLinkEmail(email, linkData.token, baseUrl);

		if (result.success) {
			return res.json({
				success: true,
				message: result.message || 'Magic link sent! Check your email.',
				method: result.method,
				expiresIn: linkData.expiresIn,
			});
		}
		return res.status(500).json({
			success: false,
			error: result.error || 'Failed to send magic link',
		});
	} catch (error) {
		console.error('Error in magic-link endpoint:', error);
		return res.status(500).json({ success: false, error: 'Internal server error' });
	}
}

function handleVerify(req, res) {
	try {
		const { token } = req.query;
		if (!token) return res.redirect('/?auth=failed&reason=invalid');

		const linkData = magicLinkModule.verifyMagicLink(token);
		if (!linkData) return res.redirect('/?auth=failed&reason=expired');

		const playerKey = magicLinkModule.generatePlayerKey(linkData.email);
		const redirectUrl = new URL('/', `${req.protocol}://${req.headers.host}`);
		redirectUrl.searchParams.set('auth', 'success');
		redirectUrl.searchParams.set('playerKey', playerKey);
		if (linkData.gameKey) redirectUrl.searchParams.set('gameKey', linkData.gameKey);

		return res.redirect(redirectUrl.toString());
	} catch (error) {
		console.error('Error verifying magic link:', error);
		return res.redirect('/?auth=failed&reason=error');
	}
}

function handleGenerateGameKey(_req, res) {
	try {
		const gameKey = magicLinkModule.generateGameKey();
		return res.json({ success: true, gameKey });
	} catch (error) {
		console.error('Error generating game key:', error);
		return res.status(500).json({ success: false, error: 'Internal server error' });
	}
}

module.exports = { mountAuthRoutes };

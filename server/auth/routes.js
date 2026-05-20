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

const magicLinkModule = require('./magicLink');
const emailServiceModule = require('./emailService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mountAuthRoutes(app) {
	app.post('/api/auth/magic-link', handleRequestMagicLink);
	app.get('/auth/verify', handleVerify);
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

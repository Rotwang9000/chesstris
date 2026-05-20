/**
 * Email Service Module
 * Uses SendGrid to send transactional email (magic-link sign-in).
 *
 * SendGrid is a regular dependency in package.json; we don't dynamically
 * `require` it. If `SENDGRID_API_KEY` isn't set we simply log magic links
 * to the console and return success — useful for local development.
 */

const sgMail = require('@sendgrid/mail');

let sendGridInitialised = false;
let sendGridAvailable = false;
let sendGridError = null;

/**
 * Configure SendGrid using the env-supplied API key. Idempotent.
 * @returns {boolean} True if SendGrid is usable.
 */
function initSendGrid() {
	if (sendGridInitialised) return sendGridAvailable;
	sendGridInitialised = true;
	
	const apiKey = process.env.SENDGRID_API_KEY;
	if (!apiKey) {
		console.warn('SENDGRID_API_KEY not set - email functionality disabled');
		sendGridError = 'API key not configured';
		sendGridAvailable = false;
		return false;
	}
	
	sgMail.setApiKey(apiKey);
	sendGridAvailable = true;
	console.log('SendGrid initialised successfully');
	return true;
}

/**
 * Send a magic link email
 * @param {string} email - Recipient email address
 * @param {string} token - Magic link token
 * @param {string} baseUrl - Base URL for the magic link
 * @returns {Promise<Object>} Result of the send operation
 */
async function sendMagicLinkEmail(email, token, baseUrl) {
	const available = initSendGrid();
	
	if (!available) {
		// In development, log the link instead of sending
		const magicLink = `${baseUrl}/auth/verify?token=${token}`;
		console.log('='.repeat(60));
		console.log('MAGIC LINK (email not sent - SendGrid not available):');
		console.log(`Email: ${email}`);
		console.log(`Link: ${magicLink}`);
		console.log('='.repeat(60));
		
		return {
			success: true,
			method: 'console',
			message: 'Magic link logged to console (SendGrid not available)'
		};
	}
	
	const magicLink = `${baseUrl}/auth/verify?token=${token}`;
	
	const msg = {
		to: email,
		from: {
			email: process.env.SENDGRID_FROM_EMAIL || 'noreply@shaktris.com',
			name: 'Shaktris'
		},
		subject: '🎮 Your Shaktris Magic Link',
		text: `
Welcome to Shaktris!

Click the link below to sign in (valid for 15 minutes):
${magicLink}

If you didn't request this, you can safely ignore this email.

Happy gaming!
The Shaktris Team
		`.trim(),
		html: `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a1a; font-family: 'Times New Roman', Georgia, serif;">
	<div style="max-width: 500px; margin: 0 auto; padding: 40px 20px;">
		<div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 2px solid #ffcc00; border-radius: 12px; padding: 30px; text-align: center;">
			<h1 style="color: #ffcc00; margin: 0 0 20px 0; font-size: 28px;">☦ Shaktris ☦</h1>
			<p style="color: #ffffff; margin: 0 0 30px 0; font-size: 16px;">
				Click the button below to sign in to your game:
			</p>
			<a href="${magicLink}" style="display: inline-block; background: #ffcc00; color: #0a0a1a; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
				SIGN IN TO PLAY
			</a>
			<p style="color: #888888; margin: 30px 0 0 0; font-size: 12px;">
				This link expires in 15 minutes.<br>
				If you didn't request this, you can safely ignore this email.
			</p>
		</div>
		<p style="color: #666666; text-align: center; margin-top: 20px; font-size: 12px;">
			Shaktris - Chess + Tetris in the Clouds
		</p>
	</div>
</body>
</html>
		`.trim()
	};
	
	try {
		await sgMail.send(msg);
		console.log(`Magic link email sent to ${email}`);
		return {
			success: true,
			method: 'email',
			message: 'Magic link sent to your email'
		};
	} catch (error) {
		console.error('Failed to send magic link email:', error);
		return {
			success: false,
			method: 'email',
			error: error.message || 'Failed to send email'
		};
	}
}

/**
 * Check if email service is available
 * @returns {Promise<Object>} Status of the email service
 */
async function getEmailServiceStatus() {
	const available = initSendGrid();
	return {
		available,
		error: sendGridError
	};
}

module.exports = {
	sendMagicLinkEmail,
	getEmailServiceStatus
};

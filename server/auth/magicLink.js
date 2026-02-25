/**
 * Magic Link Authentication Module
 * Uses SendGrid to send authentication emails
 */

const crypto = require('crypto');

// In-memory storage for magic links (use Redis or DB in production)
const magicLinks = new Map();

// Token expiry time (15 minutes)
const TOKEN_EXPIRY_MS = 15 * 60 * 1000;

// Clean up expired tokens every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [token, data] of magicLinks.entries()) {
		if (data.expiresAt < now) {
			magicLinks.delete(token);
		}
	}
}, 5 * 60 * 1000);

/**
 * Generate a secure random token
 * @returns {string} Hex-encoded token
 */
function generateToken() {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a magic link for an email address
 * @param {string} email - User's email address
 * @param {string} [gameKey] - Optional game key to associate with the link
 * @returns {Object} Token data including the token and expiry
 */
function createMagicLink(email, gameKey = null) {
	const token = generateToken();
	const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
	
	const linkData = {
		email: email.toLowerCase().trim(),
		gameKey,
		expiresAt,
		createdAt: Date.now()
	};
	
	magicLinks.set(token, linkData);
	
	return {
		token,
		expiresAt,
		expiresIn: TOKEN_EXPIRY_MS
	};
}

/**
 * Verify a magic link token
 * @param {string} token - The token to verify
 * @returns {Object|null} The link data if valid, null otherwise
 */
function verifyMagicLink(token) {
	const linkData = magicLinks.get(token);
	
	if (!linkData) {
		return null;
	}
	
	// Check if token has expired
	if (linkData.expiresAt < Date.now()) {
		magicLinks.delete(token);
		return null;
	}
	
	// Delete the token after successful verification (single use)
	magicLinks.delete(token);
	
	return linkData;
}

/**
 * Generate a player key from email (for game persistence)
 * @param {string} email - User's email address
 * @returns {string} A consistent player key
 */
function generatePlayerKey(email) {
	const hash = crypto.createHash('sha256');
	hash.update(email.toLowerCase().trim() + ':shaktris');
	return 'player_' + hash.digest('hex').substring(0, 16);
}

/**
 * Generate a game key for sharing
 * @returns {string} A short, shareable game key
 */
function generateGameKey() {
	// Generate a 6-character alphanumeric key
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
	let key = '';
	const bytes = crypto.randomBytes(6);
	for (let i = 0; i < 6; i++) {
		key += chars[bytes[i] % chars.length];
	}
	return key;
}

module.exports = {
	createMagicLink,
	verifyMagicLink,
	generatePlayerKey,
	generateGameKey
};

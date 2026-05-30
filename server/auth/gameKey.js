/**
 * Shareable world/game-key generator.
 *
 * This is the only piece of the old magic-link module worth keeping:
 * it mints short, human-shareable keys used to invite others into the
 * same world. It deliberately handles no email, tokens, or PII —
 * authentication is delegated entirely to Auth0 (see ./routes.js).
 */

const crypto = require('crypto');

// Avoid visually ambiguous characters (no 0/O, 1/I/L) so keys are easy
// to read aloud and re-type.
const GAME_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_KEY_LENGTH = 6;

/**
 * Generate a short, shareable game key.
 * @returns {string} e.g. "K7P2QM"
 */
function generateGameKey() {
	const bytes = crypto.randomBytes(GAME_KEY_LENGTH);
	let key = '';
	for (let i = 0; i < GAME_KEY_LENGTH; i++) {
		key += GAME_KEY_ALPHABET[bytes[i] % GAME_KEY_ALPHABET.length];
	}
	return key;
}

module.exports = { generateGameKey, GAME_KEY_LENGTH, GAME_KEY_ALPHABET };

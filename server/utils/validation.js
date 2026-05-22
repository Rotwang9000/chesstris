/**
 * Lightweight input validation shared between the socket handlers and
 * the REST API.
 */

const MAX_PLAYER_NAME_LENGTH = 32;

/**
 * Normalise a player-supplied name into a safe, length-capped string.
 * Returns `null` if the value can't sensibly be coerced to a name.
 *
 * @param {unknown} playerName
 * @returns {string|null}
 */
function validatePlayerName(playerName) {
	if (!playerName) return null;

	let name = playerName;
	if (typeof name !== 'string') {
		try {
			name = String(name);
		} catch (_err) {
			return null;
		}
	}

	name = name.trim();
	if (!name) return null;

	if (name.length > MAX_PLAYER_NAME_LENGTH) {
		name = name.substring(0, MAX_PLAYER_NAME_LENGTH);
	}

	return name;
}

module.exports = {
	MAX_PLAYER_NAME_LENGTH,
	validatePlayerName,
};

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

	// Names are rendered to other players, sometimes via innerHTML, so
	// they must never carry markup: drop control chars and <>&`, and
	// swap straight quotes for typographic ones (keeps "O'Brien"
	// readable without being able to break out of an attribute).
	name = name
		// eslint-disable-next-line no-control-regex -- stripping them is the point
		.replace(/[\u0000-\u001f\u007f<>&`]/g, '')
		.replace(/'/g, '\u2019')
		.replace(/"/g, '\u201d')
		.trim();
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

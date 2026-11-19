/**
 * Player names for the screen. A raw player id (a UUID) never goes on
 * screen: placeholders ("Guest", "Player_3fa2c1", the id itself) count
 * as no name, and the caller words around it ("a rival", "your").
 *
 * Shared by the core game (the cell info toast) and the Viking
 * paintings' captions (paintings/paintingCaptions.js re-exports these).
 */

/**
 * A name as a title would give it: battle seats are badged on the
 * server ("⚔ Geofrey"), which reads oddly in a caption, so leading
 * symbols go.
 */
export function cleanName(name) {
	if (typeof name !== 'string') return '';
	return name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

/** Server-made names that would only leak an id fragment. */
export function isPlaceholderName(name, id = null) {
	if (typeof name !== 'string') return true;
	const trimmed = cleanName(name);
	if (!trimmed || trimmed === 'Guest') return true;
	if (id != null && trimmed === String(id)) return true;
	if (/^Player_[a-z0-9]{4,}$/i.test(trimmed)) return true;
	if (/^DevPlayer_/i.test(trimmed)) return true;
	return false;
}

/**
 * A player's display name, or null when we only have a placeholder.
 *
 * @param {Object} players  gameState.players (id → record)
 * @param {string} id
 * @param {Object} [opts]
 * @param {string} [opts.localId]    the viewer's id
 * @param {string} [opts.localName]  the name the viewer chose (localStorage),
 *   used when the server still has a placeholder for them
 */
export function displayNameOf(players, id, { localId = null, localName = null } = {}) {
	if (id == null) return null;
	const record = players && typeof players === 'object' ? players[id] : null;
	const candidates = [record?.name, record?.username, record?.displayName];
	for (const name of candidates) {
		if (!isPlaceholderName(name, id)) return cleanName(name);
	}
	if (localId != null && String(localId) === String(id) && !isPlaceholderName(localName, id)) {
		return cleanName(localName);
	}
	return null;
}

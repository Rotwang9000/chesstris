/**
 * Cooldown helpers used to rate-limit player actions on the server.
 * Cooldown timestamps live directly on the world's player records so they
 * survive disconnects and reboots.
 */

/**
 * @param {object|null|undefined} player
 * @param {string} lastActionKey - Property name on the player storing the
 *   last action's epoch ms.
 * @param {number} cooldownMs
 * @returns {number} Milliseconds remaining (0 when not rate limited).
 */
function getCooldownRemainingMs(player, lastActionKey, cooldownMs) {
	if (!player) return 0;

	const last = Number(player[lastActionKey] || 0);
	if (!Number.isFinite(last) || last <= 0) return 0;

	const elapsed = Date.now() - last;
	const remaining = cooldownMs - elapsed;
	return remaining > 0 ? remaining : 0;
}

/**
 * Returns the most recent epoch-ms timestamp of any action this player has
 * taken. Used by home-zone degradation to gauge inactivity.
 */
function getLatestPlayerActionAt(playerData) {
	if (!playerData || typeof playerData !== 'object') return 0;

	const candidates = [
		playerData.lastTetrominoPlacementAt,
		playerData.lastChessMoveAt,
		playerData.lastMoveTime,
		playerData.lastActionAt,
		playerData.lastMoveAt,
	];

	let latest = 0;
	for (const value of candidates) {
		const num = Number(value);
		if (Number.isFinite(num) && num > latest) {
			latest = num;
		}
	}

	return latest;
}

module.exports = {
	getCooldownRemainingMs,
	getLatestPlayerActionAt,
};

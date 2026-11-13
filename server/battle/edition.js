/**
 * Battle editions — which rule set a battle plays.
 *
 *   • 'standard' — the game as it has always been.
 *   • 'viking'   — the same game plus longships (see shipRules.js).
 *
 * The edition belongs to the BATTLE, never to a client: a player who
 * joins, takes over a bot or reconnects adopts `battle.edition` from the
 * server, so two people in one arena can never be playing different
 * rules. Battles saved before editions existed have no field and read as
 * standard, which keeps every old arena behaving exactly as it did.
 *
 * Pure and dependency-free so the client can mirror it.
 */

'use strict';

const EDITIONS = Object.freeze({ STANDARD: 'standard', VIKING: 'viking' });

/**
 * Coerce an untrusted client value to an edition. Anything that isn't
 * exactly "viking" (case and surrounding space aside) is the standard
 * game, so a typo or an old client can never switch Viking rules on.
 *
 * @param {*} value
 * @returns {'standard'|'viking'}
 */
function normaliseEdition(value) {
	const v = String(value == null ? '' : value).trim().toLowerCase();
	return v === EDITIONS.VIKING ? EDITIONS.VIKING : EDITIONS.STANDARD;
}

/** The edition a battle record plays (pre-edition records are standard). */
function battleEdition(battle) {
	return normaliseEdition(battle && battle.edition);
}

/** Does this battle play Viking rules (longships)? */
function isVikingBattle(battle) {
	return !!battle && battleEdition(battle) === EDITIONS.VIKING;
}

module.exports = {
	EDITIONS,
	normaliseEdition,
	battleEdition,
	isVikingBattle,
};

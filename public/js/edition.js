/**
 * Editions: the same game dressed for a different saga.
 *
 * Today there is the standard game and the Viking edition, where
 * moments of play are shown as paintings of events in history (see
 * js/paintings/). The page switch below is client-side and only asks:
 * a Viking client creates and quick-matches Viking battles, and in a
 * Viking BATTLE longships are real gameplay. The battle itself carries
 * its edition (server/battle/edition.js); a seat adopts it on join,
 * start and reconnect (battle/battleMode.js), and `vikingActive` reads
 * either. The shared world is the same for everyone.
 *
 * The switch is read by an inline script in index.html before first
 * paint (like portal mode, js/portal.js), which sets
 * `<html data-edition>`:
 *   • `?edition=viking` turns it on and remembers it in localStorage,
 *     so the installed app and later visits keep it;
 *   • `?edition=standard` forgets it;
 *   • a packaged build may set `window.__TETCHES_EDITION__` instead.
 * Only allow-listed names count, so a made-up value is the standard
 * game. `resolveEdition` below is that same rule as a pure function,
 * kept for tests and for any code that needs to reason about it.
 */

export const EDITIONS = new Set(['viking']);
export const EDITION_STORAGE_KEY = 'tetches_edition';
const CLEAR_VALUE = 'standard';

/**
 * Which edition a page load gets, and what to do with the stored choice.
 *
 * @param {Object} input
 * @param {string|null} [input.query]    the `?edition=` value
 * @param {*} [input.injected]           `window.__TETCHES_EDITION__`
 * @param {string|null} [input.stored]   the remembered choice
 * @returns {{ edition: string|null, store: 'set'|'clear'|null }}
 *   `edition` is null for the standard game.
 */
export function resolveEdition({ query = null, injected = null, stored = null } = {}) {
	if (query === CLEAR_VALUE) return { edition: null, store: 'clear' };
	if (EDITIONS.has(query)) return { edition: query, store: 'set' };
	if (typeof injected === 'string' && EDITIONS.has(injected)) return { edition: injected, store: null };
	if (EDITIONS.has(stored)) return { edition: stored, store: null };
	return { edition: null, store: null };
}

/** 'viking' | null (the standard game) — from <html data-edition>. */
export function edition() {
	try {
		const name = document.documentElement.dataset.edition;
		return EDITIONS.has(name) ? name : null;
	} catch (_e) {
		return null;
	}
}

export function isViking() {
	return edition() === 'viking';
}

/**
 * Is the Viking edition in force for what this player is looking at?
 * True with the page switch on, or while seated in a battle the server
 * says is a Viking battle (a standard-edition player who joins one
 * still plays longships: the edition belongs to the battle, see
 * server/battle/edition.js).
 *
 * @param {Object} [gameState]
 * @returns {boolean}
 */
export function vikingActive(gameState) {
	return isViking() || gameState?.activeBattle?.edition === 'viking';
}

/** Is this battle record (publicState) a Viking battle? */
export function isVikingBattle(battle) {
	return !!battle && battle.edition === 'viking';
}

/** The edition this client asks for when it creates or matches a battle. */
export function requestedBattleEdition() {
	return isViking() ? 'viking' : 'standard';
}

/**
 * This page's address with `?edition=standard`, keeping its other
 * switches (offline, app, portal): the way out of an edition, which is
 * otherwise remembered for good — an installed app has no address bar.
 *
 * @param {{ pathname?: string, search?: string }} [loc]
 * @returns {string}
 */
export function standardEditionHref({ pathname = '/', search = '' } = {}) {
	const params = new URLSearchParams(search);
	params.set('edition', CLEAR_VALUE);
	return `${pathname}?${params.toString()}`;
}

/** Forget the edition and reload as the standard game. */
export function returnToStandardEdition(loc = window.location) {
	try { localStorage.removeItem(EDITION_STORAGE_KEY); } catch (_e) { /* the URL clears it too */ }
	loc.replace(standardEditionHref(loc));
}

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
 * `<html data-edition>`. Since 2026-11-17 the Viking edition is the
 * DEFAULT (owner's call); the standard game is an opt-out:
 *   • a plain visit is the Viking edition;
 *   • `?edition=standard` picks the standard game and remembers it in
 *     localStorage, so the installed app and later visits keep it;
 *   • `?edition=viking` picks the Viking edition again (remembered);
 *   • a packaged build may set `window.__TETCHES_EDITION__` ('viking'
 *     or 'standard') instead, which wins over the default but not over
 *     the player's own remembered choice.
 * Only allow-listed names count; anything else is ignored.
 * `resolveEdition` below is that same rule as a pure function, kept for
 * tests and for any code that needs to reason about it.
 */

export const EDITIONS = new Set(['viking']);
export const EDITION_STORAGE_KEY = 'tetches_edition';
/** The edition a visitor gets when nothing says otherwise. */
export const DEFAULT_EDITION = 'viking';
const STANDARD = 'standard';

/** 'viking' | 'standard' for a name we know, else null. */
function known(name) {
	if (typeof name !== 'string') return null;
	if (name === STANDARD || EDITIONS.has(name)) return name;
	return null;
}

/**
 * Which edition a page load gets, and what to remember.
 *
 * @param {Object} input
 * @param {string|null} [input.query]    the `?edition=` value
 * @param {*} [input.injected]           `window.__TETCHES_EDITION__`
 * @param {string|null} [input.stored]   the remembered choice
 * @returns {{ edition: string|null, store: string|null }}
 *   `edition` is null for the standard game; `store` is the choice to
 *   remember ('viking' | 'standard'), or null to leave storage alone.
 */
export function resolveEdition({ query = null, injected = null, stored = null } = {}) {
	const q = known(query);
	const pick = q || known(stored) || known(injected) || DEFAULT_EDITION;
	return { edition: pick === STANDARD ? null : pick, store: q };
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
 * otherwise the default — an installed app has no address bar.
 *
 * @param {{ pathname?: string, search?: string }} [loc]
 * @returns {string}
 */
export function standardEditionHref({ pathname = '/', search = '' } = {}) {
	const params = new URLSearchParams(search);
	params.set('edition', STANDARD);
	return `${pathname}?${params.toString()}`;
}

/** Remember the standard game and reload as it. */
export function returnToStandardEdition(loc = window.location) {
	try { localStorage.setItem(EDITION_STORAGE_KEY, STANDARD); } catch (_e) { /* the URL says it too */ }
	loc.replace(standardEditionHref(loc));
}

/** This page's address with `?edition=viking`, keeping its other switches. */
export function vikingEditionHref({ pathname = '/', search = '' } = {}) {
	const params = new URLSearchParams(search);
	params.set('edition', 'viking');
	return `${pathname}?${params.toString()}`;
}

/** Remember the Viking edition and reload as it. */
export function switchToVikingEdition(loc = window.location) {
	try { localStorage.setItem(EDITION_STORAGE_KEY, 'viking'); } catch (_e) { /* the URL says it too */ }
	loc.replace(vikingEditionHref(loc));
}

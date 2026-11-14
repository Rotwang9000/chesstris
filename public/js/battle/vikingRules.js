/**
 * Viking battles in words: the longship rules as players read them,
 * the controls, and the small edition helpers the battle UI shares.
 *
 * The rules mirror server/battle/shipRules.js (owner-approved v1, with
 * the one-sided rowing lock: while YOUR ship rows, your pieces can't
 * step on or off it, but enemies still may).
 */

import { isVikingBattle } from '../edition.js';

export const VIKING_RULES = Object.freeze([
	'Each warlord has one longship, moored behind the queen.',
	'Any piece except a king or pawn can step aboard with a normal move. One piece per ship.',
	'A ship sails up to 5 squares in a straight line across open water. Sailing is done in your chess move and does not use it up.',
	'After a sail the ship rows for 3 seconds. While YOUR ship rows, your pieces can’t step on or off it, and it can’t sail again. Enemies can still capture its passenger or seize it empty.',
	'Pieces step on or off only while the ship touches land (diagonals count).',
	'A piece aboard can never attack a king: it must land first.',
	'Step onto an enemy ship, or capture its passenger, and the ship is yours.',
	'Sliding pieces can’t pass over a ship. Ships aren’t land: you can’t build from them, and they never clear or crumble.',
	'In Quick battles the sea sinks ships like land, with anyone aboard.',
	'Lost your last ship? A new one is built at your mooring after 45 seconds.',
]);

/**
 * The longship controls for the help card, in the words of the pointer
 * in hand: "tap" for a finger (and no keys to press), "click" for a
 * mouse, with the keyboard ways too.
 *
 * @param {boolean} [touch]
 * @returns {ReadonlyArray<[string, string]>}
 */
export function vikingControls(touch = false) {
	if (touch) {
		return Object.freeze([
			['Select your longship', 'Tap it, or use the Longship button (again for your next ship)'],
			['Sail', 'Tap a glowing tile on the water'],
			['Piece aboard', 'Tap it (or its ship): rings show its moves, tiles show where the ship can sail. The Longship button picks the ship alone'],
			['Board / land', 'Select a piece and tap the gold ring on a moored ship, or a ring ashore'],
		]);
	}
	return Object.freeze([
		['Select your longship', 'Click it, press L, or use the Longship button (again for your next ship)'],
		['Sail', 'Click a glowing tile on the water (keyboard: arrows, then Enter)'],
		['Piece aboard', 'Click it (or its ship): rings show its moves, tiles show where the ship can sail. The Longship button or L picks the ship alone'],
		['Board / land', 'Select a piece and click the gold ring on a moored ship, or a ring ashore'],
	]);
}

/** The controls for a mouse and keyboard (see vikingControls). */
export const VIKING_CONTROLS = vikingControls(false);

/** The toast at the start of a Viking battle (shown with the drawn longship icon: `icon: 'longship'`). */
export function longshipsInPlayText(touch = false) {
	return touch
		? 'Longships in play: tap your ship to sail it.'
		: 'Longships in play: click your ship (or press L) to sail it.';
}

/** Shown when lite (2D) mode meets a Viking battle. */
export const VIKING_LITE_REFUSAL = 'Viking battles need the full 3D game to show the longships. '
	+ 'Open the full game (not the 2D view) to play them, or add ?edition=standard for a standard battle.';

/**
 * The edition to store on gameState.activeBattle from a battle record,
 * keeping `fallback` when the record doesn't say (an older payload).
 */
export function adoptedEdition(battle, fallback = 'standard') {
	if (battle && typeof battle.edition === 'string') return isVikingBattle(battle) ? 'viking' : 'standard';
	return fallback === 'viking' ? 'viking' : 'standard';
}

/** Badge text for a Viking battle (or the battle you'd create), else null. */
export function vikingBattleBadgeText(battle) {
	if (!isVikingBattle(battle)) return null;
	return 'Viking battle: longships in play';
}

/** The rules as one plain-text block (tests, copy). */
export function vikingRulesText() {
	return VIKING_RULES.map((line, i) => `${i + 1}. ${line}`).join('\n');
}

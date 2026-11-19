/**
 * Captions for the event paintings: one line on the parchment band
 * under the picture, written like the title of a history painting —
 * "Geofrey's knight slays Bot 2's bishop".
 *
 * Names come from the player roster (`gameState.players[id].name`).
 * A raw player id never reaches the screen: an unknown or placeholder
 * name ("Guest", "Player_3fa2c1") reads as "a rival" — or "your" when
 * it is the viewer (`attackerIsYou` / `victimIsYou` on the moment).
 *
 * Pure functions, tested in tests/ui/paintings.test.js.
 */

import { normalisePieceType } from './paintingCatalogue.js';

/** Each attacker strikes in its own manner. */
const VERBS = {
	pawn: 'fells',
	knight: 'slays',
	bishop: 'smites',
	rook: 'crushes',
	queen: 'strikes down',
	king: 'cuts down',
};

const UNKNOWN_NAME = 'a rival';

// (the name helpers are shared with the core game: playerNames.js)
export { cleanName, isPlaceholderName, displayNameOf } from '../playerNames.js';
import { cleanName, isPlaceholderName } from '../playerNames.js';

/** "Geofrey’s", "Hans’", or — nameless — "your" (the viewer) / "a rival’s". */
function possessive(name, isYou = false) {
	if (!name && isYou) return 'your';
	const who = name || UNKNOWN_NAME;
	return /s$/i.test(who) ? `${who}’` : `${who}’s`;
}

function capitalise(text) {
	return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function pieceWord(type) {
	return normalisePieceType(type) || 'piece';
}

// ── Longships (paintingShips.js) ───────────────────────────────────────────
// The viewer is always "you" here, as in "Your queen comes ashore at
// Bot 2’s harbour": a ship caption is told from the viewer's side.

/** "your", "Bot 2’s", "a rival’s". */
function whose(name, isYou) {
	return isYou ? 'your' : possessive(name);
}

/** A piece aboard, or the crew when we can't tell which. */
function crewWord(type) {
	return normalisePieceType(type) || 'warrior';
}

function queenAshoreCaption(m) {
	if (m.attackerIsYou) {
		if (!m.victimId) return 'Your queen comes ashore';
		const host = whose(m.victimName, false);
		return m.raid ? `Your queen storms ashore at ${host} harbour` : `Your queen comes ashore at ${host} harbour`;
	}
	const who = capitalise(whose(m.attackerName, false));
	return m.raid ? `${who} queen storms your shore` : `${who} queen comes ashore on your shore`;
}

/** News from afar: two other warlords, told in the third person. */
function distantShipCaption(m) {
	const actor = m.attackerName || 'A rival';
	const actorShip = capitalise(possessive(m.attackerName || 'a rival'));
	const other = possessive(m.victimName || 'a rival');
	switch (m.scene) {
		case 'seized': return `${actor} seizes ${other} longship`;
		case 'boarded': return `${actorShip} ${crewWord(m.pieceType)} boards ${other} longship`;
		case 'lost': return `${actorShip} longship is lost with all hands`;
		case 'newkeel': return `A new keel is laid for ${actor}`;
		default: return '';
	}
}

function shipCaption(m) {
	if (m.distant) return distantShipCaption(m);
	const you = !!m.attackerIsYou;
	const actor = capitalise(whose(m.attackerName, you));
	const other = whose(m.victimName, !!m.victimIsYou);
	switch (m.scene) {
		case 'embark':
			return `${actor} ${crewWord(m.pieceType)} steps aboard ${you ? 'your' : 'a'} longship`;
		case 'lifeboat':
			return `${actor} ${crewWord(m.pieceType)} takes to the longship as the sea rises`;
		case 'setsail': {
			const type = normalisePieceType(m.pieceType);
			// Stepped aboard and sailed within moments: one card for both.
			if (m.embarked) return `${actor} ${crewWord(m.pieceType)} embarks and sets sail`;
			const ship = `${actor} longship sets sail`;
			return type ? `${ship} with ${you ? 'your' : 'its'} ${type} aboard` : ship;
		}
		case 'landing':
			return `${actor} ${crewWord(m.pieceType)} lands on ${other} shore`;
		case 'raid':
			return `${actor} raiders storm ${other} shore`;
		case 'raidcheck':
			return you ? `Your raiders put ${other} king in check` : `${actor} raiders threaten your king`;
		case 'boarded':
			return `${actor} ${crewWord(m.pieceType)} boards ${other} longship`;
		case 'seized':
			if (you) return `You seize ${other} longship`;
			return m.attackerName ? `Your longship is seized by ${m.attackerName}` : 'Your longship is seized';
		case 'lost':
			return you ? 'Your longship is lost with all hands' : `${actor} longship is lost with all hands`;
		case 'emptysunk':
			return you ? 'The sea swallows your longship and its oarsmen' : `The sea swallows ${whose(m.attackerName, false)} longship and its oarsmen`;
		case 'newkeel':
			return you ? 'A new keel is laid for you' : `A new keel is laid for ${m.attackerName || 'a rival'}`;
		default:
			return '';
	}
}

/**
 * The caption for a painting moment (see paintingEvents.js for shapes).
 *
 * @param {Object} moment
 * @returns {string}
 */
export function captionFor(moment) {
	if (!moment) return '';
	switch (moment.kind) {
		case 'capture': {
			const attacker = pieceWord(moment.attackerType);
			const victim = pieceWord(moment.victimType);
			const verb = VERBS[normalisePieceType(moment.attackerType)] || 'takes';
			// Non-breaking, so a wrapped caption never strands "more".
			const more = moment.extra > 0 ? `\u00a0…and\u00a0${moment.extra}\u00a0more` : '';
			return capitalise(
				`${possessive(moment.attackerName, moment.attackerIsYou)} ${attacker} ${verb} `
				+ `${possessive(moment.victimName, moment.victimIsYou)} ${victim}${more}`,
			);
		}
		case 'kingfall':
			return capitalise(`${possessive(moment.victimName, moment.victimIsYou)} king has fallen`);
		case 'ship':
			return shipCaption(moment);
		// These are the viewer's own moments: with no name to give, the
		// title simply goes without one rather than calling them a rival.
		case 'arrival': {
			if (moment.viaShip) return queenAshoreCaption(moment);
			const ashore = `A ${pieceWord(moment.pieceType)} comes ashore`;
			return moment.playerName ? `${ashore} for ${moment.playerName}` : ashore;
		}
		case 'battle': {
			const word = moment.outcome === 'victory' ? 'Victory' : 'Defeat';
			return moment.playerName ? `${word} for ${moment.playerName}` : word;
		}
		default:
			return '';
	}
}

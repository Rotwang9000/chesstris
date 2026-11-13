/**
 * A line of text for every longship event that happens TO the local
 * player (Viking edition). The painting cards are once per scene per
 * battle, can be crowded out and can be turned off; these notices are
 * always there, so a ship never changes hands, sinks or comes ashore on
 * your land in silence.
 *
 * Pure: `shipEventToast(detail, ctx)` returns `{text, variant}` or null.
 * shipControls.js shows it.
 *
 *   seized   your ship taken / you take one          (alert when you lose it)
 *   sunk     your ship goes down (with its passenger)
 *   lost     your ship destroyed (king absorbed, detonation); 'seized' and
 *            'sunk' were already told above, so not again
 *   built    a new keel at your mooring
 *   land     an enemy lands on your shore            (alert)
 *   raid     an enemy raids your shore               (alert)
 */

import { displayNameOf } from '../paintings/paintingCaptions.js';

function same(a, b) {
	return a != null && b != null && String(a) === String(b);
}

/** "Bot 2’s", "Hans’" (names ending in s take a bare apostrophe). */
function possessive(who) {
	return /s$/i.test(who) ? `${who}’` : `${who}’s`;
}

function pieceName(type) {
	const t = String(type || '').toLowerCase();
	return t && t !== 'undefined' && t !== 'null' ? t : 'warrior';
}

/**
 * @param {Object} detail  the `tetches:ship` event detail (shipEvents.js)
 * @param {Object} ctx
 * @param {string} ctx.localId           the viewer's seat
 * @param {Object} [ctx.players]         gameState.players, for names
 * @param {(shipId:string)=>string|null} [ctx.ownerOf]  who controlled a ship
 * @param {(pieceId:string)=>string|null} [ctx.pieceTypeOf]
 * @param {string|null} [ctx.localName]
 * @returns {{text:string, variant:'info'|'alert'|'success'}|null}
 */
export function shipEventToast(detail, ctx = {}) {
	const me = ctx.localId;
	if (!detail || me == null) return null;
	const name = (id) => displayNameOf(ctx.players || {}, id, { localId: me, localName: ctx.localName || null })
		|| 'A rival';
	switch (detail.kind) {
		case 'seized': {
			const boarded = detail.seizeKind === 'boarded';
			if (same(detail.from, me) && !same(detail.to, me)) {
				return {
					text: boarded
						? `${name(detail.to)} boards your longship and takes it!`
						: `${name(detail.to)} seizes your empty longship!`,
					variant: 'alert',
				};
			}
			if (same(detail.to, me) && !same(detail.from, me)) {
				return {
					text: boarded
						? `You board ${possessive(name(detail.from))} longship: she is yours.`
						: `You seize ${possessive(name(detail.from))} longship: she is yours.`,
					variant: 'success',
				};
			}
			return null;
		}
		case 'sunk': {
			const owner = typeof ctx.ownerOf === 'function' ? ctx.ownerOf(String(detail.shipId)) : null;
			if (!same(owner, me)) return null;
			if (detail.passengerId != null) {
				const type = typeof ctx.pieceTypeOf === 'function' ? ctx.pieceTypeOf(String(detail.passengerId)) : null;
				return { text: `The sea takes your longship, and your ${pieceName(type)} with her!`, variant: 'alert' };
			}
			return { text: 'The sea takes your empty longship.', variant: 'alert' };
		}
		case 'lost':
			if (!same(detail.seatId, me) || detail.reason !== 'destroyed') return null;
			return { text: 'Your longship is destroyed. A new keel is laid at your mooring in 45 s.', variant: 'alert' };
		case 'built':
			if (!same(detail.seatId, me)) return null;
			return { text: 'A new longship is built at your mooring.', variant: 'success', icon: 'longship' };
		case 'land':
		case 'raid': {
			const move = detail.move || {};
			const landOwner = move.ship?.landOwner;
			if (!same(landOwner, me) || same(move.playerId, me)) return null;
			const whose = possessive(name(move.playerId));
			const piece = pieceName(move.movedPiece?.type);
			if (detail.kind === 'raid') {
				const lost = move.capturedPiece?.type ? ` and takes your ${pieceName(move.capturedPiece.type)}` : '';
				return { text: `⚔ ${whose} ${piece} raids your shore${lost}!`, variant: 'alert' };
			}
			return { text: `${whose} ${piece} lands on your shore!`, variant: 'alert', icon: 'longship' };
		}
		default:
			return null;
	}
}

/**
 * A fair chance to answer (server/world/captureShield.js), from the
 * 2026-11-26 report: a bot's knight took a brand-new kingdom's eleven
 * pieces and king in 100 s, seconds after it was founded.
 */

const path = require('path');
const shield = require(path.join('..', '..', 'server', 'world', 'captureShield'));
const pieces = require(path.join('..', '..', 'server', 'game', 'pieces'));

const { SHIELD, shieldVeto, noteCapture, shelter } = shield;

function world() {
	return {
		players: {
			raider: { id: 'raider', isComputer: true },
			me: { id: 'me' },
			other: { id: 'other' },
			seat: { id: 'seat', battleId: 'b1' },
			seat2: { id: 'seat2', battleId: 'b1' },
		},
		chessPieces: [],
		board: { cells: {} },
	};
}

describe('shelter', () => {
	test('a new kingdom cannot be captured from until its shelter ends', () => {
		const w = world();
		const t = 1000000;
		shelter(w, 'me', SHIELD.NEW_KINGDOM_MS, t);
		const veto = shieldVeto(w, 'raider', 'me', t + 1000);
		expect(veto.reason).toBe('sheltered');
		expect(veto.waitMs).toBe(SHIELD.NEW_KINGDOM_MS - 1000);
		expect(shieldVeto(w, 'raider', 'me', t + SHIELD.NEW_KINGDOM_MS + 1)).toBeNull();
	});

	test('capturing something ends your own shelter', () => {
		const w = world();
		shelter(w, 'me', SHIELD.NEW_KINGDOM_MS, 0);
		noteCapture(w, 'me', 'raider', 10);
		expect(shieldVeto(w, 'raider', 'me', 20)).toBeNull();
	});

	test('bots and battle seats are never sheltered; a shelter is never shortened', () => {
		const w = world();
		expect(shelter(w, 'raider', 60000, 0)).toBe(0);
		expect(shelter(w, 'seat', 60000, 0)).toBe(0);
		shelter(w, 'me', 90000, 0);
		shelter(w, 'me', 45000, 0);
		expect(w.players.me.shelteredUntil).toBe(90000);
	});
});

describe('right of reply', () => {
	test('after a capture the attacker waits for the victim to answer', () => {
		const w = world();
		noteCapture(w, 'raider', 'me', 1000);
		expect(shieldVeto(w, 'raider', 'me', 2000).reason).toBe('reply_turn');
		// someone else may still take their chance
		expect(shieldVeto(w, 'other', 'me', 2000)).toBeNull();
		// the victim moves: the attacker may go again
		w.players.me.lastChessMoveAt = 3000;
		expect(shieldVeto(w, 'raider', 'me', 3001)).toBeNull();
	});

	test('an idle victim is answered for after REPLY_MS', () => {
		const w = world();
		noteCapture(w, 'raider', 'me', 0);
		expect(shieldVeto(w, 'raider', 'me', SHIELD.REPLY_MS - 1)).not.toBeNull();
		expect(shieldVeto(w, 'raider', 'me', SHIELD.REPLY_MS)).toBeNull();
	});

	test('bots are covered too, and battles are left alone', () => {
		const w = world();
		noteCapture(w, 'me', 'raider', 0);
		expect(shieldVeto(w, 'me', 'raider', 10).reason).toBe('reply_turn');
		noteCapture(w, 'seat', 'seat2', 0);
		expect(shieldVeto(w, 'seat', 'seat2', 10)).toBeNull();
	});

	test('every capture path notes the reply: removePiece as captured', () => {
		const w = world();
		w.chessPieces.push({ id: 'p1', player: 'me', type: 'PAWN', position: { x: 1, z: 1 } });
		pieces.removePiece(w, 'p1', {
			reason: pieces.REMOVAL_REASONS.CAPTURED,
			capturedBy: { playerId: 'raider', pieceType: 'KNIGHT', pieceId: 'k1' },
			silent: true,
		});
		expect(Number(w.players.me.answerDue.raider)).toBeGreaterThan(0);
		expect(shieldVeto(w, 'raider', 'me').reason).toBe('reply_turn');
	});
});

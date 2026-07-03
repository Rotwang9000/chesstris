/**
 * Player-colour resolver (public/js/boardFunctions/colours.js).
 *
 * Pins the three colour sources the board renderer relies on:
 *   - the local player's fixed warm-wood palette,
 *   - remote players hashed onto a stable blue/green hue,
 *   - battle seats painted in their server-declared army colour
 *     (softened toward the board neutral for cells, raw for pieces).
 */

import { getPlayerColor } from '../../public/js/boardFunctions/colours.js';

describe('getPlayerColor', () => {
	const WORLD_STATE = {
		localPlayerId: 'me',
		players: {
			me: { id: 'me', name: 'Me' },
			rival: { id: 'rival', name: 'Rival' },
		},
	};

	test('local player gets the warm wood palette', () => {
		expect(getPlayerColor('me', WORLD_STATE, 'home')).toBe(0xC4A265);
		expect(getPlayerColor('me', WORLD_STATE, 'tetromino')).toBe(0xDEB887);
	});

	test('remote players get a stable non-white hashed hue', () => {
		const first = getPlayerColor('rival', WORLD_STATE, 'home');
		const again = getPlayerColor('rival', WORLD_STATE, 'home');
		expect(first).toBe(again);
		expect(first).not.toBe(0xffffff);
	});

	describe('battle seats (server-declared army colour)', () => {
		const seatState = {
			localPlayerId: 'battle-abc-s0',
			players: {
				'battle-abc-s0': { id: 'battle-abc-s0', battleId: 'ABC', color: '#e6e6e6' },
				'battle-abc-s1': { id: 'battle-abc-s1', battleId: 'ABC', color: '#4488dd' },
				civilian: { id: 'civilian' },
			},
		};

		test('chess pieces use the raw seat colour', () => {
			expect(getPlayerColor('battle-abc-s1', seatState, 'chess')).toBe(0x4488dd);
		});

		test('cells blend the seat colour toward the board neutral', () => {
			const cell = getPlayerColor('battle-abc-s1', seatState, 'home');
			// Blended: nudged from pure #4488dd toward the tan neutral —
			// channel order preserved (still blue-dominant), never white.
			const r = (cell >> 16) & 0xff, g = (cell >> 8) & 0xff, b = cell & 0xff;
			expect(b).toBeGreaterThan(r);
			expect(cell).not.toBe(0x4488dd);
			expect(cell).not.toBe(0xffffff);
		});

		test('the LOCAL seat also uses its army colour (not the wood palette)', () => {
			// In a battle every army must match its piece colour — the
			// warm-wood "this is me" palette would break the mapping.
			const mine = getPlayerColor('battle-abc-s0', seatState, 'home');
			expect(mine).not.toBe(0xC4A265);
		});

		test('non-seat players are unaffected by the seat path', () => {
			const colour = getPlayerColor('civilian', seatState, 'home');
			expect(colour).not.toBe(0x4488dd);
		});

		test('a seat without a colour string falls back to the hash palette', () => {
			const state = {
				players: { 'battle-x-s0': { battleId: 'X', color: null } },
			};
			const colour = getPlayerColor('battle-x-s0', state, 'home');
			expect(Number.isFinite(colour)).toBe(true);
		});
	});
});

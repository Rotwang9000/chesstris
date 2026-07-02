/**
 * View-isolation rules for battle mode (public/js/battle/battleRules.js).
 *
 * "The edge of the game is the edge of the world": while seated in a
 * battle only the own arena is visible; outside a battle the remote
 * battle-arena region never renders. These rules drive both the board
 * renderer and the chess-piece renderer, so regressions here mean
 * either the global world bleeding into battles or arenas flickering
 * into the organic world's view.
 */

import {
	BATTLE_REGION_MIN_DISTANCE,
	battleViewRadius,
	battlePlayRadius,
	isBattleRegionCell,
	isCellVisibleInCurrentView,
} from '../../public/js/battle/battleRules.js';

describe('battleRules view isolation', () => {
	const ARENA_CENTRE = { x: 2000, z: 2000 };
	const inBattle = {
		activeBattle: { id: 'ABC123', code: 'ABC123', centre: ARENA_CENTRE },
	};
	const noBattle = { activeBattle: null };
	const VIEW_RADIUS = battleViewRadius(inBattle.activeBattle);

	describe('outside a battle (organic world view)', () => {
		test('organic-world cells are visible', () => {
			expect(isCellVisibleInCurrentView(noBattle, 0, 0)).toBe(true);
			expect(isCellVisibleInCurrentView(noBattle, 150, -200)).toBe(true);
		});

		test('battle-region cells are hidden', () => {
			expect(isCellVisibleInCurrentView(noBattle, ARENA_CENTRE.x, ARENA_CENTRE.z)).toBe(false);
			expect(isCellVisibleInCurrentView(noBattle, 1500, 0)).toBe(false);
		});

		test('missing gameState behaves like "no battle"', () => {
			expect(isCellVisibleInCurrentView(null, 10, 10)).toBe(true);
			expect(isCellVisibleInCurrentView(undefined, 2000, 2000)).toBe(false);
		});
	});

	describe('seated in a battle (arena-only view)', () => {
		test('own arena cells are visible (play area, ring, margin)', () => {
			expect(isCellVisibleInCurrentView(inBattle, ARENA_CENTRE.x, ARENA_CENTRE.z)).toBe(true);
			// Ring wall (radius 15-16 for a 2-seat arena) stays inside the view.
			expect(isCellVisibleInCurrentView(inBattle, ARENA_CENTRE.x + 16, ARENA_CENTRE.z)).toBe(true);
			expect(isCellVisibleInCurrentView(
				inBattle, ARENA_CENTRE.x + VIEW_RADIUS, ARENA_CENTRE.z
			)).toBe(true);
		});

		test('a larger (3-4 seat) arena widens both radii from the server value', () => {
			const bigBattle = { id: 'B', centre: ARENA_CENTRE, playRadius: 16 };
			const bigState = { activeBattle: bigBattle };
			expect(battlePlayRadius(bigBattle)).toBe(16);
			// Its ring (17-18) and margin stay visible…
			expect(isCellVisibleInCurrentView(bigState, ARENA_CENTRE.x + 18, ARENA_CENTRE.z)).toBe(true);
			expect(isCellVisibleInCurrentView(
				bigState, ARENA_CENTRE.x + battleViewRadius(bigBattle), ARENA_CENTRE.z
			)).toBe(true);
			// …and it still can't see the neighbouring arena slot.
			expect(isCellVisibleInCurrentView(bigState, ARENA_CENTRE.x + 64, ARENA_CENTRE.z)).toBe(false);
		});

		test('the organic world is hidden', () => {
			expect(isCellVisibleInCurrentView(inBattle, 0, 0)).toBe(false);
			expect(isCellVisibleInCurrentView(inBattle, 100, 100)).toBe(false);
		});

		test('OTHER arenas are hidden (adjacent slot is 64 cells away)', () => {
			expect(isCellVisibleInCurrentView(inBattle, ARENA_CENTRE.x + 64, ARENA_CENTRE.z)).toBe(false);
		});

		test('cells just past the view radius are hidden', () => {
			expect(isCellVisibleInCurrentView(
				inBattle, ARENA_CENTRE.x + VIEW_RADIUS + 1, ARENA_CENTRE.z
			)).toBe(false);
		});

		test('a battle without a centre (lobby) falls back to world view', () => {
			const lobbyState = { activeBattle: { id: 'X', centre: null } };
			expect(isCellVisibleInCurrentView(lobbyState, 0, 0)).toBe(true);
			expect(isCellVisibleInCurrentView(lobbyState, 2000, 2000)).toBe(false);
		});
	});

	describe('isBattleRegionCell', () => {
		test('threshold sits between the organic world and the arena grid', () => {
			expect(isBattleRegionCell(0, 0)).toBe(false);
			expect(isBattleRegionCell(300, 300)).toBe(false);
			expect(isBattleRegionCell(BATTLE_REGION_MIN_DISTANCE, 0)).toBe(true);
			expect(isBattleRegionCell(2000, 2000)).toBe(true);
		});
	});
});

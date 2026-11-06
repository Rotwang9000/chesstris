/**
 * @jest-environment jsdom
 *
 * The client's copy of the rising-sea maths must agree with the server
 * to the millisecond, or the flashing warning would point at the wrong
 * cells and placement predictions would disagree with the server.
 */

import { seaSinkAt, cellsSinkingBetween, isCellInsideOwnArena, withClockOffset, serverNow, seaBlockAt } from '../../public/js/battle/battleRules.js';
import { seaHudText } from '../../public/js/battle/seaOverlay.js';

const serverSea = require('../../server/battle/sea');

function serverBattle(seatCount = 2) {
	return {
		mode: 'quick', status: 'active', centre: { x: 2064, z: 2000 },
		playRadius: seatCount >= 3 ? 16 : 14, seatCount, startedAt: 1_700_000_000_000,
	};
}

function clientBattle(battle) {
	return { id: 'b1', centre: battle.centre, playRadius: battle.playRadius, sea: serverSea.publicSea(battle) };
}

describe('rising sea — client mirror', () => {
	test.each([2, 4])('sink times match the server for every cell (%i seats)', (seats) => {
		const battle = serverBattle(seats);
		const client = clientBattle(battle);
		const r = serverSea.outerBand(battle) + 1;
		for (let x = battle.centre.x - r; x <= battle.centre.x + r; x++) {
			for (let z = battle.centre.z - r; z <= battle.centre.z + r; z++) {
				const a = serverSea.sinkAtMs(battle, x, z);
				const b = seaSinkAt(client, x, z);
				if (a === Infinity) continue;
				expect(b).toBeCloseTo(a, 6);
			}
		}
		expect(cellsSinkingBetween(client, 0, Infinity).length)
			.toBe(serverSea.cellsSinkingBetween(battle, 0, Infinity).length);
	});

	test('the sea block is on the cell sinking now, gliding to the next', () => {
		const battle = serverBattle();
		const client = clientBattle(battle);
		const order = serverSea.cellsSinkingBetween(battle, 0, Infinity);
		const t = order[10].t + serverSea.SEA.CELL_MS / 2;
		const at = seaBlockAt(client, t);
		expect(at).toMatchObject({ index: 10, x: order[10].x, z: order[10].z, nextX: order[11].x, nextZ: order[11].z });
		expect(at.glide).toBeCloseTo(0.5, 6);
		expect(seaBlockAt(client, client.sea.startsAt - 1)).toBeNull();
		expect(seaBlockAt(client, client.sea.endsAt)).toBeNull();
	});

	test('no sea, no sinking', () => {
		expect(seaSinkAt({ centre: { x: 0, z: 0 }, sea: null }, 0, 3)).toBe(Infinity);
	});

	test('placement prediction refuses sunk ground, using the server clock', () => {
		const battle = serverBattle();
		const edge = { x: battle.centre.x, z: battle.centre.z - 14 };
		const t = serverSea.sinkAtMs(battle, edge.x, edge.z);
		// Our clock runs 5 s behind the server's.
		const sea = withClockOffset({ ...serverSea.publicSea(battle), serverNow: t + 1 }, t + 1 - 5000);
		const gameState = { activeBattle: { ...clientBattle(battle), sea } };
		expect(serverNow(gameState.activeBattle, t + 1 - 5000)).toBe(t + 1);
		const realNow = Date.now;
		try {
			Date.now = () => t + 1 - 5000;
			expect(isCellInsideOwnArena(gameState, edge.x, edge.z)).toBe(false);
			expect(isCellInsideOwnArena(gameState, battle.centre.x, battle.centre.z)).toBe(true);
		} finally {
			Date.now = realNow;
		}
	});

	test('the countdown label reads naturally', () => {
		const sea = { startsAt: 100_000, endsAt: 500_000 };
		expect(seaHudText(sea, 77_000)).toBe('🌊 The sea starts rising in 23s');
		expect(seaHudText(sea, 200_000)).toBe('🌊 The sea is rising — arena gone in 5:00');
		expect(seaHudText(sea, 500_000)).toBe('');
		expect(seaHudText(null, 0)).toBe('');
	});
});

/**
 * Place names for cells ("Hrafnby 47" in place of "(3432, 2345)").
 */

import { placeOf, placeLabel, areaName, AREA } from '../../public/js/placeNames.js';

describe('placeOf', () => {
	test('a 100 × 100 area has one name; its 10 × 10 blocks count 1–100', () => {
		const a = placeOf(0, 0), b = placeOf(99, 99), c = placeOf(55, 12);
		expect(a.name).toBe(b.name);
		expect(a.name).toBe(c.name);
		expect(a.block).toBe(1);
		expect(b.block).toBe(100);
		expect(c.block).toBe(16);
		expect(a.text).toBe(`${a.name} 1`);
	});

	test('the same cell always has the same name (every client agrees)', () => {
		expect(placeOf(3432, 2345)).toEqual(placeOf(3432, 2345));
	});

	test('negative cells have places too', () => {
		const p = placeOf(-5, -5);
		expect(p.block).toBe(100);
		expect(p.name).toMatch(/^[A-Z][a-z]+$/);
	});

	test('names are words: no vowel pile-ups or triple letters, and plenty of them', () => {
		const names = new Set();
		for (let a = -20; a < 20; a++) {
			for (let b = -20; b < 20; b++) {
				const n = areaName(a, b);
				expect(n).not.toMatch(/(.)\1\1/);
				expect(n).not.toMatch(/[aeiou]{3}/i);
				names.add(n);
			}
		}
		expect(names.size).toBeGreaterThan(300);
		// neighbours rarely share a name
		let same = 0;
		for (let a = 0; a < 30; a++) if (areaName(a, 0) === areaName(a + 1, 0)) same++;
		expect(same).toBeLessThan(3);
		expect(AREA).toBe(100);
	});
});

describe('placeLabel', () => {
	test('a place name in the world', () => {
		expect(placeLabel(722, 460, {})).toBe(placeOf(722, 460).text);
	});

	test('inside a battle arena: coordinates from its centre', () => {
		expect(placeLabel(2005, 1990, { activeBattle: { centre: { x: 2000, z: 2000 } } })).toBe('(5, -10)');
	});

	test('debug mode adds the raw coordinates', () => {
		expect(placeLabel(10, 10, { debugMode: true })).toBe(`${placeOf(10, 10).text} (10, 10)`);
	});

	test('no position, no label', () => {
		expect(placeLabel(NaN, 3)).toBeNull();
	});
});

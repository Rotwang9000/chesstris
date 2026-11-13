/**
 * @jest-environment jsdom
 *
 * Visual polish, round 3 (art director's 7.9 review):
 *   • a toast meeting a dialog that fills the screen docks inside it
 *     (it covered the card's title or its Close button); one up before
 *     the dialog opened moves too; a hint that has gone stale fades;
 *   • the CHECK! banner docks under the top HUD in the profile's look;
 *   • results copy for a called-off Classic battle and shared places in
 *     a draw; your own seat never shows the bot icon;
 *   • hemmed-in longships are drawn smaller instead of through each other;
 *   • retro gets a sea of its own (Viking only);
 *   • cute has its own chrome in the standard edition too.
 */

import fs from 'fs';
import path from 'path';

const INDEX = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

function box(el, r) {
	el.getBoundingClientRect = () => ({ ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top });
}

describe('toasts and dialogs', () => {
	let showToastMessage;
	const realRect = Element.prototype.getBoundingClientRect;
	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();
		document.body.innerHTML = '';
		Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
		// The toasts as if laid out bottom-centre (jsdom has no layout);
		// anything else by the box a test gives it.
		Element.prototype.getBoundingClientRect = function rect() {
			const r = this.id === 'toast-container' && !this.classList.contains('toast-docked')
				? { left: 60, right: 330, top: 780, bottom: 820 }
				: (this._box || { left: 0, right: 0, top: 0, bottom: 0 });
			return { ...r, width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top };
		};
		({ showToastMessage } = require('../../public/js/showToastMessage.js'));
	});
	afterEach(() => {
		Element.prototype.getBoundingClientRect = realRect;
		jest.useRealTimers();
	});

	/** A dialog filling the phone screen. */
	function fullScreenDialog() {
		const d = document.createElement('div');
		d.className = 'tx-panel tx-dialog';
		d.appendChild(document.createElement('h2'));
		document.body.appendChild(d);
		d._box = { left: 10, right: 380, top: 12, bottom: 832 };
		return d;
	}

	test('with no room above or below the card, the toast docks inside it, first thing', () => {
		const d = fullScreenDialog();
		showToastMessage('Battle over — you were defeated.', { variant: 'alert', duration: 4000 });
		const c = document.getElementById('toast-container');
		expect(c.classList.contains('toast-docked')).toBe(true);
		expect(c.parentElement).toBe(d);
		expect(d.firstElementChild).toBe(c);
	});

	test('a short card: the toast goes just above it instead', () => {
		const d = fullScreenDialog();
		d._box = { left: 10, right: 380, top: 300, bottom: 800 };
		showToastMessage('Server timeout — try again', { variant: 'alert', duration: 4000 });
		const c = document.getElementById('toast-container');
		expect(c.classList.contains('toast-docked')).toBe(false);
		expect(c.style.bottom).toBe(`${844 - 300 + 10}px`);
	});

	test('a toast up before the dialog opened moves off it, and back out when it closes', () => {
		showToastMessage('Battle code copied', { variant: 'success', duration: 12000 });
		const c = document.getElementById('toast-container');
		expect(c.parentElement).toBe(document.body);
		const d = fullScreenDialog();
		jest.advanceTimersByTime(300);
		expect(c.parentElement).toBe(d);
		// the dialog is hidden: the next look puts the toasts back on the screen
		d._box = { left: 0, right: 0, top: 0, bottom: 0 };
		jest.advanceTimersByTime(300);
		expect(c.parentElement).toBe(document.body);
		expect(c.classList.contains('toast-docked')).toBe(false);
	});

	test('the docked look is in the theme', () => {
		expect(INDEX).toMatch(/#toast-container\.toast-docked \{[^}]*position: sticky !important/);
	});

	test('a hint whose stillTrue turns false fades while it is up', () => {
		let chosen = true;
		showToastMessage('Empty longship: tap a glowing tile to sail.', { duration: 2600, stillTrue: () => chosen });
		const c = document.getElementById('toast-container');
		expect(c.children).toHaveLength(1);
		chosen = false;
		jest.advanceTimersByTime(300);
		expect(c.children[0].dataset.leaving).toBe('1');
		jest.advanceTimersByTime(400);
		expect(c.children).toHaveLength(0);
	});
});

describe('CHECK! banner', () => {
	test('docks just under the top HUD, themed by tokens and per profile', () => {
		const src = fs.readFileSync(path.join(__dirname, '../../public/js/checkAlert.js'), 'utf8');
		expect(src).toMatch(/function placeBanner\(\)/);
		expect(src).toMatch(/topHudBottom\(/);
		expect(src).toMatch(/var\(--tx-danger-bg/);
		expect(src).toMatch(/html\[data-render-profile="retro"\] #\$\{BANNER_ID\}/);
		expect(src).toMatch(/var\(--tx-frame\) border-box/);
	});

	test('topHudBottom is the lowest top-HUD edge', () => {
		jest.resetModules();
		document.body.innerHTML = '<h1 class="game-title"></h1><div id="next-tetromino-display"></div><div id="longship-button"></div>';
		Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
		box(document.querySelector('.game-title'), { left: 10, right: 200, top: 10, bottom: 40 });
		box(document.getElementById('next-tetromino-display'), { left: 240, right: 380, top: 10, bottom: 140 });
		box(document.getElementById('longship-button'), { left: 220, right: 380, top: 150, bottom: 195 });
		const { topHudBottom } = require('../../public/js/showToastMessage.js');
		expect(topHudBottom()).toBe(195);
	});
});

describe('results card', () => {
	const { describeOutcome, showBattleResults, closeBattleResults } = require('../../public/js/battle/battleResults.js');
	const rows = [
		{ seatId: 'me', name: 'Ann', isAi: true, alive: true, place: 1, moves: 3, captures: 0 },
		{ seatId: 'b', name: 'Bot 2', isAi: true, alive: true, place: 2, moves: 4, captures: 1 },
	];

	test('a Classic battle everyone left is called off, not "Swept away"', () => {
		const o = describeOutcome({ battle: { mode: 'classic' }, results: { reason: 'abandoned', standings: rows }, mySeatId: 'me' });
		expect(o.title).toBe('Battle called off');
		expect(o.subtitle).not.toMatch(/went under/);
	});

	test('a Classic draw is not sea copy; a Quick one still is', () => {
		expect(describeOutcome({ battle: { mode: 'classic' }, results: { standings: [] }, mySeatId: 'me' }).title).toBe('A draw');
		expect(describeOutcome({ battle: { mode: 'quick' }, results: { reason: 'sea', standings: [] }, mySeatId: 'me' }).title).toBe('Swept away');
	});

	test('a draw shares first place, and your own seat has no bot icon', () => {
		showBattleResults({ battle: { code: 'ABC', mode: 'classic' }, results: { reason: 'abandoned', standings: rows }, mySeatId: 'me' });
		const places = [...document.querySelectorAll('.tx-place')].map(n => n.textContent);
		expect(places).toEqual(['=1st', '=1st']);
		const names = [...document.querySelectorAll('.tx-name')].map(n => n.textContent);
		expect(names[0]).toBe('Ann (you)');
		expect(names[1]).toBe('🤖 Bot 2');
		closeBattleResults();
	});
});

describe('longships hemmed in', () => {
	const L = require('../../public/js/viking/shipLayout.js');
	const E = { dx: 1, dz: 0 };

	test('two ships in a short one-square slip are drawn small enough to clear the land and each other', () => {
		const slip = (x, z) => z !== 0 || x > 3 || x < -1;
		const res = L.layoutFleet([
			{ id: 'a', x: 0, z: 0, prefer: E },
			{ id: 'b', x: 2, z: 0, prefer: E },
		], slip);
		const a = res.get('a'), b = res.get('b');
		expect(Math.min(a.k, b.k)).toBeLessThan(1);
		for (const k of [a.k, b.k]) expect(k).toBeGreaterThanOrEqual(L.SHIP_MIN_FIT);
		const ba = L.scaledHullBox(0, 0, a.d, a.s, a.c, a.k);
		const bb = L.scaledHullBox(2, 0, b.d, b.s, b.c, b.k);
		expect(L.boxOverlap(ba, bb)).toBe(0);
		// (as clear of the land as the smallest step allows)
		const before = L.landOverlap(L.scaledHullBox(0, 0, a.d, a.s, a.c, 1), slip) + L.landOverlap(L.scaledHullBox(2, 0, b.d, b.s, b.c, 1), slip);
		expect(L.landOverlap(ba, slip) + L.landOverlap(bb, slip)).toBeLessThan(before);
	});

	test('the scaled box at k = 1 is the hull box', () => {
		const h = L.hullBox(3, 4, { dx: 0, dz: -1 }, 0.4, 0.2);
		const sb = L.scaledHullBox(3, 4, { dx: 0, dz: -1 }, 0.4, 0.2, 1);
		for (const key of ['x0', 'x1', 'z0', 'z1']) expect(sb[key]).toBeCloseTo(h[key], 1);
	});

	test('a ship with room keeps its full size', () => {
		const r = L.layoutFleet([{ id: 'a', x: 0, z: 0, prefer: E }], () => false).get('a');
		expect(r.k).toBe(1);
	});
});

describe('retro sea', () => {
	const { retroSeaWanted } = require('../../public/js/viking/retroSea.js');
	test('only for the retro profile in the Viking edition', () => {
		const yes = () => true, no = () => false;
		expect(retroSeaWanted({ renderProfile: 'retro' }, yes)).toBe(true);
		expect(retroSeaWanted({ renderProfile: 'retro' }, no)).toBe(false);
		expect(retroSeaWanted({ renderProfile: 'cute' }, yes)).toBe(false);
		expect(retroSeaWanted(null, yes)).toBe(false);
	});
});

describe('cute chrome', () => {
	test('the standard edition has a cute token set of its own, and a rounded face', () => {
		expect(INDEX).toMatch(/html\[data-render-profile="cute"\]:not\(\[data-edition="viking"\]\) \{[^}]*--tx-panel-bg/);
		expect(INDEX).toMatch(/--tx-font-display: 'Tetches Fredoka'/);
		for (const f of ['cute-fredoka-600.woff2', 'cute-fredoka-700.woff2']) {
			const bytes = fs.readFileSync(path.join(__dirname, '../../public/fonts', f));
			expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
			expect(bytes.length).toBeLessThan(20 * 1024);
		}
		expect(fs.readFileSync(path.join(__dirname, '../../public/fonts/OFL-Fredoka.txt'), 'utf8')).toMatch(/SIL Open Font License/);
	});

	test('the Fredoka face is used only by cute-keyed rules', () => {
		const css = INDEX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*{[^}]*}/g, '');
		const uses = [...css.matchAll(/([^{}]+)\{[^}]*Tetches Fredoka[^}]*\}/g)].map(m => m[1].trim());
		expect(uses.length).toBeGreaterThan(0);
		for (const sel of uses) expect(sel).toMatch(/data-render-profile="cute"/);
	});
});

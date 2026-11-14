/**
 * @jest-environment jsdom
 *
 * Viking visual polish, round 4:
 *   • the fleet layout: no hull lies in land or inside another hull (a
 *     ship in a slip lies out of it; two crowding a corner share it);
 *   • power-up orbs are carved rune stones in a Viking battle (and the
 *     standard orb everywhere else);
 *   • toasts come one at a time while longships are drawn;
 *   • a portrait phone's Viking home view stands lower, so the sky and
 *     the ridges show above the far shore;
 *   • the sun's road of glints starts faded in front of the eye.
 */

import * as THREE from 'three';
import {
	layoutFleet, hullBox, landOverlap, boxOverlap, HULL_FORE, HULL_AFT, SHIP_SCALE, MODEL_LENGTH,
} from '../../public/js/viking/shipLayout.js';

const D = { N: { dx: 0, dz: 1 }, E: { dx: 1, dz: 0 }, S: { dx: 0, dz: -1 }, W: { dx: -1, dz: 0 } };

describe('fleet layout', () => {
	const fromSet = (keys) => { const s = new Set(keys); return (x, z) => s.has(`${x},${z}`); };

	test('the hull box is the model: ~3.4 squares long, a little forward of its square', () => {
		expect(HULL_FORE + HULL_AFT).toBeCloseTo(SHIP_SCALE * MODEL_LENGTH, 5);
		const b = hullBox(0, 0, D.N, 0, 0);
		expect(b.z1).toBeCloseTo(HULL_FORE, 5);
		expect(b.z0).toBeCloseTo(-HULL_AFT, 5);
		expect(b.x1 - b.x0).toBeLessThan(0.8);
	});

	test('a ship in a slip lies out of it, bow to the open water, clear of the land', () => {
		const isLand = fromSet(['-1,0', '1,0', '0,-1', '-1,-1', '1,-1', '-1,1', '1,1']);
		const r = layoutFleet([{ id: 'a', x: 0, z: 0, prefer: D.N }], isLand).get('a');
		expect(r.d).toEqual(D.N);
		expect(r.s).toBeGreaterThan(0.9);
		expect(landOverlap(hullBox(0, 0, r.d, r.s, r.c), isLand)).toBe(0);
	});

	test('a moored hull lies a little off the quay it touches', () => {
		const isLand = (x, z) => z >= 1;
		const r = layoutFleet([{ id: 'a', x: 0, z: 0, prefer: D.E }], isLand).get('a');
		expect(r.d).toEqual(D.E);
		expect(r.dz).toBeLessThan(-0.2);            // away from the quay (+z)
		expect(landOverlap(hullBox(0, 0, r.d, r.s, r.c), isLand)).toBe(0);
	});

	test('two ships end to end in open water lie side by side, not inside each other', () => {
		const res = layoutFleet([
			{ id: 'a', x: 0, z: 0, prefer: D.E },
			{ id: 'b', x: 1, z: 0, prefer: D.E },
		], () => false);
		const a = res.get('a'), b = res.get('b');
		expect(boxOverlap(hullBox(0, 0, a.d, a.s, a.c), hullBox(1, 0, b.d, b.s, b.c))).toBe(0);
	});

	test('two ships crowding a corner by a wall both find room (no land, no overlap)', () => {
		const wall = (x) => x <= -1;
		const res = layoutFleet([
			{ id: 'ship-2', x: 0, z: 1, prefer: D.N },
			{ id: 'ship-4', x: 0, z: 0, prefer: D.N },
		], wall);
		const a = res.get('ship-2'), b = res.get('ship-4');
		const ba = hullBox(0, 1, a.d, a.s, a.c), bb = hullBox(0, 0, b.d, b.s, b.c);
		expect(boxOverlap(ba, bb)).toBe(0);
		expect(landOverlap(ba, wall) + landOverlap(bb, wall)).toBeLessThan(0.05);
	});

	test('a ship under way keeps the heading it sails', () => {
		const r = layoutFleet([{ id: 'a', x: 0, z: 0, prefer: D.W, fixedDir: D.W, moving: true }], () => false).get('a');
		expect(r.d).toEqual(D.W);
	});

	test('it remembers where a ship lay: a settled layout does not jump about', () => {
		const isLand = (x, z) => z >= 1;
		const first = layoutFleet([{ id: 'a', x: 0, z: 0, prefer: D.E }], isLand).get('a');
		const again = layoutFleet([{ id: 'a', x: 0, z: 0, prefer: D.E, prev: { d: first.d, s: first.s, c: first.c } }], isLand).get('a');
		expect(again).toMatchObject({ d: first.d, s: first.s, c: first.c });
	});
});

describe('rune stones', () => {
	beforeAll(() => {
		const ctx = new Proxy({}, {
			get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient')
				? () => ({ addColorStop() {} })
				: () => {},
			set: () => true,
		});
		HTMLCanvasElement.prototype.getContext = function () { return ctx; };
	});

	const orbVisual = (pieceType) => {
		const g = new THREE.Group();
		const block = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
		const wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
		const tether = new THREE.Mesh(new THREE.CylinderGeometry(), new THREE.MeshBasicMaterial());
		const core = new THREE.Group();
		core.add(new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()));
		g.add(block, wire, tether, core);
		g.userData = {
			pieceType, baseY: 1.6, orbCore: core, block, wireframe: wire, tether,
			blockMaterial: block.material, wireMaterial: wire.material, tetherMaterial: tether.material,
		};
		return g;
	};

	test('every piece type has a rune', async () => {
		const { RUNES } = await import('../../public/js/viking/runeStone.js');
		for (const t of ['PAWN', 'KNIGHT', 'BISHOP', 'ROOK', 'QUEEN']) expect(RUNES[t].length).toBeGreaterThan(1);
	});

	test('the glowing sphere, box and wireframe become a carved stone over a ring of light', async () => {
		const { dressRuneStone, isRuneStone } = await import('../../public/js/viking/runeStone.js');
		const v = orbVisual('KNIGHT');
		const { block, wireframe } = v.userData;
		expect(dressRuneStone(THREE, v)).toBe(true);
		expect(isRuneStone(v)).toBe(true);
		expect(block.parent).toBeNull();
		expect(wireframe.parent).toBeNull();
		expect(v.userData.wireframe).toBeNull();
		const names = [];
		v.traverse(o => names.push(o.name));
		expect(names).toEqual(expect.arrayContaining(['rune-stone', 'rune-glyph', 'rune-halo', 'rune-ring', 'rune-shaft']));
		expect(v.userData.orbCore.children.some(o => o.geometry && o.geometry.type === 'SphereGeometry')).toBe(false);
		// the "hide while a ship lies here" rule now hides the ring and shaft
		expect(v.userData.block.name).toBe('rune-ring');
		expect(v.userData.tether.name).toBe('rune-shaft');
		// a second call is free
		expect(dressRuneStone(THREE, v)).toBe(false);
	});
});

describe('one toast at a time while longships are drawn', () => {
	beforeEach(() => { jest.useFakeTimers(); jest.resetModules(); document.body.innerHTML = ''; });
	afterEach(() => { jest.useRealTimers(); });

	test('the second waits for the first to give way; the standard game stacks them as before', async () => {
		const T = await import('../../public/js/showToastMessage.js');
		const box = () => document.getElementById('toast-container');
		T.showToastMessage('first', 8000);
		T.showToastMessage('second', 8000);
		expect(box().childElementCount).toBe(2);           // standard: both at once

		document.body.innerHTML = '';
		T.setToastAvoider(() => null);                      // a Viking battle with longships drawn
		T.showToastMessage('one', 8000);
		T.showToastMessage('two', 8000);
		expect(box().childElementCount).toBe(1);
		expect(box().textContent).toContain('one');
		jest.advanceTimersByTime(2600);                    // read for a moment, then it makes way
		expect(box().textContent).toContain('two');
		expect(box().textContent).not.toContain('one');
		T.setToastAvoider(null);
	});
});

describe('portrait phone home view (Viking)', () => {
	test('stands lower than the standard view, so the sky shows over the far shore', async () => {
		jest.resetModules();
		jest.doMock('../../public/js/boardFunctions.js', () => ({
			boardFunctions: { getPlayersKing: (gs, id) => gs.kings?.[id] || null },
		}));
		const { moveToPlayerZone } = await import('../../public/js/setupCamera.js');
		const cam = () => ({ aspect: 0.46, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } });
		const ctl = () => ({ target: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, update() {} });
		const gs = (edition) => ({
			localPlayerId: 'me',
			board: { centreMarker: { x: 0, z: 0 }, cells: {} },
			kings: { me: { position: { x: 10, z: 20 }, orientation: 0 } },
			activeBattle: edition ? { id: 'b', edition } : null,
		});
		const pitch = (c, t) => Math.atan2(c.position.y - t.target.y, Math.hypot(c.position.x - t.target.x, c.position.z - t.target.z));
		const c1 = cam(), t1 = ctl();
		moveToPlayerZone(c1, t1, gs(null), null, null, false, true);
		const c2 = cam(), t2 = ctl();
		moveToPlayerZone(c2, t2, gs('viking'), null, null, false, true);
		const drop = (pitch(c1, t1) - pitch(c2, t2)) * 180 / Math.PI;
		expect(drop).toBeGreaterThan(8);
		expect(drop).toBeLessThan(20);
		jest.dontMock('../../public/js/boardFunctions.js');
	});
});

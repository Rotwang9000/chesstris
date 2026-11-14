/**
 * @jest-environment jsdom
 *
 * Each render profile sails its own longship (Viking edition): the cute
 * toy boat (public/js/viking/longshipCute.js) and the retro voxel sprite
 * (public/js/viking/longshipRetro.js) beside the normal strake-built
 * ship, picked by the profile (shipLayout.js shipStyleFor / SHIP_FIT /
 * sailColoursFor) and switched live by the renderer (shipRenderer.js).
 */

import * as THREE from 'three';
import {
	SHIP_FIT, SHIP_SCALE, SHIP_STRETCH_Y, MODEL_LENGTH, PASSENGER_SCALE, DECK_HEIGHT,
	shipStyleFor, shipFit, sailColoursFor, woolColours, cellHasShip, TOY_CREAM, TOY_RED, RETRO_WHITE,
} from '../../public/js/viking/shipLayout.js';
import { buildCuteLongship, CUTE_DECK_Y } from '../../public/js/viking/longshipCute.js';
import { buildRetroLongship, RETRO_DECK_Y } from '../../public/js/viking/longshipRetro.js';
import { createBake, createVoxels } from '../../public/js/viking/longshipKit.js';
import { SEA_SURFACE_Y } from '../../public/js/seaLevel.js';

// The normal hull paints canvas textures (jsdom has none): a stand-in
// with the same named parts.
jest.mock('../../public/js/viking/longship.js', () => ({
	buildLongship: jest.fn((T, opts) => {
		const g = new T.Group();
		const sailGeo = new T.PlaneGeometry(1, 1, 2, 2);
		const n = sailGeo.attributes.position.count;
		const col = new Float32Array(n * 3);
		const a = new T.Color(opts.sailColour), b = new T.Color(opts.stripeColour);
		for (let i = 0; i < n; i++) { const c = i % 2 ? b : a; col.set([c.r, c.g, c.b], i * 3); }
		sailGeo.setAttribute('color', new T.BufferAttribute(col, 3));
		const sail = new T.Mesh(sailGeo, new T.MeshBasicMaterial({ vertexColors: true }));
		sail.name = 'sail';
		g.add(sail);
		const hull = new T.Mesh(new T.BoxGeometry(1, 0.3, 7.8), new T.MeshBasicMaterial());
		hull.name = 'hull';
		g.add(hull);
		const oars = new T.InstancedMesh(new T.BoxGeometry(1, 0.02, 0.02), new T.MeshBasicMaterial(), 2);
		oars.name = 'oars';
		g.add(oars);
		g.userData = { sail, oars, oarData: [{ pivot: [0.7, 0.3, 0], side: 1, yaw: 0.2, dip: 0.1 }, { pivot: [-0.7, 0.3, 0], side: -1, yaw: 0.2, dip: 0.1 }] };
		return g;
	}),
	longshipReady: () => true,
	preloadLongship: (cb) => cb && cb(),
}));

beforeAll(() => {
	const ctx = new Proxy({}, {
		get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient')
			? () => ({ addColorStop() {} })
			: () => {},
		set: () => true,
	});
	HTMLCanvasElement.prototype.getContext = function () { return ctx; };
	window.THREE = THREE;
});

function triangles(group) {
	let n = 0;
	group.traverse((o) => {
		if (!o.isMesh) return;
		const per = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
		n += o.isInstancedMesh ? per * o.count : per;
	});
	return n;
}

describe('which longship a render profile sails', () => {
	test('the profile picks the style; anything else is the normal ship', () => {
		expect(shipStyleFor({ renderProfile: 'cute' })).toBe('cute');
		expect(shipStyleFor({ renderProfile: 'retro' })).toBe('retro');
		expect(shipStyleFor({ renderProfile: 'normal' })).toBe('normal');
		// the older flags, as theme.js reads them
		expect(shipStyleFor({ retroMode: true })).toBe('retro');
		expect(shipStyleFor({ lowQuality: true })).toBe('cute');
		expect(shipStyleFor({ renderProfile: 'nonsense' })).toBe('normal');
		expect(shipStyleFor(null)).toBe('normal');
	});

	test('each style has its deck, where the builder put it', () => {
		expect(SHIP_FIT.normal.deckY).toBe(0.14);
		expect(SHIP_FIT.cute.deckY).toBe(CUTE_DECK_Y);
		expect(SHIP_FIT.retro.deckY).toBe(RETRO_DECK_Y);
		expect(shipFit('normal').deckHeight).toBeCloseTo(DECK_HEIGHT);
		expect(shipFit('normal').passengerScale).toBe(PASSENGER_SCALE);
		expect(shipFit('cute').deckHeight).toBeCloseTo(CUTE_DECK_Y * SHIP_SCALE * SHIP_STRETCH_Y);
		expect(shipFit('bogus')).toEqual(shipFit('normal'));
		for (const s of ['cute', 'retro']) {
			expect(shipFit(s).passengerScale).toBeGreaterThan(0.4);
			expect(shipFit(s).passengerScale).toBeLessThan(0.8);
			// the passenger stands aft of the mast, on the hull
			expect(shipFit(s).passengerZ).toBeLessThan(-1);
			expect(shipFit(s).passengerZ).toBeGreaterThan(-2.5);
		}
	});

	test('sails: wool on the normal ship, candy on the cute one, phosphor on the retro one', () => {
		expect(sailColoursFor('normal', 0x2266cc)).toEqual(woolColours(0x2266cc));
		const cute = sailColoursFor('cute', '#2266cc');
		expect(cute.stripe).toBe(TOY_CREAM);
		const retro = sailColoursFor('retro', 0x2266cc);
		expect(retro.stripe).toBe(RETRO_WHITE);
		// same hue as the seat, but brighter than the wool
		const lum = (h) => 0.3 * ((h >> 16) & 255) + 0.59 * ((h >> 8) & 255) + 0.11 * (h & 255);
		expect(lum(cute.main)).toBeGreaterThan(lum(woolColours(0x2266cc).main));
		expect(lum(retro.main)).toBeGreaterThan(lum(woolColours(0x2266cc).main));
		expect(cute.main & 0xff).toBeGreaterThan((cute.main >> 16) & 0xff);   // still blue
		// a white army and a black one still get a two-tone sail
		expect(sailColoursFor('cute', 0xffffff)).toEqual({ main: expect.any(Number), stripe: TOY_RED });
		const blackRetro = sailColoursFor('retro', 0x111111);
		expect(blackRetro.main).not.toBe(blackRetro.stripe);
		expect(lum(blackRetro.main)).toBeGreaterThan(120);   // never a black sail on a black sky
		expect(sailColoursFor('retro', 'garbage').main).toEqual(expect.any(Number));
	});
});

describe.each([
	['cute', buildCuteLongship],
	['retro', buildRetroLongship],
])('the %s longship', (style, build) => {
	const g = build(THREE, { sailColour: 0x3b82f6, stripeColour: 0xf0f0f0 });

	test('has the parts and userData the renderer animates', () => {
		expect(g.userData.shipStyle).toBe(style);
		expect(g.userData.yardY).toBe(3.8);
		expect(g.userData.yardZ).toBe(0.13);
		const sail = g.getObjectByName('sail');
		const oars = g.getObjectByName('oars');
		expect(g.getObjectByName('hull')).toBeTruthy();
		expect(sail).toBe(g.userData.sail);
		expect(oars).toBe(g.userData.oars);
		expect(oars.isInstancedMesh).toBe(true);
		expect(oars.count).toBe(g.userData.oarData.length);
		expect(g.userData.oarData.length).toBeGreaterThanOrEqual(4);
		for (const o of g.userData.oarData) {
			expect(o.pivot).toHaveLength(3);
			expect([1, -1]).toContain(o.side);
			expect(Number.isFinite(o.yaw) && Number.isFinite(o.dip)).toBe(true);
			// the ports are on the side the oar runs out of
			expect(Math.sign(o.pivot[0])).toBe(o.side);
		}
	});

	test('is cheap: three draw calls, about 3k triangles, no textures', () => {
		const meshes = [];
		g.traverse((o) => { if (o.isMesh) meshes.push(o); });
		expect(meshes).toHaveLength(3);
		expect(triangles(g)).toBeLessThanOrEqual(3300);
		for (const m of meshes) {
			expect(m.material.map || null).toBeNull();
			expect(m.material.vertexColors).toBe(true);
		}
	});

	test('fits the normal ship\'s frame: bow to +Z, about 7.8 long, the yard on top', () => {
		const box = new THREE.Box3().setFromObject(g);
		const len = box.max.z - box.min.z;
		expect(len).toBeGreaterThan(MODEL_LENGTH * 0.85);
		expect(len).toBeLessThan(MODEL_LENGTH * 1.15);
		expect(box.max.z).toBeGreaterThan(-box.min.z - 0.2);     // the dragon is at the bow
		expect(box.max.y).toBeGreaterThan(3.8);
		expect(box.max.x - box.min.x).toBeLessThan(4.4);         // the yard is the widest thing
		expect(box.min.y).toBeLessThan(0);                       // it sits in the water
	});

	test('the sail marks its dye and stripe for the seized-sail fade', () => {
		const sail = g.getObjectByName('sail');
		const paint = sail.geometry.attributes.paint;
		const col = sail.geometry.attributes.color;
		expect(paint).toBeTruthy();
		expect(paint.count).toBe(col.count);
		const values = new Set();
		for (let i = 0; i < paint.count; i++) values.add(paint.getX(i));
		expect([...values].sort()).toEqual([0, 1, 2]);   // dye, stripe, and the yard left alone
		// dye vertices carry the dye's hue (blue over red)
		for (let i = 0; i < paint.count; i++) {
			if (paint.getX(i) === 1) { expect(col.getZ(i)).toBeGreaterThan(col.getX(i)); break; }
		}
	});

	test('a deck to stand on where the passenger goes', () => {
		const fit = SHIP_FIT[style];
		const hull = g.getObjectByName('hull');
		const ray = new THREE.Raycaster(new THREE.Vector3(0, 3, fit.passengerZ), new THREE.Vector3(0, -1, 0));
		hull.material.side = THREE.DoubleSide;
		const hit = ray.intersectObject(hull, false)[0];
		expect(hit).toBeTruthy();
		expect(hit.point.y).toBeCloseTo(fit.deckY, 2);
	});
});

describe('voxel kit', () => {
	test('only faces against empty space are drawn, and runs merge', () => {
		const one = createVoxels(1);
		one.set(0, 0, 0, 0xff0000);
		const b1 = createBake(THREE);
		one.emit(b1);
		expect(b1.triangles()).toBe(12);
		// a row of four: the inner faces vanish and each long side is one quad
		const row = createVoxels(1);
		row.fill(0, 0, 0, 0, 0, 3, 0xff0000);
		const b4 = createBake(THREE);
		row.emit(b4);
		expect(b4.triangles()).toBe(12);
		const geo = b4.build();
		geo.computeBoundingBox();
		expect(geo.boundingBox.max.z - geo.boundingBox.min.z).toBeCloseTo(4);
		// two colours along the run do not merge
		const two = createVoxels(1);
		two.fill(0, 0, 0, 0, 0, 1, 0xff0000);
		two.fill(0, 0, 0, 0, 2, 3, 0x00ff00);
		const b2 = createBake(THREE);
		two.emit(b2);
		expect(b2.triangles()).toBe(4 * 2 * 2 + 2 * 2);
	});
});

describe('the renderer follows the render profile', () => {
	let R;
	let gameState;
	let boardGroup;
	const ship = (over = {}) => ({ type: 'ship', shipId: 's1', player: 'p1', battleId: 'b', homeSeatId: 'p1', readyAt: 0, ...over });
	const shipCells = () => {
		const out = {};
		for (const [k, v] of Object.entries(gameState.board.cells)) if (cellHasShip(v)) out[k] = v;
		return out;
	};
	beforeEach(async () => {
		jest.resetModules();
		R = await import('../../public/js/viking/shipRenderer.js');
		boardGroup = new THREE.Group();
		gameState = {
			localPlayerId: 'p1',
			renderProfile: 'cute',
			activeBattle: { id: 'b1', edition: 'viking' },
			players: { p1: { battleId: 'b1', color: '#4488dd' }, p2: { battleId: 'b1', color: '#dd8844' } },
			board: { cells: { '0,-1': [ship()] } },
		};
	});

	test('a cute game sails the cute boat, with its passenger on the cute deck', () => {
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		expect(e.parts.style).toBe('cute');
		expect(e.parts.main).toBe(sailColoursFor('cute', 0x4488dd).main);
		const pose = R.passengerPose(gameState, 0, -1);
		expect(pose.scale).toBe(SHIP_FIT.cute.passengerScale);
		expect(pose.y).toBeCloseTo(SEA_SURFACE_Y + shipFit('cute').deckHeight, 1);
		// no sea plane on this profile: the hull sits in a little pool
		expect(e.water).toMatchObject({ shadowMap: 'pond' });
	});

	test('switching profile rebuilds each ship in the new style, one a frame', () => {
		gameState.board.cells['4,4'] = [ship({ shipId: 's2', player: 'p2' })];
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const st = R._shipRendererState();
		expect([...st.ships.values()].map(e => e.parts.style)).toEqual(['cute', 'cute']);
		gameState.renderProfile = 'retro';
		const scene = new THREE.Scene();
		R.animateShips(scene, gameState, 16);
		expect([...st.ships.values()].map(e => e.parts.style).sort()).toEqual(['cute', 'retro']);
		R.animateShips(scene, gameState, 16);
		const models = [...st.ships.values()];
		expect(models.map(e => e.parts.style)).toEqual(['retro', 'retro']);
		for (const e of models) {
			expect(e.model.parent).toBe(e.float);
			expect(e.float.children.filter(c => c.name === 'longship-model')).toHaveLength(1);
			expect(e.water).toMatchObject({ shadowMap: 'scan' });
		}
		// and back to the normal ship
		gameState.renderProfile = 'normal';
		R.animateShips(scene, gameState, 16);
		R.animateShips(scene, gameState, 16);
		expect(models.map(e => e.parts.style)).toEqual(['normal', 'normal']);
		expect(R.passengerPose(gameState, 0, -1).scale).toBe(PASSENGER_SCALE);
	});

	test('a seized retro ship fades only its cloth, keeping the baked light', () => {
		gameState.renderProfile = 'retro';
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		const geo0 = e.parts.sail.geometry;
		const paint = geo0.attributes.paint;
		const before = geo0.attributes.color.array.slice();
		gameState.board.cells = { '0,-1': [ship({ player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		expect(e.recolour).toBeTruthy();
		expect(e.recolour.toHex).toBe(sailColoursFor('retro', 0xdd8844).main);
		// halfway through the fade
		const realNow = Date.now;
		const start = e.recolour.start;
		const col = e.recolour.geo.attributes.color;
		try {
			Date.now = () => start + 650;
			R.animateShips(new THREE.Scene(), gameState, 16);
		} finally {
			Date.now = realNow;
		}
		let trimSame = true, dyeMoved = false;
		for (let i = 0; i < paint.count; i++) {
			const changed = Math.abs(col.getX(i) - before[i * 3]) + Math.abs(col.getZ(i) - before[i * 3 + 2]) > 1e-4;
			if (paint.getX(i) === 0 && changed) trimSame = false;
			if (paint.getX(i) === 1 && changed) dyeMoved = true;
		}
		expect(trimSame).toBe(true);
		expect(dyeMoved).toBe(true);
		// the shared template's sail is never touched
		expect(Array.from(geo0.attributes.color.array)).toEqual(Array.from(before));
	});
});

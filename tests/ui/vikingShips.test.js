/**
 * @jest-environment jsdom
 *
 * Longships on the board (Viking edition): the pure layout rules
 * (public/js/viking/shipLayout.js), the renderer's bookkeeping
 * (public/js/viking/shipRenderer.js, with a stand-in hull model), the
 * board renderer skipping ship cells, and the fjord theme's switch and
 * palette (public/js/viking/theme.js).
 */

import * as THREE from 'three';
import {
	cellHasShip, shipItemOf, collectShips, chooseHeading, headingAngle, chooseDetail, woolColours,
	diffFleet, isRowing, glideDuration, sailDirection, SHIP_SCALE, SHIP_LENGTH_CELLS, MODEL_LENGTH,
	DECK_MODEL_Y, DECK_HEIGHT, PASSENGER_SCALE, WOOL_CREAM,
} from '../../public/js/viking/shipLayout.js';
import { SEA_SURFACE_Y } from '../../public/js/seaLevel.js';

// A light stand-in for the procedural hull (the real one paints canvas
// textures, which jsdom cannot): named parts like the real model.
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
		g.userData = {
			sail, oars,
			oarData: [{ pivot: [0.7, 0.3, 0], side: 1, yaw: 0.2, dip: 0.1 }, { pivot: [-0.7, 0.3, 0], side: -1, yaw: 0.2, dip: 0.1 }],
		};
		return g;
	}),
}));

// jsdom has no 2D canvas; the foam/wake textures only need the calls to exist.
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

const ship = (over = {}) => ({ type: 'ship', shipId: 's1', player: 'p1', battleId: 'b', homeSeatId: 'p1', readyAt: 0, ...over });

describe('which cells hold a ship', () => {
	test('a cell with a ship item is a ship cell, whatever else is on it', () => {
		expect(cellHasShip([ship()])).toBe(true);
		expect(cellHasShip([ship(), { type: 'chess', pieceId: 'q' }])).toBe(true);
		expect(shipItemOf([{ type: 'chess' }, ship({ shipId: 'x' })]).shipId).toBe('x');
	});
	test('land, home and empty cells are not', () => {
		expect(cellHasShip([{ type: 'home', player: 'p1' }])).toBe(false);
		expect(cellHasShip([{ type: 'tetromino', player: 'p1' }, { type: 'chess' }])).toBe(false);
		expect(cellHasShip([])).toBe(false);
		expect(cellHasShip(null)).toBe(false);
		expect(cellHasShip({ type: 'home' })).toBe(false);
	});
	test('collectShips keys the fleet by shipId with its square', () => {
		const fleet = collectShips({ '3,-2': [ship({ shipId: 'a' })], '0,0': [{ type: 'home' }], '5,5': [ship({ shipId: 'b', player: 'p2' })] });
		expect([...fleet.keys()].sort()).toEqual(['a', 'b']);
		expect(fleet.get('a')).toMatchObject({ x: 3, z: -2, player: 'p1' });
	});
});

describe('which way the prow points', () => {
	// land: a set of "x,z" keys; everything else is water
	const sea = (land) => (x, z) => !land.has(`${x},${z}`);

	test('moored behind the back rank, it lies alongside the shore', () => {
		// back rank along z=1 (x=-3..3); the ship at (0,0)
		const land = new Set([-3, -2, -1, 0, 1, 2, 3].map(x => `${x},1`));
		const d = chooseHeading({ x: 0, z: 0, isWater: sea(land), centre: { x: 0, z: 6 } });
		expect(d.dz).toBe(0);
		expect(Math.abs(d.dx)).toBe(1);
	});

	test('the prow never points into land when there is water ahead somewhere', () => {
		// land on three sides; only -z is open
		const land = new Set(['1,0', '-1,0', '0,1']);
		expect(chooseHeading({ x: 0, z: 0, isWater: sea(land) })).toEqual({ dx: 0, dz: -1 });
	});

	test('after a sail it keeps pointing the way it went', () => {
		const land = new Set(['0,1']);
		expect(chooseHeading({ x: 0, z: 0, isWater: sea(land), lastDir: { dx: -1, dz: 0 } })).toEqual({ dx: -1, dz: 0 });
	});

	test('…unless that way is now land (it swings to open water)', () => {
		const land = new Set(['-1,0', '0,1']);
		const d = chooseHeading({ x: 0, z: 0, isWater: sea(land), lastDir: { dx: -1, dz: 0 } });
		expect(sea(land)(d.dx, d.dz)).toBe(true);
	});

	test('open sea all round: away from the arena centre', () => {
		const d = chooseHeading({ x: 10, z: 0, isWater: () => true, centre: { x: 0, z: 0 } });
		expect(d).toEqual({ dx: 1, dz: 0 });
	});

	test('more open water wins over a short channel', () => {
		// land at x=-2 (a short channel west), long water east; land north
		const land = new Set(['-2,0', '0,1', '1,1', '-1,1']);
		const d = chooseHeading({ x: 0, z: 0, isWater: sea(land) });
		expect(d).toEqual({ dx: 1, dz: 0 });
	});

	test('boxed in: it still returns a direction', () => {
		const d = chooseHeading({ x: 0, z: 0, isWater: () => false });
		expect(Math.abs(d.dx) + Math.abs(d.dz)).toBe(1);
	});

	test('heading angle turns the model bow (+Z) to the direction', () => {
		expect(headingAngle({ dx: 0, dz: 1 })).toBeCloseTo(0);
		expect(headingAngle({ dx: 1, dz: 0 })).toBeCloseTo(Math.PI / 2);
		expect(Math.abs(headingAngle({ dx: 0, dz: -1 }))).toBeCloseTo(Math.PI);
	});

	test('sail direction is the unit orthogonal step', () => {
		expect(sailDirection({ x: 0, z: 0 }, { x: 0, z: -4 })).toEqual({ dx: 0, dz: -1 });
		expect(sailDirection({ x: 2, z: 0 }, { x: 5, z: 0 })).toEqual({ dx: 1, dz: 0 });
		expect(sailDirection({ x: 1, z: 1 }, { x: 1, z: 1 })).toBeNull();
	});
});

describe('size, detail and timing', () => {
	test('a ship is about two squares long, so it reads as a ship', () => {
		expect(SHIP_SCALE * MODEL_LENGTH).toBeCloseTo(SHIP_LENGTH_CELLS);
		expect(SHIP_LENGTH_CELLS).toBeGreaterThanOrEqual(1.3);
		// (it overhangs the squares fore and aft: big enough to be the star
		// at the play camera, short of reaching two squares either way)
		expect(SHIP_LENGTH_CELLS).toBeLessThanOrEqual(3.6);
	});
	test('your own ship in full detail; others, phones and far ships light', () => {
		expect(chooseDetail({ isLocal: true })).toBe('high');
		expect(chooseDetail({ isLocal: false })).toBe('low');
		expect(chooseDetail({ isLocal: true, lowPower: true })).toBe('low');
		expect(chooseDetail({ isLocal: true, distance: 60 })).toBe('low');
	});
	test('glides take one to one and a half seconds or so', () => {
		expect(glideDuration(1)).toBeGreaterThanOrEqual(900);
		expect(glideDuration(5)).toBeLessThanOrEqual(1600);
		expect(glideDuration(5)).toBeGreaterThan(glideDuration(1));
	});
	test('a ship rows until its readyAt', () => {
		expect(isRowing({ readyAt: 2000 }, 1000)).toBe(true);
		expect(isRowing({ readyAt: 2000 }, 2000)).toBe(false);
		expect(isRowing({ readyAt: 0 }, 5)).toBe(false);
	});
});

describe('dyed-wool sails', () => {
	const sat = (hex) => {
		const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
		return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
	};
	test('the white army sails bleached linen with bold red stripes', () => {
		const w = woolColours('#e6e6e6');
		expect(w.main).not.toBe(w.stripe);
		expect((w.main >> 16) & 255).toBeGreaterThan(200);
		// a strong second tone, so the sail reads at the play camera
		expect(sat(w.stripe)).toBeGreaterThan(0.4);
		expect((w.stripe >> 16) & 255).toBeGreaterThan(w.stripe & 255);
	});
	test('the black army sails dark wool with cream stripes', () => {
		const k = woolColours('#454545');
		expect((k.main >> 16) & 255).toBeLessThan(110);
		expect(k.stripe).toBe(WOOL_CREAM);
	});
	test('colours keep their hue but lose the neon', () => {
		const blue = woolColours(0x4488dd);
		expect(blue.main & 255).toBeGreaterThan((blue.main >> 16) & 255); // still blue
		expect(sat(blue.main)).toBeLessThan(sat(0x4488dd));
		const orange = woolColours('#dd8844');
		expect((orange.main >> 16) & 255).toBeGreaterThan(orange.main & 255); // still warm
	});
	test('nonsense falls back to madder red', () => {
		expect(woolColours('not a colour').main).toBeGreaterThan(0);
	});
});

describe('fleet changes between boards', () => {
	test('added, removed, moved and changed hands', () => {
		const a = collectShips({ '0,0': [ship({ shipId: 'a' })], '5,5': [ship({ shipId: 'b' })] });
		const b = collectShips({ '0,-3': [ship({ shipId: 'a', player: 'p2' })], '9,9': [ship({ shipId: 'c' })] });
		const d = diffFleet(a, b);
		expect(d.added).toEqual(['c']);
		expect(d.removed).toEqual(['b']);
		expect(d.moved).toEqual([{ shipId: 'a', from: { x: 0, z: 0 }, to: { x: 0, z: -3 } }]);
		expect(d.recoloured).toEqual([{ shipId: 'a', from: 'p1', to: 'p2' }]);
	});
	test('a seize is seen even when the board edits the item in place', () => {
		const item = ship({ shipId: 'a' });
		const cells = { '0,0': [item] };
		const before = collectShips(cells);
		item.player = 'p2';
		expect(diffFleet(before, collectShips(cells)).recoloured).toHaveLength(1);
	});
});

/* ---------------------------------------------------------------- renderer */

describe('ship renderer', () => {
	let R;
	let gameState;
	let boardGroup;
	beforeEach(async () => {
		jest.resetModules();
		R = await import('../../public/js/viking/shipRenderer.js');
		boardGroup = new THREE.Group();
		gameState = {
			localPlayerId: 'p1',
			activeBattle: { id: 'b1', edition: 'viking' },
			players: { p1: { battleId: 'b1', color: '#4488dd' }, p2: { battleId: 'b1', color: '#dd8844' } },
			board: { cells: {} },
		};
	});
	const shipCells = () => {
		const out = {};
		for (const [k, v] of Object.entries(gameState.board.cells)) if (cellHasShip(v)) out[k] = v;
		return out;
	};

	test('no ships: nothing is drawn and nothing is kept', () => {
		gameState.board.cells = { '0,0': [{ type: 'home', player: 'p1' }] };
		R.syncShips(gameState, boardGroup, THREE, {});
		expect(boardGroup.children).toHaveLength(0);
		expect(R.hasShipsDrawn()).toBe(false);
		expect(R.passengerPose(gameState, 0, 0)).toBeNull();
	});

	test('each ship cell gets one clickable longship on the sea', () => {
		gameState.board.cells = { '0,0': [{ type: 'home', player: 'p1' }], '0,-1': [ship()], '4,4': [ship({ shipId: 's2', player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		// one new hull is built per board pass (no start-of-battle hitch)
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(1);
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const roots = boardGroup.children.filter(c => c.userData.ship);
		expect(roots).toHaveLength(2);
		const mine = roots.find(r => r.userData.shipId === 's1');
		// click raycasts treat it as the square it stands on
		expect(mine.userData).toMatchObject({ type: 'cell', ship: true, position: { x: 0, z: -1 }, player: 'p1' });
		expect(mine.position.x).toBe(0);
		expect(mine.position.z).toBe(-1);
		// a hitbox that can be raycast but is never drawn
		const hit = mine.getObjectByName('ship-hitbox');
		expect(hit.visible).toBe(false);
		const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, -1), new THREE.Vector3(0, -1, 0));
		mine.updateMatrixWorld(true);
		expect(ray.intersectObject(hit, false).length).toBeGreaterThan(0);
		// the model is scaled to the board
		expect(mine.getObjectByName('longship-model').scale.x).toBeCloseTo(SHIP_SCALE);
	});

	test('the passenger stands on the deck, smaller, facing the prow', () => {
		gameState.board.cells = { '0,-1': [ship(), { type: 'chess', pieceId: 'q' }] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const pose = R.passengerPose(gameState, 0, -1);
		expect(pose.scale).toBe(PASSENGER_SCALE);
		expect(pose.y).toBeLessThan(0);
		expect(pose.y).toBeCloseTo(SEA_SURFACE_Y + DECK_HEIGHT, 1);
		expect(Number.isFinite(pose.heading)).toBe(true);
		// land squares are untouched
		expect(R.passengerPose(gameState, 3, 3)).toBeNull();
	});

	test('a moved ship glides from its old square', () => {
		gameState.board.cells = { '0,-1': [ship()] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		gameState.board.cells = { '0,-5': [ship()] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const st = R._shipRendererState();
		const e = st.ships.get('s1');
		expect(e.glide).toBeTruthy();
		expect(e.glide.fromW).toEqual({ x: 0, z: -1 });
		expect(e.glide.toW).toEqual({ x: 0, z: -5 });
		expect(e.root.userData.position).toEqual({ x: 0, z: -5 });
		// heading follows the sail (-z)
		expect(Math.abs(e.targetHeading)).toBeCloseTo(Math.PI);
		// it is still drawn at the old square until the animation runs
		expect(e.root.position.z).toBe(-1);
		R.animateShips(new THREE.Scene(), gameState, 16);
		expect(e.root.position.z).toBeLessThanOrEqual(-1);
	});

	test('a ship that leaves the board sinks before it is removed', () => {
		gameState.board.cells = { '0,-1': [ship()], '4,4': [ship({ shipId: 's2', player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		delete gameState.board.cells['0,-1'];
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		expect(e.sink).toBeTruthy();
		expect(e.root.userData.type).toBe('sinkingShip'); // no longer a clickable square
		expect(boardGroup.children).toContain(e.root);
	});

	test('the whole fleet vanishing at once (arena cleared) is removed outright', () => {
		gameState.board.cells = { '0,-1': [ship()], '4,4': [ship({ shipId: 's2', player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(2);
		gameState.board.cells = {};
		R.syncShips(gameState, boardGroup, THREE, {});
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(0);
		expect(R.hasShipsDrawn()).toBe(false);
	});

	test('a seized ship fades its sail to the new owner', () => {
		gameState.board.cells = { '0,-1': [ship()] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		gameState.board.cells = { '0,-1': [ship({ player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		expect(e.recolour).toBeTruthy();
		expect(e.recolour.toHex).toBe(woolColours('#dd8844').main);
		expect(e.root.userData.player).toBe('p2');
		// the frame loop runs the fade, then swaps in the new owner's hull
		const before = e.model;
		const realNow = Date.now;
		try {
			Date.now = () => realNow() + 5000;
			R.animateShips(new THREE.Scene(), gameState, 16);
		} finally {
			Date.now = realNow;
		}
		expect(e.recolour).toBeNull();
		expect(e.model).not.toBe(before);
		expect(e.parts.main).toBe(woolColours('#dd8844').main);
	});

	test('ships of a colour already built arrive together', () => {
		gameState.board.cells = { '0,-1': [ship()], '4,4': [ship({ shipId: 's2' })], '8,8': [ship({ shipId: 's3' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(3);
	});

	test('a new battle starts from a clean slate', () => {
		gameState.board.cells = { '0,-1': [ship()] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		gameState.activeBattle = { id: 'b2', edition: 'viking' };
		gameState.board.cells = { '7,7': [ship({ shipId: 'z9' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		expect([...R._shipRendererState().ships.keys()]).toEqual(['z9']);
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(1);
	});

	test('the hull sits on the sea it is drawn over', () => {
		const scene = new THREE.Scene();
		const geo = new THREE.PlaneGeometry(1200, 1200, 64, 64);
		geo.rotateX(-Math.PI / 2);
		const p = geo.attributes.position;
		for (let i = 0; i < p.count; i++) p.setY(i, 0.25);
		const water = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
		water.name = 'tetches-water';
		water.position.set(10, SEA_SURFACE_Y, -20);
		scene.add(water);
		expect(R.seaHeightAt(scene, 13.4, -17.2)).toBeCloseTo(SEA_SURFACE_Y + 0.25);
		expect(R.seaHeightAt(new THREE.Scene(), 0, 0)).toBe(SEA_SURFACE_Y);
	});
});

/* ----------------------------------------------------------- board skip */

describe('the board renderer', () => {
	test('draws no land block or cloud for a ship cell, and hands it to the ship renderer', async () => {
		jest.resetModules();
		const { renderBoard } = await import('../../public/js/boardFunctions/rendering.js');
		const R = await import('../../public/js/viking/shipRenderer.js');
		const boardGroup = new THREE.Group();
		const gameState = {
			localPlayerId: 'p1',
			activeBattle: null,
			players: {},
			chessPieces: [],
			board: { cells: { '0,0': [{ type: 'home', player: 'p1' }], '0,-1': [ship()] } },
		};
		renderBoard(gameState, boardGroup, null, THREE);
		const inst = boardGroup.children.find(c => c.userData.type === 'instancedCells');
		expect(inst.userData.cellAt.slice(0, inst.count)).toEqual([{ x: 0, z: 0 }]);
		const puffs = gameState.__cloudPuffs;
		expect(puffs).toBeTruthy();
		const shipRoots = boardGroup.children.filter(c => c.userData.ship);
		expect(shipRoots).toHaveLength(1);
		expect(R.hasShipsDrawn()).toBe(true);
		// a second pass keeps the ship (the cell sweep leaves it alone)
		renderBoard(gameState, boardGroup, null, THREE);
		expect(boardGroup.children.filter(c => c.userData.ship)).toHaveLength(1);
	});

	test('a standard board never touches the ship renderer', async () => {
		jest.resetModules();
		const { renderBoard } = await import('../../public/js/boardFunctions/rendering.js');
		const R = await import('../../public/js/viking/shipRenderer.js');
		const boardGroup = new THREE.Group();
		const gameState = { localPlayerId: 'p1', players: {}, chessPieces: [], board: { cells: { '0,0': [{ type: 'home', player: 'p1' }] } } };
		renderBoard(gameState, boardGroup, null, THREE);
		expect(R.hasShipsDrawn()).toBe(false);
		expect(R._shipRendererState().listening).toBe(false);
		expect(boardGroup.children.some(c => c.userData.ship)).toBe(false);
	});
});

/* ---------------------------------------------------------------- theme */

describe('the fjord theme', () => {
	let T;
	beforeAll(async () => { T = await import('../../public/js/viking/theme.js'); });

	test('on only for a Viking game in the normal render profile', () => {
		const yes = () => true, no = () => false;
		expect(T.themeWanted({ renderProfile: 'normal' }, yes)).toBe(true);
		expect(T.themeWanted({}, yes)).toBe(true);
		expect(T.themeWanted({ renderProfile: 'normal' }, no)).toBe(false);
		expect(T.themeWanted({ renderProfile: 'cute' }, yes)).toBe(false);
		expect(T.themeWanted({ lowQuality: true }, yes)).toBe(false);
		expect(T.themeWanted({ retroMode: true }, yes)).toBe(false);
		expect(T.themeWanted(null, yes)).toBe(false);
	});

	test('follows the edition: a standard page outside a Viking battle stays standard', () => {
		delete document.documentElement.dataset.edition;
		expect(T.themeWanted({ renderProfile: 'normal' })).toBe(false);
		expect(T.themeWanted({ renderProfile: 'normal', activeBattle: { edition: 'viking' } })).toBe(true);
		document.documentElement.dataset.edition = 'viking';
		expect(T.themeWanted({ renderProfile: 'normal' })).toBe(true);
		delete document.documentElement.dataset.edition;
	});

	test('dawn sky: dark overhead, misty at the horizon, warm toward the sun', () => {
		const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
		expect(lum(T.skyColour(1.4, 0))).toBeLessThan(lum(T.skyColour(0.02, 0)));
		const toward = T.skyColour(0.05, 1);
		const away = T.skyColour(0.05, -1);
		expect(toward[0] - toward[2]).toBeGreaterThan(away[0] - away[2]);
	});

	test('ridgelines are seeded, closed and normalised', () => {
		const a = T.ridgeline(5, 64);
		expect(a).toEqual(T.ridgeline(5, 64));
		expect(Math.min(...a)).toBeCloseTo(0);
		expect(Math.max(...a)).toBeCloseTo(1);
		expect(T.ridgeline(6, 64)).not.toEqual(a);
	});

	test('the sun stands ahead of each seat\'s home view', () => {
		// the home camera looks along the king's forward: +Z, +X, -Z, -X
		const fwd = [[0, 1], [1, 0], [0, -1], [-1, 0]];
		for (let o = 0; o < 4; o++) {
			const a = T.sunAzimuthFor(o);
			const dot = Math.cos(a) * fwd[o][0] + Math.sin(a) * fwd[o][1];
			expect(dot).toBeGreaterThan(Math.cos(0.5));
		}
	});

	test('the local seat\'s facing comes from its king, else its home zone', () => {
		expect(T.localFacing({ localPlayerId: 'me', chessPieces: [{ player: 'me', type: 'king', orientation: 2 }] })).toBe(2);
		expect(T.localFacing({ localPlayerId: 'me', chessPieces: [], homeZones: { me: { orientation: 3 } } })).toBe(3);
		expect(T.localFacing({ localPlayerId: 'me', chessPieces: [{ player: 'you', type: 'KING', orientation: 1 }] })).toBeNull();
		expect(T.localFacing(null)).toBeNull();
	});

	test('a standard scene is left exactly as it was', () => {
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEFA);
		const sun = new THREE.DirectionalLight(0xFFF5E0, 1.1);
		sun.castShadow = true;
		scene.add(sun);
		T.updateVikingTheme(scene, { renderProfile: 'normal' }, 10000);
		expect(scene.background.getHex()).toBe(0x87CEFA);
		expect(sun.color.getHex()).toBe(0xFFF5E0);
		expect(scene.getObjectByName('vikingFjord')).toBeUndefined();
	});

	test('a Viking battle dresses the scene, and leaving it restores everything', () => {
		const scene = new THREE.Scene();
		const bg = new THREE.Color(0x87CEFA);
		scene.background = bg;
		const fog = new THREE.FogExp2(0xC5E8FF, 0.006);
		scene.fog = fog;
		const sun = new THREE.DirectionalLight(0xFFF5E0, 1.1);
		sun.castShadow = true;
		sun.position.set(30, 60, 25);
		scene.add(sun);
		const water = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x1b64b0, opacity: 0.94, transparent: true }));
		water.name = 'tetches-water';
		scene.add(water);
		const original = water.material;
		const gs = { renderProfile: 'normal', activeBattle: { id: 'b', edition: 'viking' }, camera: new THREE.PerspectiveCamera() };
		T.updateVikingTheme(scene, gs, 20000);
		expect(scene.getObjectByName('vikingFjord').visible).toBe(true);
		expect(scene.fog).not.toBe(fog);
		expect(sun.color.getHex()).toBe(T.PALETTE.sunLight);
		expect(water.material.name).toBe('viking-sea');
		gs.activeBattle = null;
		T.updateVikingTheme(scene, gs, 21000);
		expect(scene.background).toBe(bg);
		expect(scene.fog).toBe(fog);
		expect(sun.color.getHex()).toBe(0xFFF5E0);
		expect(sun.intensity).toBe(1.1);
		expect(sun.position.toArray()).toEqual([30, 60, 25]);
		expect(water.material).toBe(original);
		expect(water.material.color.getHex()).toBe(0x1b64b0);
		expect(water.material.opacity).toBe(0.94);
		expect(scene.getObjectByName('vikingFjord').visible).toBe(false);
	});
});

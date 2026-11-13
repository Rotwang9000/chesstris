/**
 * @jest-environment jsdom
 *
 * Viking visual polish, round 3:
 *   • a passenger rides its ship from the game state's own piece list,
 *     not the mesh's (lagging) square, so a bot's sail never leaves it
 *     standing on the water;
 *   • two hulls on neighbouring squares are eased apart;
 *   • the yard and sail are braced round toward the eye (never edge-on),
 *     and the braces and sheets follow;
 *   • toasts and tips keep clear of the player's own longship;
 *   • Viking pieces wear a matte bone / soapstone finish, and give it
 *     back outside a Viking game;
 *   • a queen storming a shore is painted as the raid.
 */

import * as THREE from 'three';
import {
	SHIP_SCALE, MODEL_LENGTH, HULL_FORE, HULL_AFT, HULL_HALF_BEAM, boxOverlap, landOverlap,
} from '../../public/js/viking/shipLayout.js';

jest.mock('../../public/js/viking/longship.js', () => ({
	buildLongship: jest.fn((T, opts) => {
		const g = new T.Group();
		const sailGeo = new T.PlaneGeometry(1, 1, 2, 2);
		const n = sailGeo.attributes.position.count;
		const col = new Float32Array(n * 3);
		const a = new T.Color(opts.sailColour);
		for (let i = 0; i < n; i++) col.set([a.r, a.g, a.b], i * 3);
		sailGeo.setAttribute('color', new T.BufferAttribute(col, 3));
		const sail = new T.Mesh(sailGeo, new T.MeshBasicMaterial({ vertexColors: true }));
		sail.name = 'sail';
		g.add(sail);
		const yard = new T.Mesh(new T.BoxGeometry(3, 0.1, 0.1), new T.MeshBasicMaterial());
		yard.name = 'yard';
		g.add(yard);
		const rigRopes = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial(), 1);
		rigRopes.name = 'rigRopes';
		g.add(rigRopes);
		const aim = jest.fn();
		g.userData = {
			sail, rigRopes,
			oarData: [],
			rigLines: [{ a: [1.5, 3.8, 0.1], b: [0.6, 0.4, -2.3], onSail: false, r: 0.01 }],
			aimRigLines: aim,
		};
		buildLongshipAims.push(aim);
		return g;
	}),
}));
const buildLongshipAims = [];

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

describe('longships on the board', () => {
	let R;
	let gameState;
	let boardGroup;
	let pieces;
	beforeEach(async () => {
		jest.resetModules();
		R = await import('../../public/js/viking/shipRenderer.js');
		boardGroup = new THREE.Group();
		pieces = new THREE.Group();
		window.chessPiecesGroup = pieces;
		gameState = {
			localPlayerId: 'p1',
			activeBattle: { id: 'b1', edition: 'viking' },
			players: { p1: { battleId: 'b1', color: '#4488dd' }, p2: { battleId: 'b1', color: '#dd8844' } },
			board: { cells: {} },
			chessPieces: [],
		};
	});
	afterEach(() => { delete window.chessPiecesGroup; });
	const shipCells = () => {
		const out = {};
		for (const [k, v] of Object.entries(gameState.board.cells)) if (Array.isArray(v) && v.some(i => i.type === 'ship')) out[k] = v;
		return out;
	};
	const pieceMesh = (id, x, z) => {
		const m = new THREE.Group();
		m.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshStandardMaterial()));
		m.userData = { id, type: 'chessPiece', position: { x, z } };
		pieces.add(m);
		return m;
	};

	test('a passenger sails with its ship even before the piece reconciler catches up', () => {
		gameState.board.cells = { '0,-1': [ship()] };
		gameState.chessPieces = [{ id: 'n1', type: 'KNIGHT', player: 'p1', position: { x: 0, z: -1 } }];
		const knight = pieceMesh('n1', 0, -1);
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.animateShips(new THREE.Scene(), gameState, 16);
		// the ship sails four squares; the game state moves the knight with
		// it, the mesh's own square has not been updated yet
		gameState.board.cells = { '0,-5': [ship()] };
		gameState.chessPieces = [{ id: 'n1', type: 'KNIGHT', player: 'p1', position: { x: 0, z: -5 } }];
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		for (let i = 0; i < 400 && (e.glide || i < 2); i++) {
			e.glide && (e.glide.start -= 40);
			R.animateShips(new THREE.Scene(), gameState, 40);
			// every frame, under way or not, the knight is on the deck
			expect(Math.hypot(knight.position.x - e.deck.x, knight.position.z - e.deck.z)).toBeLessThan(1e-6);
		}
		expect(e.glide).toBeNull();
		expect(knight.userData.position).toEqual({ x: 0, z: -1 });   // (the reconciler's job)
	});

	// The hull's box on the board as drawn this frame (heading and nudge).
	const drawnBox = (e) => {
		const d = { dx: Math.round(Math.sin(e.heading)), dz: Math.round(Math.cos(e.heading)) };
		const half = (HULL_FORE + HULL_AFT) / 2, mid = (HULL_FORE - HULL_AFT) / 2;
		const cx = e.x + e.nudge.x + d.dx * mid, cz = e.z + e.nudge.z + d.dz * mid;
		const hx = d.dx ? half : HULL_HALF_BEAM, hz = d.dz ? half : HULL_HALF_BEAM;
		return { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz };
	};

	test('two hulls on neighbouring squares lie apart, not inside each other', () => {
		// end to end on the same line: the hulls are longer than a square
		gameState.board.cells = { '0,0': [ship()], '1,0': [ship({ shipId: 's2', player: 'p2' })] };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const st = R._shipRendererState();
		const a = st.ships.get('s1'), b = st.ships.get('s2');
		for (let i = 0; i < 160; i++) R.animateShips(new THREE.Scene(), gameState, 50);
		expect(SHIP_SCALE * MODEL_LENGTH).toBeGreaterThan(1.5);
		expect(boxOverlap(drawnBox(a), drawnBox(b))).toBe(0);
	});

	test('a hull never lies in land: a ship in a slip lies out of it, bow to the sea', () => {
		// land on three sides of (0,0), open to -z; a quay row along x = 1
		const land = () => [{ type: 'tetromino', player: 'p2' }];
		const cells = { '0,0': [ship()] };
		for (const k of ['-1,0', '1,0', '-1,1', '0,1', '1,1', '1,-1', '1,-2', '1,-3', '1,-4']) cells[k] = land();
		gameState.board.cells = cells;
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		for (let i = 0; i < 160; i++) R.animateShips(new THREE.Scene(), gameState, 50);
		const isLand = (x, z) => !!cells[`${x},${z}`] && !cells[`${x},${z}`].some(i => i.type === 'ship');
		expect(landOverlap(drawnBox(e), isLand)).toBeLessThan(1e-6);
		expect(Math.round(Math.cos(e.heading))).toBe(-1);     // bow out of the slip, toward -z
	});

	test('the yard and sail are braced toward the eye, never edge-on, and the ropes follow', () => {
		gameState.board.cells = { '0,0': [ship()] };
		gameState.camera = new THREE.PerspectiveCamera();
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		const e = R._shipRendererState().ships.get('s1');
		e.heading = e.targetHeading = 0;            // bow toward +z
		gameState.camera.position.set(10, 3, 0.5);  // the eye abeam, to starboard
		for (let i = 0; i < 80; i++) R.animateShips(new THREE.Scene(), gameState, 50);
		const sail = e.parts.sail;
		expect(Math.abs(sail.rotation.y)).toBeGreaterThan(0.45);
		expect(Math.abs(sail.rotation.y)).toBeLessThanOrEqual(0.7);
		expect(e.parts.yard.rotation.y).toBeCloseTo(sail.rotation.y);
		const aim = buildLongshipAims[buildLongshipAims.length - 1];
		expect(aim).toHaveBeenCalled();
		expect(aim.mock.calls[aim.mock.calls.length - 1][3]).toBeCloseTo(sail.rotation.y, 2);
		// seen from dead astern the sail squares up again
		gameState.camera.position.set(0, 3, -10);
		for (let i = 0; i < 120; i++) R.animateShips(new THREE.Scene(), gameState, 50);
		expect(Math.abs(sail.rotation.y)).toBeLessThan(0.05);
	});

	test('toasts keep clear of the own ship: a box is offered only while ships are drawn', async () => {
		const toast = await import('../../public/js/showToastMessage.js');
		expect(toast.avoidRect()).toBeNull();
		gameState.board.cells = { '0,0': [ship()] };
		gameState.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
		gameState.camera.position.set(0, 8, -8);
		gameState.camera.lookAt(0, -1.5, 0);
		gameState.camera.updateMatrixWorld(true);
		const canvas = document.createElement('canvas');
		canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 800, right: 800, bottom: 800 });
		gameState.renderer = { domElement: canvas };
		R.syncShips(gameState, boardGroup, THREE, shipCells());
		R.animateShips(new THREE.Scene(), gameState, 16);
		const r = toast.avoidRect();
		expect(r).not.toBeNull();
		expect(r.right).toBeGreaterThan(r.left);
		expect(r.bottom).toBeGreaterThan(r.top);
		// the battle ends: no ships, nothing to avoid
		R.syncShips(gameState, boardGroup, THREE, {});
		gameState.activeBattle = { id: 'b2' };
		R.syncShips(gameState, boardGroup, THREE, {});
		expect(toast.avoidRect()).toBeNull();
	});
});

describe('Viking piece finish', () => {
	test('matte bone and soapstone in a Viking game; the piece’s own finish comes back after', async () => {
		const { vikingPieceFinish } = await import('../../public/js/viking/pieceFinish.js');
		const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.3, metalness: 0.08 });
		const gilt = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.25, metalness: 0.6 });
		const piece = new THREE.Group();
		const body = new THREE.Mesh(new THREE.BoxGeometry(), white);
		const trim = new THREE.Mesh(new THREE.BoxGeometry(), gilt);
		piece.add(body, trim);
		vikingPieceFinish(piece, true);
		expect(body.material).not.toBe(white);
		expect(body.material.roughness).toBeGreaterThanOrEqual(0.7);
		expect(body.material.metalness).toBe(0);
		// warmed to bone: blue drops most
		expect(body.material.color.b).toBeLessThan(body.material.color.r);
		expect(trim.material.metalness).toBeLessThanOrEqual(0.45);
		expect(trim.material.roughness).toBeGreaterThanOrEqual(0.5);
		// a second call is free
		const dressed = body.material;
		vikingPieceFinish(piece, true);
		expect(body.material).toBe(dressed);
		vikingPieceFinish(piece, false);
		expect(body.material).toBe(white);
		expect(trim.material).toBe(gilt);
		expect(white.roughness).toBe(0.3);
	});
});

describe('paintings', () => {
	test('a queen storming a shore is the raid; landing in peace is her arrival', async () => {
		const { slotCandidates } = await import('../../public/js/paintings/paintingCatalogue.js');
		expect(slotCandidates({ kind: 'arrival', pieceType: 'queen', viaShip: true, raid: true })[0]).toBe('ship.raid');
		expect(slotCandidates({ kind: 'arrival', pieceType: 'queen', viaShip: true, raid: false })).toEqual(['arrival.queen']);
		expect(slotCandidates({ kind: 'arrival', pieceType: 'queen' })).toEqual(['arrival.queen']);
	});
});

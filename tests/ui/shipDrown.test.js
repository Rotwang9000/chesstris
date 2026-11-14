/**
 * @jest-environment jsdom
 *
 * Viking longships, lost with all hands: when the sea takes a laden
 * ship, its passenger goes down with the hull (a stand-in copy riding
 * the sinking deck) instead of vanishing the moment the board drops it.
 * An empty ship sinks empty; a piece that stepped off is left alone.
 */

import * as THREE from 'three';

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
		const oars = new T.InstancedMesh(new T.BoxGeometry(1, 0.02, 0.02), new T.MeshBasicMaterial(), 2);
		oars.name = 'oars';
		g.add(oars);
		g.userData = { sail, oars, oarData: [{ pivot: [0.7, 0.3, 0], side: 1, yaw: 0.2, dip: 0.1 }, { pivot: [-0.7, 0.3, 0], side: -1, yaw: 0.2, dip: 0.1 }] };
		return g;
	}),
}));

beforeAll(() => {
	const ctx = new Proxy({}, {
		get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => ({ addColorStop() {} }) : () => {},
		set: () => true,
	});
	HTMLCanvasElement.prototype.getContext = function () { return ctx; };
	window.THREE = THREE;
});

const shipItem = (over = {}) => ({ type: 'ship', shipId: 's1', player: 'p1', battleId: 'b', homeSeatId: 'p1', readyAt: 0, ...over });

describe('lost with all hands', () => {
	let R; let ctx; let gameState; let boardGroup; let pieces;
	beforeEach(async () => {
		jest.resetModules();
		ctx = await import('../../public/js/gameContext.js');
		R = await import('../../public/js/viking/shipRenderer.js');
		boardGroup = new THREE.Group();
		pieces = new THREE.Group();
		ctx.setChessPiecesGroup(pieces);
		gameState = {
			localPlayerId: 'p1',
			activeBattle: { id: 'b1', edition: 'viking' },
			players: { p1: { battleId: 'b1', color: '#4488dd' } },
			board: { cells: {} },
		};
	});

	const cellsWithShip = () => {
		const out = {};
		for (const [k, v] of Object.entries(gameState.board.cells)) if (v.some(i => i.type === 'ship')) out[k] = v;
		return out;
	};
	function setUp() {
		gameState.board.cells = { '0,-1': [shipItem(), { type: 'chess', pieceId: 'q' }] };
		R.syncShips(gameState, boardGroup, THREE, cellsWithShip());
		const mesh = new THREE.Group();
		mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), new THREE.MeshBasicMaterial()));
		mesh.userData = { type: 'chessPiece', id: 'q', player: 'p1', position: { x: 0, z: -1 } };
		pieces.add(mesh);
		R.animateShips(new THREE.Scene(), gameState, 16);   // the ship picks up its rider
		return { mesh, e: R._shipRendererState().ships.get('s1') };
	}
	const drowned = (e) => e.float.children.filter(c => c.userData?.type === 'drownedPassenger');

	test("a 'sunk' with a passenger takes a copy of it down on the deck", () => {
		const { mesh, e } = setUp();
		window.dispatchEvent(new CustomEvent('tetches:ship', { detail: { kind: 'sunk', shipId: 's1', passengerId: 'q' } }));
		expect(e.sink).toBeTruthy();
		expect(drowned(e)).toHaveLength(1);
		expect(mesh.visible).toBe(false);          // the live piece is hidden, not doubled
		// the copy is not a clickable chess piece
		expect(drowned(e)[0].userData).toEqual({ type: 'drownedPassenger' });
	});

	test('an empty ship sinks empty', () => {
		const { mesh, e } = setUp();
		window.dispatchEvent(new CustomEvent('tetches:ship', { detail: { kind: 'sunk', shipId: 's1', passengerId: null } }));
		expect(drowned(e)).toHaveLength(0);
		expect(mesh.visible).toBe(true);
	});

	test('the board dropping ship and rider together sinks both; a rider still on the board is not copied', () => {
		const { mesh, e } = setUp();
		pieces.remove(mesh);                      // the board removed the drowned piece
		gameState.board.cells = {};
		R.syncShips(gameState, boardGroup, THREE, {});
		expect(e.sink).toBeTruthy();
		expect(drowned(e)).toHaveLength(1);

		const again = setUp();
		again.mesh.userData.position = { x: 3, z: 3 };   // stepped ashore first
		gameState.board.cells = {};
		R.syncShips(gameState, boardGroup, THREE, {});
		expect(drowned(again.e)).toHaveLength(0);
	});
});

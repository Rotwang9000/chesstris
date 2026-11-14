/**
 * @jest-environment jsdom
 */
/**
 * Viking land (public/js/viking/landDress.js): granite, timber and turf
 * blocks on rocks in the surf instead of pastel blocks on cloud puffs —
 * only in a Viking game, and the standard board is put back exactly.
 */
import * as THREE from 'three';
import {
	vikingAppearance, vikingLandWanted, cellNoise, LAND,
} from '../../public/js/viking/landDress.js';

jest.mock('../../public/js/viking/longship.js', () => ({ buildLongship: jest.fn(() => null) }));

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

const sat = (hex) => {
	const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
	return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
};

describe('Viking land colours', () => {
	test('the arena wall is grey granite, block to block a little different', () => {
		const shades = new Set();
		for (let x = 0; x < 6; x++) {
			const a = vikingAppearance({ kind: 'ring', color: 0x8a8a99, opacity: 1, transparent: false }, x, 3);
			expect(sat(a.color)).toBeLessThan(0.12);
			shades.add(a.color);
		}
		expect(shades.size).toBeGreaterThan(2);
	});

	test('player land keeps a stain of the player colour, matte, not plastic', () => {
		const blue = vikingAppearance({ kind: 'home', color: 0x4f7fe0, opacity: 1, transparent: false, decaying: false }, 2, 2);
		expect(blue.color & 255).toBeGreaterThan((blue.color >> 16) & 255);   // still blue
		expect(sat(blue.color)).toBeLessThan(sat(0x4f7fe0));                  // but weathered
		expect(blue.metalness).toBe(0);
		expect(blue.roughness).toBeGreaterThan(0.8);
	});

	test('decay, transparency and kind pass through untouched', () => {
		const a = vikingAppearance({ kind: 'tetromino', color: 0xdd8844, opacity: 0.5, transparent: true, decaying: true }, 1, 1);
		expect(a).toMatchObject({ kind: 'tetromino', opacity: 0.5, transparent: true, decaying: true });
	});

	test('a block keeps its shade between renders', () => {
		expect(cellNoise(4, -7)).toBe(cellNoise(4, -7));
		expect(cellNoise(4, -7)).not.toBe(cellNoise(-7, 4));
		expect(LAND.granite).toBeGreaterThan(0);
	});

	test('wanted only in a Viking game in the normal render profile', () => {
		const yes = () => true, no = () => false;
		expect(vikingLandWanted({ renderProfile: 'normal' }, yes)).toBe(true);
		expect(vikingLandWanted({ renderProfile: 'normal' }, no)).toBe(false);
		expect(vikingLandWanted({ renderProfile: 'cute' }, yes)).toBe(false);
		expect(vikingLandWanted({ retroMode: true }, yes)).toBe(false);
		expect(vikingLandWanted(null, yes)).toBe(false);
		// the default edition test: a standard page outside a Viking battle
		delete document.documentElement.dataset.edition;
		expect(vikingLandWanted({ renderProfile: 'normal' })).toBe(false);
		expect(vikingLandWanted({ renderProfile: 'normal', activeBattle: { edition: 'viking' } })).toBe(true);
	});
});

describe('the board under a Viking battle', () => {
	const cells = () => ({
		'0,0': [{ type: 'home', player: 'p1' }],
		'1,0': [{ type: 'home', player: 'p1' }],
		'5,5': [{ battleRing: true, color: '#8a8a99' }],
	});

	test('rocks and surf instead of cloud puffs; the standard board comes back after', async () => {
		jest.resetModules();
		const { renderBoard } = await import('../../public/js/boardFunctions/rendering.js');
		delete document.documentElement.dataset.edition;
		const boardGroup = new THREE.Group();
		const gameState = {
			localPlayerId: 'p1', players: {}, chessPieces: [], renderProfile: 'normal',
			activeBattle: { id: 'b1', edition: 'viking' },
			board: { cells: cells() },
		};
		renderBoard(gameState, boardGroup, null, THREE);
		expect(gameState.__cloudPuffs).toBeFalsy();
		const rocks = boardGroup.getObjectByName('vikingRocks');
		const foam = boardGroup.getObjectByName('vikingShoreFoam');
		expect(rocks.count).toBe(3);
		expect(foam.count).toBe(3);
		// board-wide meshes: never distance-culled, never clicked
		expect(rocks.userData.boardWide).toBe(true);
		const inst = boardGroup.children.find(c => c.userData.type === 'instancedCells');
		expect(inst.material.name).toBe('viking-cells');

		// the same board in a standard battle: clouds, the standard finish
		gameState.activeBattle = { id: 'b2', edition: 'standard' };
		renderBoard(gameState, boardGroup, null, THREE);
		expect(gameState.__cloudPuffs).toBeTruthy();
		expect(boardGroup.getObjectByName('vikingRocks')).toBeUndefined();
		expect(boardGroup.getObjectByName('vikingShoreFoam')).toBeUndefined();
		const inst2 = boardGroup.children.find(c => c.userData.type === 'instancedCells');
		expect(inst2.material.name).not.toBe('viking-cells');
	});

	test('a standard board never builds rocks or changes the cells’ finish', async () => {
		jest.resetModules();
		const { renderBoard } = await import('../../public/js/boardFunctions/rendering.js');
		delete document.documentElement.dataset.edition;
		const boardGroup = new THREE.Group();
		const gameState = { localPlayerId: 'p1', players: {}, chessPieces: [], board: { cells: cells() } };
		renderBoard(gameState, boardGroup, null, THREE);
		expect(gameState.__vikingBase).toBeFalsy();
		expect(boardGroup.getObjectByName('vikingRocks')).toBeUndefined();
		const inst = boardGroup.children.find(c => c.userData.type === 'instancedCells');
		expect(inst.material.name).toBe('');
		expect(inst.material.onBeforeCompile.toString()).not.toMatch(/vkNoise/);
	});
});

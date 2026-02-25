/**
 * Tests for the gameContext module.
 *
 * Verifies the shared state getter/setter pairs, constants, and
 * that no circular dependency issues exist at import time.
 */

// Mock browser globals before import
const mockTHREE = { WebGLRenderer: jest.fn(), Scene: jest.fn() };
global.window = global.window || {};
global.window.THREE = mockTHREE;
global.window.location = global.window.location || { hostname: 'localhost', href: 'http://localhost' };
global.localStorage = global.localStorage || { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };

describe('gameContext', () => {
	let ctx;

	beforeEach(() => {
		jest.resetModules();
		// Re-import to get a fresh module (module-scoped state)
		ctx = require('../../public/js/gameContext.js');
	});

	describe('getTHREE / setTHREE', () => {
		it('returns window.THREE by default', () => {
			expect(ctx.getTHREE()).toBe(mockTHREE);
		});

		it('returns the explicitly set value after setTHREE', () => {
			const custom = { custom: true };
			ctx.setTHREE(custom);
			expect(ctx.getTHREE()).toBe(custom);
		});
	});

	describe('scene getter/setter', () => {
		it('starts as undefined', () => {
			expect(ctx.getScene()).toBeUndefined();
		});

		it('stores and retrieves a scene', () => {
			const scene = { name: 'testScene' };
			ctx.setScene(scene);
			expect(ctx.getScene()).toBe(scene);
		});
	});

	describe('camera getter/setter', () => {
		it('stores and retrieves a camera', () => {
			const camera = { isPerspectiveCamera: true };
			ctx.setCamera(camera);
			expect(ctx.getCamera()).toBe(camera);
		});
	});

	describe('renderer getter/setter', () => {
		it('stores and retrieves a renderer', () => {
			const renderer = { domElement: {} };
			ctx.setRenderer(renderer);
			expect(ctx.getRenderer()).toBe(renderer);
		});
	});

	describe('groups', () => {
		it('stores boardGroup', () => {
			const group = { name: 'board' };
			ctx.setBoardGroup(group);
			expect(ctx.getBoardGroup()).toBe(group);
		});

		it('stores tetrominoGroup', () => {
			const group = { name: 'tetrominos' };
			ctx.setTetrominoGroup(group);
			expect(ctx.getTetrominoGroup()).toBe(group);
		});

		it('stores chessPiecesGroup', () => {
			const group = { name: 'chessPieces' };
			ctx.setChessPiecesGroup(group);
			expect(ctx.getChessPiecesGroup()).toBe(group);
		});
	});

	describe('PLAYER_COLORS', () => {
		it('returns a frozen object with self and other keys', () => {
			const colours = ctx.getPlayerColors();
			expect(colours).toHaveProperty('self');
			expect(colours).toHaveProperty('other');
			expect(Object.isFrozen(colours)).toBe(true);
		});
	});

	describe('models', () => {
		it('returns an object with pieces, board, and defaultPieces', () => {
			const m = ctx.getModels();
			expect(m).toHaveProperty('pieces');
			expect(m).toHaveProperty('board');
			expect(m).toHaveProperty('defaultPieces');
		});
	});

	describe('animationQueue', () => {
		it('returns an array', () => {
			expect(Array.isArray(ctx.getAnimationQueue())).toBe(true);
		});
	});

	describe('constants', () => {
		it('exports axis constants', () => {
			expect(ctx.AXIS_LENGTH).toBe(20);
			expect(ctx.AXIS_LABEL_SIZE).toBe(1.0);
			expect(ctx.AXIS_LABEL_OFFSET).toBe(1.2);
		});
	});
});

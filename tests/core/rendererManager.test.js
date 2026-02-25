/**
 * Tests for the rendererManager module.
 *
 * Verifies:
 * - configureRenderer applies settings correctly
 * - createRendererWithFallback disposes failed attempts
 * - The bug fix: failed renderers are cleaned up to avoid GPU context exhaustion
 */

const mockDispose = jest.fn();
const mockForceContextLoss = jest.fn();
const mockSetPixelRatio = jest.fn();
const mockSetSize = jest.fn();

const createMockRenderer = (shouldThrow = false) => {
	if (shouldThrow) throw new Error('WebGL context creation failed');
	return {
		setPixelRatio: mockSetPixelRatio,
		setSize: mockSetSize,
		shadowMap: { enabled: false },
		dispose: mockDispose,
		forceContextLoss: mockForceContextLoss
	};
};

// Mock browser globals
global.window = global.window || {};
global.window.THREE = {
	WebGLRenderer: jest.fn().mockImplementation((opts) => createMockRenderer(false)),
	PCFSoftShadowMap: 2
};
global.window.location = global.window.location || { hostname: 'localhost', href: 'http://localhost' };
global.window.devicePixelRatio = 2;
global.localStorage = global.localStorage || { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };

global.document = global.document || {};
global.document.createElement = jest.fn(() => ({
	getContext: jest.fn(() => null)
}));

describe('rendererManager', () => {
	let rm;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		global.window.THREE = {
			WebGLRenderer: jest.fn().mockImplementation(() => createMockRenderer(false)),
			PCFSoftShadowMap: 2
		};
		global.window.devicePixelRatio = 2;

		rm = require('../../public/js/rendererManager.js');
	});

	describe('configureRenderer', () => {
		it('sets pixel ratio, size, and shadow map settings', () => {
			const renderer = createMockRenderer();
			rm.configureRenderer(renderer, false, 800, 600);

			expect(mockSetPixelRatio).toHaveBeenCalled();
			expect(mockSetSize).toHaveBeenCalledWith(800, 600);
		});

		it('disables shadow map in cute mode', () => {
			const renderer = createMockRenderer();
			rm.configureRenderer(renderer, true, 800, 600);

			expect(renderer.shadowMap.enabled).toBe(false);
		});
	});

	describe('createRendererWithFallback', () => {
		it('returns a renderer and strategy on success', () => {
			const result = rm.createRendererWithFallback(false, 800, 600);
			expect(result).toHaveProperty('renderer');
			expect(result).toHaveProperty('strategy');
			expect(result.strategy).toBe('primary');
		});

		it('tries fallback strategies when primary fails', () => {
			let callCount = 0;
			global.window.THREE.WebGLRenderer = jest.fn().mockImplementation(() => {
				callCount++;
				if (callCount <= 1) throw new Error('primary failed');
				return createMockRenderer(false);
			});

			jest.resetModules();
			rm = require('../../public/js/rendererManager.js');

			const result = rm.createRendererWithFallback(false, 800, 600);
			expect(result.strategy).toBe('compat-low-power');
		});

		it('disposes partially-created renderers on failure (BUG FIX verification)', () => {
			let callCount = 0;
			const partialRenderers = [];

			global.window.THREE.WebGLRenderer = jest.fn().mockImplementation(() => {
				callCount++;
				const renderer = createMockRenderer(false);
				if (callCount <= 2) {
					partialRenderers.push(renderer);
					// Return the renderer, but make setSize throw to simulate
					// a configureRenderer failure after the WebGL context is allocated
					renderer.setSize = jest.fn(() => {
						throw new Error(`configure failed for attempt ${callCount}`);
					});
				}
				return renderer;
			});

			jest.resetModules();
			rm = require('../../public/js/rendererManager.js');

			const result = rm.createRendererWithFallback(false, 800, 600);
			expect(result).toHaveProperty('renderer');

			// Failed renderers had their context released to free GPU slots
			partialRenderers.forEach(r => {
				expect(r.forceContextLoss).toHaveBeenCalled();
				expect(r.dispose).toHaveBeenCalled();
			});
		});

		it('throws with details when all strategies fail', () => {
			global.window.THREE.WebGLRenderer = jest.fn().mockImplementation(() => {
				throw new Error('no WebGL');
			});

			jest.resetModules();
			rm = require('../../public/js/rendererManager.js');

			expect(() => rm.createRendererWithFallback(false, 800, 600)).toThrow(/WebGL context/);
		});
	});
});

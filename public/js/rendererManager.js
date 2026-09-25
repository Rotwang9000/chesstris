/**
 * Renderer Manager Module
 *
 * Handles WebGL renderer creation with multi-strategy fallbacks.
 * Properly disposes failed renderer attempts to avoid exhausting GPU contexts.
 */

import { getTHREE } from './gameContext.js';

const WEBGL_CONTEXT_TYPES = ['webgl2', 'webgl', 'experimental-webgl'];

/**
 * Shader precision — `highp` on every profile, deliberately.
 *
 * Desktop GPUs silently execute mediump/lowp at full precision, so the
 * old `mediump` (normal) / `lowp` (cute) hints cost nothing there. On
 * tablet and phone GPUs those hints are REAL: mediump is a 16-bit half
 * float, and three r132 injects the precision qualifier into the VERTEX
 * shader as well as the fragment shader. Half floats carry ~3 decimal
 * digits, so at the world coordinates this game actually uses — home
 * zones sit ~100 cells from the origin, battle arenas thousands — the
 * position quantum grows to a noticeable fraction of a cell (and to
 * whole units out at the arenas). Every camera move re-rounds each
 * vertex to a different quantum, which is exactly the "all the cells
 * vibrate when I spin the view on a tablet" report: geometry snapping
 * between quantised positions many times a second.
 *
 * `highp` is guaranteed available in vertex shaders on all WebGL
 * hardware, and three downgrades automatically if a device can't do
 * highp in fragment shaders — so this is safe everywhere. The cute
 * profile still saves its frame time through pixel ratio, no
 * antialiasing and shadows-off, none of which touch precision.
 */
const SHADER_PRECISION = 'highp';

/**
 * Apply standard configuration to a renderer instance.
 */
export function configureRenderer(rendererInstance, isCute, containerWidth, containerHeight) {
	const pixelRatio = isCute
		? Math.min(1, window.devicePixelRatio * 0.6)
		: Math.min(window.devicePixelRatio || 1, 2);

	rendererInstance.setPixelRatio(pixelRatio);
	rendererInstance.setSize(containerWidth, containerHeight);
	rendererInstance.shadowMap.enabled = !isCute;
	if (rendererInstance.shadowMap.enabled) {
		const THREE = getTHREE();
		rendererInstance.shadowMap.type = THREE.PCFSoftShadowMap;
	}
}

/**
 * Safely dispose a renderer, releasing its WebGL context slot.
 * Browsers limit concurrent contexts (typically 8–16); leaked contexts
 * cause "Error creating WebGL context" crashes.
 */
function disposeRenderer(renderer) {
	if (!renderer) return;
	try { renderer.forceContextLoss(); } catch (_) { /* best-effort */ }
	try { renderer.dispose(); } catch (_) { /* best-effort */ }
}

/**
 * Create a WebGL renderer using multiple fallback strategies.
 *
 * Each failed attempt is disposed immediately so the next attempt can
 * reuse the freed GPU context slot.
 *
 * @param {boolean} isCute - Whether to use "cute" low-quality profile
 * @param {number} containerWidth
 * @param {number} containerHeight
 * @returns {{ renderer: THREE.WebGLRenderer, strategy: string }}
 */
export function createRendererWithFallback(isCute, containerWidth, containerHeight) {
	const THREE = getTHREE();
	const attempts = [
		{
			label: 'primary',
			options: {
				antialias: !isCute,
				alpha: true,
				powerPreference: isCute ? 'low-power' : 'high-performance',
				precision: SHADER_PRECISION
			}
		},
		{
			label: 'compat-low-power',
			options: {
				antialias: false,
				alpha: false,
				stencil: false,
				depth: true,
				powerPreference: 'low-power',
				precision: SHADER_PRECISION,
				failIfMajorPerformanceCaveat: false
			}
		},
		{
			label: 'compat-default',
			options: {
				antialias: false,
				alpha: false,
				stencil: false,
				depth: true,
				powerPreference: 'default',
				precision: SHADER_PRECISION,
				failIfMajorPerformanceCaveat: false
			}
		}
	];

	const errors = [];

	for (const attempt of attempts) {
		let candidate = null;
		try {
			candidate = new THREE.WebGLRenderer(attempt.options);
			configureRenderer(candidate, isCute, containerWidth, containerHeight);
			return { renderer: candidate, strategy: attempt.label };
		} catch (error) {
			disposeRenderer(candidate);
			errors.push(`${attempt.label}: ${error && error.message ? error.message : String(error)}`);
		}
	}

	// Manual context creation as a last resort
	try {
		const canvas = document.createElement('canvas');
		const contextAttributes = {
			alpha: false,
			antialias: false,
			stencil: false,
			depth: true,
			preserveDrawingBuffer: false,
			powerPreference: 'low-power',
			failIfMajorPerformanceCaveat: false
		};

		let context = null;
		let contextType = '';
		for (const type of WEBGL_CONTEXT_TYPES) {
			try {
				context = canvas.getContext(type, contextAttributes);
				if (context) {
					contextType = type;
					break;
				}
			} catch (innerError) {
				errors.push(`${type}: ${innerError && innerError.message ? innerError.message : String(innerError)}`);
			}
		}

		if (!context) {
			throw new Error('No compatible WebGL context was returned');
		}

		const manualRenderer = new THREE.WebGLRenderer({
			canvas,
			context,
			antialias: false,
			alpha: false,
			powerPreference: 'low-power',
			precision: SHADER_PRECISION
		});
		configureRenderer(manualRenderer, isCute, containerWidth, containerHeight);
		return { renderer: manualRenderer, strategy: `manual-${contextType}` };
	} catch (error) {
		errors.push(`manual-context: ${error && error.message ? error.message : String(error)}`);
	}

	const finalError = new Error(
		`Error creating WebGL context. Tried multiple compatibility modes. ` +
		`Please enable hardware acceleration in your browser/system settings and restart the browser.`
	);
	finalError.details = errors;
	throw finalError;
}

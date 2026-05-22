/**
 * Thin wrapper around Three.js `OrbitControls`.
 *
 * Picks up the constructor from whichever attachment point Three.js
 * exposes (member of `THREE`, global, or window), and applies the
 * Tetches default tuning so callers don't repeat the same boilerplate.
 */

import { getTHREE } from '../gameContext.js';

function configureOrbitControls(ctrl, THREE) {
	if (!ctrl) return;
	ctrl.enableDamping = true;
	ctrl.dampingFactor = 0.15;
	ctrl.screenSpacePanning = true;
	ctrl.minDistance = 10;
	ctrl.maxDistance = 80;
	ctrl.maxPolarAngle = Math.PI / 2 - 0.1;
	ctrl.target.set(8, 0, 8);
	ctrl.enabled = true;
	if (THREE && THREE.TOUCH) {
		ctrl.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
	}
	ctrl.rotateSpeed = 0.7;
	ctrl.panSpeed = 0.8;
	ctrl.zoomSpeed = 1.0;
	try { ctrl.update(); } catch (_) { /* best-effort */ }
}

/**
 * Build an `OrbitControls` instance for the given camera + canvas, or
 * return `null` if Three.js was loaded without controls support.
 */
export function initializeOrbitControls(camera, domElement) {
	try {
		const THREE = getTHREE();
		let orbitControls = null;

		if (THREE && typeof THREE.OrbitControls === 'function') {
			orbitControls = new THREE.OrbitControls(camera, domElement);
		} else if (typeof window !== 'undefined' && typeof window.OrbitControls === 'function') {
			orbitControls = new window.OrbitControls(camera, domElement);
		} else if (typeof OrbitControls === 'function') {
			orbitControls = new OrbitControls(camera, domElement);
		} else {
			console.warn('OrbitControls not available — camera will be static');
			return null;
		}

		configureOrbitControls(orbitControls, THREE);
		return orbitControls;
	} catch (error) {
		console.error('Error initialising OrbitControls:', error);
		return null;
	}
}

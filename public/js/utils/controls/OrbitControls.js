/**
 * OrbitControls Module
 * This is a module that re-exports OrbitControls from the global scope
 * for use with ES modules
 */

// Import THREE.js
import * as THREE from '../three.module.js';

// Create a fallback OrbitControls class if not available
class OrbitControlsFallback {
	constructor(camera, domElement) {
		this.camera = camera;
		this.domElement = domElement;
		this.enabled = true;
		this.enableDamping = false;
		this.dampingFactor = 0.05;
		this.target = new THREE.Vector3();
		console.warn('Using OrbitControls fallback - camera controls will be limited');
	}
	
	update() {
		// Do nothing in the fallback
		return true;
	}
	
	reset() {
		// Do nothing in the fallback
		return true;
	}
	
	dispose() {
		// Do nothing in the fallback
		return true;
	}
}

// Use THREE.OrbitControls if available, otherwise use the fallback
export const OrbitControls = (THREE && THREE.OrbitControls) ? 
	THREE.OrbitControls : 
	(window.THREE && window.THREE.OrbitControls) ? 
		window.THREE.OrbitControls : 
		OrbitControlsFallback;

// Default export
export default OrbitControls; 
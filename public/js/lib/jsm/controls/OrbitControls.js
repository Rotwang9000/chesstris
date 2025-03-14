/**
 * OrbitControls Module
 * This is a module that re-exports OrbitControls from the global scope
 * for use with ES modules
 */

import * as THREE from 'three';

// Get OrbitControls from global scope
const OrbitControls = window.OrbitControls || window.THREE?.OrbitControls 

// Fallback implementation if not available globally
class FallbackOrbitControls {
	constructor(camera, domElement) {
		this.camera = camera;
		this.domElement = domElement;
		this.target = new THREE.Vector3();
		this.enabled = true;
		this.enableDamping = false;
		this.dampingFactor = 0.05;
		this.screenSpacePanning = true;
		
		// Make event handlers
		this._onMouseDown = this._onMouseDown.bind(this);
		this._onMouseMove = this._onMouseMove.bind(this);
		this._onMouseUp = this._onMouseUp.bind(this);
		this._onMouseWheel = this._onMouseWheel.bind(this);
		
		// Add event listeners
		this.domElement.addEventListener('mousedown', this._onMouseDown);
		document.addEventListener('mousemove', this._onMouseMove);
		document.addEventListener('mouseup', this._onMouseUp);
		this.domElement.addEventListener('wheel', this._onMouseWheel);
		
		// State variables
		this._isMouseDown = false;
		this._mouseX = 0;
		this._mouseY = 0;
		this._targetRotationX = 0;
		this._targetRotationY = 0;
	}
	
	_onMouseDown(event) {
		this._isMouseDown = true;
		this._mouseX = event.clientX;
		this._mouseY = event.clientY;
	}
	
	_onMouseMove(event) {
		if (!this._isMouseDown) return;
		
		const deltaX = event.clientX - this._mouseX;
		const deltaY = event.clientY - this._mouseY;
		
		this._targetRotationX += deltaX * 0.01;
		this._targetRotationY += deltaY * 0.01;
		
		this._mouseX = event.clientX;
		this._mouseY = event.clientY;
	}
	
	_onMouseUp() {
		this._isMouseDown = false;
	}
	
	_onMouseWheel(event) {
		const delta = Math.sign(event.deltaY);
		const cameraPosition = this.camera.position.clone();
		const direction = new THREE.Vector3()
			.subVectors(this.camera.position, this.target)
			.normalize();
		
		// Move camera along the direction by delta
		this.camera.position.add(direction.multiplyScalar(delta * 2));
	}
	
	update() {
		if (!this.enabled) return;
		
		// Simple orbit around target
		const position = this.camera.position.clone().sub(this.target);
		
		// Apply rotation
		const distance = position.length();
		position.x = Math.sin(this._targetRotationX) * Math.cos(this._targetRotationY) * distance;
		position.z = Math.cos(this._targetRotationX) * Math.cos(this._targetRotationY) * distance;
		position.y = Math.sin(this._targetRotationY) * distance;
		
		// Update camera position
		this.camera.position.copy(position.add(this.target));
		this.camera.lookAt(this.target);
		
		return true;
	}
	
	dispose() {
		this.domElement.removeEventListener('mousedown', this._onMouseDown);
		document.removeEventListener('mousemove', this._onMouseMove);
		document.removeEventListener('mouseup', this._onMouseUp);
		this.domElement.removeEventListener('wheel', this._onMouseWheel);
	}
};

// Log whether we're using the global or fallback implementation
if (window.OrbitControls || window.THREE?.OrbitControls) {
	console.log('Using global OrbitControls');
} else {
	console.warn('Using fallback OrbitControls implementation');
}

// Export OrbitControls
export { OrbitControls }; 
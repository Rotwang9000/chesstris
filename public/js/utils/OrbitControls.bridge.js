/**
 * OrbitControls Bridge Script
 * 
 * This provides a simple bridge to make OrbitControls available globally
 * when needed. If THREE.js is already loaded, it will use its OrbitControls,
 * otherwise it creates a simple shim that won't break the renderer.
 */

// Check if OrbitControls is already available
if (typeof window.OrbitControls === 'undefined') {
	console.log('Creating OrbitControls shim...');
	
	// If THREE.js OrbitControls is available, use that
	if (window.THREE && window.THREE.OrbitControls) {
		window.OrbitControls = window.THREE.OrbitControls;
		console.log('Using THREE.OrbitControls');
	} else {
		// Create a simple shim that won't break functionality
		window.OrbitControls = function(camera, domElement) {
			this.object = camera;
			this.domElement = domElement;
			this.enabled = true;
			this.target = window.THREE ? new window.THREE.Vector3() : { x: 0, y: 0, z: 0 };
			this.enableDamping = false;
			this.dampingFactor = 0.05;
			this.enableZoom = true;
			this.enablePan = true;
			this.enableRotate = true;
			
			// No-op methods to prevent errors
			this.update = function() { return true; };
			this.dispose = function() {};
			this.reset = function() {};
			this.saveState = function() {};
			this.addEventListener = function() {};
			this.removeEventListener = function() {};
			
			console.log('OrbitControls shim created');
		};
	}
} else {
	console.log('OrbitControls already available');
} 
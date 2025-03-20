/**
 * Debug Utilities for Shaktris
 * 
 * Helper functions for debugging and diagnostics.
 */

/**
 * Check if THREE.js is properly loaded
 * @returns {Object} Status object with isLoaded and details
 */
export function checkThreeJsStatus() {
	const status = {
		isLoaded: false,
		hasOrbitControls: false,
		details: {}
	};
	
	try {
		// Check if THREE is defined
		if (typeof THREE !== 'undefined') {
			status.isLoaded = true;
			status.details.version = THREE.REVISION;
			
			// Check if OrbitControls is available
			if (typeof THREE.OrbitControls !== 'undefined') {
				status.hasOrbitControls = true;
			}
			
			// Check for renderer support
			try {
				const testRenderer = new THREE.WebGLRenderer();
				status.details.hasWebGL = true;
				status.details.isWebGL2 = testRenderer.capabilities.isWebGL2;
			} catch (error) {
				status.details.hasWebGL = false;
				status.details.rendererError = error.message;
			}
		}
	} catch (error) {
		status.error = error.message;
	}
	
	return status;
}

/**
 * Check WebGL capabilities of the browser
 * @returns {Object} WebGL status information
 */
export function checkWebGLSupport() {
	const status = {
		hasWebGL: false,
		hasWebGL2: false,
		details: {}
	};
	
	try {
		// Try to create WebGL context
		const canvas = document.createElement('canvas');
		let gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		
		if (gl) {
			status.hasWebGL = true;
			
			// Get WebGL info
			status.details.vendor = gl.getParameter(gl.VENDOR);
			status.details.renderer = gl.getParameter(gl.RENDERER);
			status.details.version = gl.getParameter(gl.VERSION);
			status.details.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
			
			// Check for WebGL 2
			const gl2 = canvas.getContext('webgl2');
			if (gl2) {
				status.hasWebGL2 = true;
			}
		}
	} catch (error) {
		status.error = error.message;
	}
	
	return status;
}

/**
 * Print system diagnostics to console
 */
export function printSystemDiagnostics() {
	console.group('Shaktris System Diagnostics');
	
	// Check browser info
	console.log('Browser:', navigator.userAgent);
	
	// Check THREE.js status
	const threeStatus = checkThreeJsStatus();
	console.log('THREE.js Status:', threeStatus.isLoaded ? 'Loaded' : 'Not Loaded');
	console.log('THREE.js Details:', threeStatus);
	
	// Check WebGL support
	const webglStatus = checkWebGLSupport();
	console.log('WebGL Support:', webglStatus.hasWebGL ? 'Yes' : 'No');
	console.log('WebGL2 Support:', webglStatus.hasWebGL2 ? 'Yes' : 'No');
	console.log('WebGL Details:', webglStatus.details);
	
	// Check window dimensions
	console.log('Window Size:', window.innerWidth + 'x' + window.innerHeight);
	
	console.groupEnd();
	
	return {
		threeStatus,
		webglStatus,
		windowSize: {
			width: window.innerWidth,
			height: window.innerHeight
		}
	};
}

/**
 * Create a simplistic THREE.js scene to test if rendering works
 * @param {HTMLElement} container - Container element
 * @returns {Object} Test result with success status
 */
export function testThreeJsRendering(container) {
	const result = {
		success: false,
		steps: []
	};
	
	try {
		result.steps.push('Creating scene');
		const scene = new THREE.Scene();
		
		result.steps.push('Creating camera');
		const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
		camera.position.z = 5;
		
		result.steps.push('Creating renderer');
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		
		result.steps.push('Adding to DOM');
		container.appendChild(renderer.domElement);
		
		result.steps.push('Creating geometry');
		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
		const cube = new THREE.Mesh(geometry, material);
		scene.add(cube);
		
		result.steps.push('Rendering test frame');
		renderer.render(scene, camera);
		
		result.steps.push('Removing test renderer');
		container.removeChild(renderer.domElement);
		
		result.success = true;
	} catch (error) {
		result.error = error.message;
		result.errorStep = result.steps[result.steps.length - 1];
	}
	
	return result;
}

/**
 * Show a diagnostic overlay on the page
 * @param {Object} diagnosticData - Diagnostic information to display
 */
export function showDiagnosticOverlay(diagnosticData) {
	// Create overlay element
	let overlay = document.getElementById('diagnostic-overlay');
	if (!overlay) {
		overlay = document.createElement('div');
		overlay.id = 'diagnostic-overlay';
		overlay.style.position = 'fixed';
		overlay.style.bottom = '10px';
		overlay.style.right = '10px';
		overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		overlay.style.color = '#00ff00';
		overlay.style.padding = '10px';
		overlay.style.borderRadius = '5px';
		overlay.style.fontFamily = 'monospace';
		overlay.style.fontSize = '12px';
		overlay.style.maxWidth = '400px';
		overlay.style.maxHeight = '300px';
		overlay.style.overflow = 'auto';
		overlay.style.zIndex = '9999';
		document.body.appendChild(overlay);
	}
	
	// Build HTML content
	let content = '<h3>Shaktris Diagnostics</h3>';
	
	// THREE.js status
	if (diagnosticData.threeStatus) {
		content += `<p>THREE.js: ${diagnosticData.threeStatus.isLoaded ? '✅' : '❌'}</p>`;
		if (diagnosticData.threeStatus.isLoaded) {
			content += `<p>Version: ${diagnosticData.threeStatus.details.version || 'Unknown'}</p>`;
		}
		if (diagnosticData.threeStatus.error) {
			content += `<p>Error: ${diagnosticData.threeStatus.error}</p>`;
		}
	}
	
	// WebGL status
	if (diagnosticData.webglStatus) {
		content += `<p>WebGL: ${diagnosticData.webglStatus.hasWebGL ? '✅' : '❌'}</p>`;
		if (diagnosticData.webglStatus.hasWebGL) {
			content += `<p>Renderer: ${diagnosticData.webglStatus.details.renderer || 'Unknown'}</p>`;
		}
	}
	
	// Test rendering result
	if (diagnosticData.renderTest) {
		content += `<p>Render Test: ${diagnosticData.renderTest.success ? '✅' : '❌'}</p>`;
		if (!diagnosticData.renderTest.success && diagnosticData.renderTest.error) {
			content += `<p>Error at '${diagnosticData.renderTest.errorStep}': ${diagnosticData.renderTest.error}</p>`;
		}
	}
	
	// Add close button
	content += '<button onclick="this.parentNode.style.display=\'none\'">Close</button>';
	
	overlay.innerHTML = content;
} 
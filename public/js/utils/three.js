/**
 * Three.js Utility Module
 * 
 * Provides access to the Three.js library loaded from CDN.
 * This module bridges the gap between the global THREE object and ES modules.
 */

// Make sure THREE is available globally
if (typeof THREE === 'undefined') {
	console.error('Three.js library not loaded. Make sure the CDN script is included in the HTML.');
}

// Export the global THREE object
export default THREE;

// Export named elements from THREE for convenience
export const Scene = THREE.Scene;
export const PerspectiveCamera = THREE.PerspectiveCamera;
export const WebGLRenderer = THREE.WebGLRenderer;
export const BoxGeometry = THREE.BoxGeometry;
export const MeshBasicMaterial = THREE.MeshBasicMaterial;
export const Mesh = THREE.Mesh;
export const Vector3 = THREE.Vector3;
export const Color = THREE.Color;
export const AmbientLight = THREE.AmbientLight;
export const DirectionalLight = THREE.DirectionalLight;
export const Clock = THREE.Clock;
export const MathUtils = THREE.MathUtils;

// Export OrbitControls
export const OrbitControls = THREE.OrbitControls; 
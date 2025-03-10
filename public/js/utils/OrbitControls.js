/**
 * OrbitControls Module
 * This is a stub that imports from three.js's OrbitControls
 */

// Import THREE.js
import * as THREE from './three.js';

// Check if THREE has OrbitControls directly
const ThreeOrbitControls = THREE.OrbitControls || window.THREE.OrbitControls;

// Export OrbitControls
export const OrbitControls = ThreeOrbitControls;

// Default export
export default OrbitControls; 
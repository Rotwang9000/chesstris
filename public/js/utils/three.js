/**
 * Three.js Utility Module
 * 
 * Provides access to the Three.js library loaded from CDN.
 * This module bridges the gap between the global THREE object and ES modules.
 */

// Make sure THREE is available globally
if (typeof THREE === 'undefined') {
	console.error('Three.js library not loaded. Make sure the CDN script is included in the HTML.');
	throw new Error('THREE is not defined');
}

// Export named constructors directly
export const Scene = THREE.Scene;
export const PerspectiveCamera = THREE.PerspectiveCamera;
export const WebGLRenderer = THREE.WebGLRenderer;
export const BoxGeometry = THREE.BoxGeometry;
export const PlaneGeometry = THREE.PlaneGeometry;
export const CylinderGeometry = THREE.CylinderGeometry;
export const SphereGeometry = THREE.SphereGeometry;
export const MeshBasicMaterial = THREE.MeshBasicMaterial;
export const MeshStandardMaterial = THREE.MeshStandardMaterial;
export const MeshLambertMaterial = THREE.MeshLambertMaterial;
export const MeshPhongMaterial = THREE.MeshPhongMaterial;
export const Mesh = THREE.Mesh;
export const Group = THREE.Group;
export const Object3D = THREE.Object3D;
export const Vector3 = THREE.Vector3;
export const Vector2 = THREE.Vector2;
export const Color = THREE.Color;
export const AmbientLight = THREE.AmbientLight;
export const DirectionalLight = THREE.DirectionalLight;
export const PointLight = THREE.PointLight;
export const SpotLight = THREE.SpotLight;
export const TextureLoader = THREE.TextureLoader;
export const Clock = THREE.Clock;
export const Raycaster = THREE.Raycaster;
export const MathUtils = THREE.MathUtils;
export const Euler = THREE.Euler;
export const Quaternion = THREE.Quaternion;
export const Matrix4 = THREE.Matrix4;
export const BufferGeometry = THREE.BufferGeometry;
export const BufferAttribute = THREE.BufferAttribute;
export const DoubleSide = THREE.DoubleSide;
export const AdditiveBlending = THREE.AdditiveBlending;
export const NormalBlending = THREE.NormalBlending;
export const FrontSide = THREE.FrontSide;
export const BackSide = THREE.BackSide;

// Export OrbitControls
export const OrbitControls = THREE.OrbitControls;

// Export the global THREE object for any additional properties
export default THREE; 
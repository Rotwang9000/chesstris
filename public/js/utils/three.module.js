/**
 * THREE.js Module
 * This is a module that re-exports THREE from the global scope
 * for use with ES modules
 */

// Get THREE from global scope
const THREE = window.THREE || {};

// Check what version of Three.js we're using and log it
if (THREE.REVISION) {
	console.log('Three.js Version:', THREE.REVISION);
} else {
	console.warn('THREE.js not found in global scope');
}

// Export THREE as default
export default THREE;

// Export commonly used classes
export const Scene = THREE.Scene;
export const PerspectiveCamera = THREE.PerspectiveCamera;
export const WebGLRenderer = THREE.WebGLRenderer;
export const Color = THREE.Color;
export const Vector3 = THREE.Vector3;
export const Vector2 = THREE.Vector2;
export const Group = THREE.Group;
export const Object3D = THREE.Object3D;
export const Mesh = THREE.Mesh;
export const BoxGeometry = THREE.BoxGeometry;
export const SphereGeometry = THREE.SphereGeometry;
export const CylinderGeometry = THREE.CylinderGeometry;
export const ConeGeometry = THREE.ConeGeometry;
export const PlaneGeometry = THREE.PlaneGeometry;
export const BufferGeometry = THREE.BufferGeometry;
export const MeshBasicMaterial = THREE.MeshBasicMaterial;
export const MeshStandardMaterial = THREE.MeshStandardMaterial;
export const MeshPhongMaterial = THREE.MeshPhongMaterial;
export const MeshLambertMaterial = THREE.MeshLambertMaterial;
export const DirectionalLight = THREE.DirectionalLight;
export const AmbientLight = THREE.AmbientLight;
export const PointLight = THREE.PointLight;
export const SpotLight = THREE.SpotLight;
export const FogExp2 = THREE.FogExp2;
export const Sprite = THREE.Sprite;
export const SpriteMaterial = THREE.SpriteMaterial;
export const CanvasTexture = THREE.CanvasTexture;
export const TextureLoader = THREE.TextureLoader;
export const BufferAttribute = THREE.BufferAttribute;
export const Clock = THREE.Clock;
export const Raycaster = THREE.Raycaster;
export const Matrix4 = THREE.Matrix4;
export const Quaternion = THREE.Quaternion;
export const Euler = THREE.Euler;
export const GridHelper = THREE.GridHelper;
export const EdgesGeometry = THREE.EdgesGeometry;
export const LineBasicMaterial = THREE.LineBasicMaterial;
export const LineSegments = THREE.LineSegments;

// Sides and blending modes
export const DoubleSide = THREE.DoubleSide;
export const FrontSide = THREE.FrontSide;
export const BackSide = THREE.BackSide;
export const AdditiveBlending = THREE.AdditiveBlending;
export const NormalBlending = THREE.NormalBlending;

// No need to re-export from three.js as it would create a circular reference
// export * from './three.js'; 
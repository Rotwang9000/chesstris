/**
 * THREE.js Module
 * This module imports Three.js using ES modules and re-exports the commonly used classes
 */

// Import Three.js using ES modules
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Log the version
console.log('Three.js Version:', THREE.REVISION);

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

// Sides and blending modes
export const DoubleSide = THREE.DoubleSide;
export const FrontSide = THREE.FrontSide;
export const BackSide = THREE.BackSide;
export const AdditiveBlending = THREE.AdditiveBlending;
export const NormalBlending = THREE.NormalBlending;

// Export OrbitControls
export { OrbitControls }; 
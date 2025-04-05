/**
 * Board animations module for Shaktris
 * Handles animations for cell and piece movement, removal, and appearance
 */

import * as THREE from 'three';
import { TWEEN } from 'three/addons/libs/tween.module.min.js';

/**
 * Animate the movement of an object from one position to another
 * @param {Object} object - THREE.js object to animate
 * @param {Object} startPos - Starting position {x, y, z}
 * @param {Object} endPos - Ending position {x, y, z}
 * @param {Function} onComplete - Callback function when animation completes
 * @param {Object} options - Additional animation options
 * @returns {Object} The TWEEN object for further control
 */
export function animateMovement(object, startPos, endPos, onComplete, options = {}) {
	if (!object) return null;
	
	// Default options
	const defaults = {
		duration: 0.8, // seconds
		easing: TWEEN.Easing.Quadratic.InOut,
		jumpHeight: 0.5, // for arc motion
		useArc: true, // whether to use arc motion
		scaleFrom: null, // optional scale animation
		scaleTo: null, // optional scale animation
		rotationStart: null, // optional rotation animation
		rotationEnd: null // optional rotation animation
	};
	
	const settings = { ...defaults, ...options };
	
	// If no position change, just handle other animations
	if (!startPos && !endPos) {
		// Handle scale animation if requested
		if (settings.scaleFrom && settings.scaleTo) {
			const scaleAnimation = new TWEEN.Tween(settings.scaleFrom)
				.to(settings.scaleTo, settings.duration * 1000)
				.easing(settings.easing)
				.onUpdate(() => {
					object.scale.set(
						settings.scaleFrom.x,
						settings.scaleFrom.y,
						settings.scaleFrom.z
					);
				})
				.onComplete(() => {
					if (typeof onComplete === 'function') {
						onComplete();
					}
				})
				.start();
			
			return scaleAnimation;
		}
		
		// If no animations specified, just call onComplete
		if (typeof onComplete === 'function') {
			onComplete();
		}
		return null;
	}
	
	// Use current position as start if not provided
	const start = startPos || {
		x: object.position.x,
		y: object.position.y,
		z: object.position.z
	};
	
	// Use current position as end if not provided
	const end = endPos || {
		x: object.position.x,
		y: object.position.y,
		z: object.position.z
	};
	
	// Create animation state
	const state = {
		x: start.x,
		y: start.y || 0,
		z: start.z,
		progress: 0
	};
	
	// Create the tween
	const tween = new TWEEN.Tween(state)
		.to({ 
			x: end.x, 
			y: end.y || 0, 
			z: end.z, 
			progress: 1 
		}, settings.duration * 1000)
		.easing(settings.easing)
		.onUpdate(() => {
			// Update position
			object.position.x = state.x;
			object.position.z = state.z;
			
			// Add arc motion if enabled
			if (settings.useArc) {
				// Simple parabolic arc
				const arcHeight = settings.jumpHeight * Math.sin(Math.PI * state.progress);
				object.position.y = (start.y || 0) + arcHeight;
			} else {
				object.position.y = state.y;
			}
			
			// Update scale if requested
			if (settings.scaleFrom && settings.scaleTo) {
				const scale = {
					x: settings.scaleFrom.x + (settings.scaleTo.x - settings.scaleFrom.x) * state.progress,
					y: settings.scaleFrom.y + (settings.scaleTo.y - settings.scaleFrom.y) * state.progress,
					z: settings.scaleFrom.z + (settings.scaleTo.z - settings.scaleFrom.z) * state.progress
				};
				
				object.scale.set(scale.x, scale.y, scale.z);
			}
			
			// Update rotation if requested
			if (settings.rotationStart && settings.rotationEnd) {
				object.rotation.x = settings.rotationStart.x + 
					(settings.rotationEnd.x - settings.rotationStart.x) * state.progress;
				object.rotation.y = settings.rotationStart.y + 
					(settings.rotationEnd.y - settings.rotationStart.y) * state.progress;
				object.rotation.z = settings.rotationStart.z + 
					(settings.rotationEnd.z - settings.rotationStart.z) * state.progress;
			}
		})
		.onComplete(() => {
			// Ensure final position is exact
			object.position.x = end.x;
			object.position.y = end.y || 0;
			object.position.z = end.z;
			
			// Final scale
			if (settings.scaleTo) {
				object.scale.set(settings.scaleTo.x, settings.scaleTo.y, settings.scaleTo.z);
			}
			
			// Final rotation
			if (settings.rotationEnd) {
				object.rotation.x = settings.rotationEnd.x;
				object.rotation.y = settings.rotationEnd.y;
				object.rotation.z = settings.rotationEnd.z;
			}
			
			// Call complete callback if provided
			if (typeof onComplete === 'function') {
				onComplete();
			}
		})
		.start();
	
	return tween;
}

/**
 * Animate the removal of an object with explosion effect
 * @param {Object} object - THREE.js object to animate
 * @param {Function} onComplete - Callback function when animation completes
 * @param {Object} options - Additional animation options
 * @returns {Object} The TWEEN object for further control
 */
export function animateRemoval(object, onComplete, options = {}) {
	if (!object) return null;
	
	// Default options
	const defaults = {
		duration: 0.5, // seconds
		easing: TWEEN.Easing.Quadratic.In,
		explosionForce: 2, // strength of explosion
		pieces: 5, // number of fragments to create
		fragmentSize: 0.25 // size of fragments
	};
	
	const settings = { ...defaults, ...options };
	
	// Store original parent for cleanup
	const parent = object.parent;
	
	// Create a group for the explosion animation
	const explosionGroup = new THREE.Group();
	explosionGroup.position.copy(object.position);
	parent.add(explosionGroup);
	
	// Hide the original object immediately
	object.visible = false;
	
	// Create explosion fragments
	const fragments = [];
	const geometry = new THREE.BoxGeometry(
		settings.fragmentSize, 
		settings.fragmentSize, 
		settings.fragmentSize
	);
	
	// Use the original object's material if available, or create a new one
	let material;
	if (object.material) {
		if (Array.isArray(object.material)) {
			material = object.material[0].clone();
		} else {
			material = object.material.clone();
		}
	} else {
		material = new THREE.MeshStandardMaterial({ 
			color: 0xcccccc,
			roughness: 0.7,
			metalness: 0.2
		});
	}
	
	// Create fragments
	for (let i = 0; i < settings.pieces; i++) {
		const fragment = new THREE.Mesh(geometry, material);
		
		// Distribute fragments around the object center
		fragment.position.set(
			(Math.random() - 0.5) * 0.2,
			(Math.random() - 0.5) * 0.2,
			(Math.random() - 0.5) * 0.2
		);
		
		// Random rotation
		fragment.rotation.set(
			Math.random() * Math.PI * 2,
			Math.random() * Math.PI * 2,
			Math.random() * Math.PI * 2
		);
		
		// Add to group
		explosionGroup.add(fragment);
		fragments.push({
			mesh: fragment,
			velocity: {
				x: (Math.random() - 0.5) * settings.explosionForce,
				y: Math.random() * settings.explosionForce * 0.8,
				z: (Math.random() - 0.5) * settings.explosionForce
			},
			rotation: {
				x: (Math.random() - 0.5) * 0.1,
				y: (Math.random() - 0.5) * 0.1,
				z: (Math.random() - 0.5) * 0.1
			}
		});
	}
	
	// Animation state
	const state = {
		progress: 0
	};
	
	// Create the tween
	const tween = new TWEEN.Tween(state)
		.to({ progress: 1 }, settings.duration * 1000)
		.easing(settings.easing)
		.onUpdate(() => {
			// Update fragment positions and rotations
			fragments.forEach(fragment => {
				fragment.mesh.position.x += fragment.velocity.x * 0.05;
				fragment.mesh.position.y += fragment.velocity.y * 0.05 - 0.01; // Add gravity
				fragment.mesh.position.z += fragment.velocity.z * 0.05;
				
				fragment.mesh.rotation.x += fragment.rotation.x;
				fragment.mesh.rotation.y += fragment.rotation.y;
				fragment.mesh.rotation.z += fragment.rotation.z;
				
				// Fade out based on progress
				if (fragment.mesh.material.opacity !== undefined) {
					fragment.mesh.material.opacity = 1 - state.progress;
				}
			});
		})
		.onComplete(() => {
			// Clean up the explosion group
			while (explosionGroup.children.length > 0) {
				const child = explosionGroup.children[0];
				explosionGroup.remove(child);
				if (child.geometry) child.geometry.dispose();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose());
					} else {
						child.material.dispose();
					}
				}
			}
			
			// Remove explosion group from parent
			parent.remove(explosionGroup);
			
			// Call complete callback if provided
			if (typeof onComplete === 'function') {
				onComplete();
			}
		})
		.start();
	
	return tween;
}

/**
 * Update all active animations - call this in the render loop
 */
export function updateAnimations() {
	TWEEN.update();
}

// Export animation functions
export default {
	animateMovement,
	animateRemoval,
	updateAnimations
}; 
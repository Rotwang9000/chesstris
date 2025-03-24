/**
 * Create beautiful fluffy clouds for the sky
 * This module provides the cloud creation function that was missing
 */

import * as THREE from './utils/three.module.js';

/**
 * Create beautiful fluffy clouds for the sky
 * @param {THREE.Scene} scene - The THREE.js scene to add clouds to
 * @returns {THREE.Group} The cloud group
 */
export function createFewClouds(scene) {
	try {
		// Create clouds container
		const clouds = new THREE.Group();
		clouds.name = 'clouds';
		
		// Create cloud material - make it very light and soft
		const cloudMaterial = new THREE.MeshStandardMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.92,
			roughness: 1.0,
			metalness: 0.0,
			emissive: 0xAAAAAA,
			emissiveIntensity: 0.2
		});
		
		// Create several fluffy clouds
		const cloudCount = 10;
		
		for (let i = 0; i < cloudCount; i++) {
			// Create a cloud group for each cloud
			const cloudGroup = new THREE.Group();
			
			// Calculate random values based on cloud index
			const seed = i * 412.531;
			const cloudSize = 5 + Math.random() * 10;
			
			// Create puffs for each cloud
			const puffCount = 3 + Math.floor(Math.random() * 5);
			
			for (let j = 0; j < puffCount; j++) {
				// Create a sphere for each puff
				const puffSize = cloudSize * (0.5 + Math.random() * 0.5);
				const puffGeometry = new THREE.SphereGeometry(puffSize, 8, 8);
				const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
				
				// Position puffs to form a cloud shape
				const xRange = cloudSize * 0.7;
				const yRange = cloudSize * 0.3;
				const zRange = cloudSize * 0.5;
				
				puff.position.set(
					(Math.random() - 0.5) * xRange * 2,
					Math.random() * yRange,
					(Math.random() - 0.5) * zRange * 2
				);
				
				cloudGroup.add(puff);
			}
			
			// Position cloud in the sky
			cloudGroup.position.set(
				(Math.random() - 0.5) * 200,
				40 + Math.random() * 30,
				(Math.random() - 0.5) * 200
			);
			
			clouds.add(cloudGroup);
		}
		
		// Add clouds to scene
		scene.add(clouds);
		console.log('Created beautiful sky with clouds');
		
		return clouds;
	} catch (error) {
		console.error('Error creating clouds:', error);
		return null;
	}
} 
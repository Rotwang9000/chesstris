import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import './PawnPromotionVisualizer.css';

/**
 * PawnPromotionVisualizer Component
 * 
 * Visualizes pawn promotion progress toward knight after 8 moves
 * and shows celebration animation when promotion occurs
 */
const PawnPromotionVisualizer = ({ 
	pawnId, 
	moveCount = 0,
	isPromoting = false, 
	pawnPosition,
	onPromotionComplete
}) => {
	const containerRef = useRef(null);
	const sceneRef = useRef(null);
	const cameraRef = useRef(null);
	const rendererRef = useRef(null);
	const pawnRef = useRef(null);
	const knightRef = useRef(null);
	const progressBarRef = useRef(null);
	const animationFrameRef = useRef(null);
	
	// Animation state
	const [promotionProgress, setPromotionProgress] = useState(0);
	const [showCelebration, setShowCelebration] = useState(false);
	
	// Initialize Three.js scene
	useEffect(() => {
		if (!containerRef.current) return;
		
		// Create scene
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x121212);
		sceneRef.current = scene;
		
		// Create camera
		const camera = new THREE.PerspectiveCamera(
			50, 
			containerRef.current.clientWidth / containerRef.current.clientHeight, 
			0.1, 
			1000
		);
		camera.position.set(0, 0, 5);
		camera.lookAt(0, 0, 0);
		cameraRef.current = camera;
		
		// Create renderer
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		renderer.shadowMap.enabled = true;
		containerRef.current.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		
		// Add lights
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		scene.add(ambientLight);
		
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(5, 5, 5);
		directionalLight.castShadow = true;
		scene.add(directionalLight);
		
		// Create pawn and knight models
		createChessPieces();
		
		// Create progress bar
		createProgressBar();
		
		// Animation loop
		const animate = () => {
			if (isPromoting && promotionProgress < 1) {
				// Update promotion animation
				setPromotionProgress(prev => Math.min(prev + 0.01, 1));
				
				if (pawnRef.current && knightRef.current) {
					// Fade out pawn, fade in knight
					pawnRef.current.material.opacity = 1 - promotionProgress;
					knightRef.current.material.opacity = promotionProgress;
					
					// Rotation and scale effects
					pawnRef.current.rotation.y += 0.05;
					knightRef.current.rotation.y += 0.05;
					
					const scale = 1 + 0.3 * Math.sin(promotionProgress * Math.PI);
					pawnRef.current.scale.set(scale, scale, scale);
					knightRef.current.scale.set(scale, scale, scale);
				}
				
				// When promotion completes
				if (promotionProgress >= 1) {
					setShowCelebration(true);
					
					// Notify parent component
					if (onPromotionComplete) {
						onPromotionComplete(pawnId);
					}
				}
			}
			
			// Animate celebration particles
			if (showCelebration && sceneRef.current) {
				animateCelebration();
			}
			
			// Update progress bar
			updateProgressBar();
			
			rendererRef.current.render(sceneRef.current, cameraRef.current);
			animationFrameRef.current = requestAnimationFrame(animate);
		};
		
		animate();
		
		// Handle resize
		const handleResize = () => {
			if (!containerRef.current) return;
			
			camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		};
		
		window.addEventListener('resize', handleResize);
		
		// Cleanup on unmount
		return () => {
			window.removeEventListener('resize', handleResize);
			cancelAnimationFrame(animationFrameRef.current);
			
			if (rendererRef.current && containerRef.current) {
				containerRef.current.removeChild(rendererRef.current.domElement);
			}
			
			if (sceneRef.current) {
				// Dispose of all geometries and materials
				sceneRef.current.traverse((object) => {
					if (object.geometry) object.geometry.dispose();
					
					if (object.material) {
						if (Array.isArray(object.material)) {
							object.material.forEach(material => material.dispose());
						} else {
							object.material.dispose();
						}
					}
				});
			}
		};
	}, []);
	
	// Create pawn and knight models
	const createChessPieces = () => {
		if (!sceneRef.current) return;
		
		// Create pawn
		const pawnGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1, 16);
		const pawnMaterial = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 1,
			shininess: 100
		});
		
		const pawn = new THREE.Mesh(pawnGeometry, pawnMaterial);
		pawn.castShadow = true;
		pawn.receiveShadow = true;
		pawn.position.set(0, 0, 0);
		sceneRef.current.add(pawn);
		pawnRef.current = pawn;
		
		// Create knight (simplified model)
		const knightGeometry = new THREE.Group();
		
		// Knight base
		const baseGeometry = new THREE.CylinderGeometry(0.4, 0.5, 0.3, 16);
		const baseMesh = new THREE.Mesh(baseGeometry, pawnMaterial.clone());
		baseMesh.position.y = -0.35;
		knightGeometry.add(baseMesh);
		
		// Knight body
		const bodyGeometry = new THREE.SphereGeometry(0.35, 16, 16);
		const bodyMesh = new THREE.Mesh(bodyGeometry, pawnMaterial.clone());
		bodyMesh.position.y = 0.1;
		knightGeometry.add(bodyMesh);
		
		// Knight head
		const headGeometry = new THREE.ConeGeometry(0.25, 0.6, 16);
		const headMesh = new THREE.Mesh(headGeometry, pawnMaterial.clone());
		headMesh.position.y = 0.5;
		headMesh.position.x = 0.2;
		headMesh.rotation.z = -Math.PI / 6;
		knightGeometry.add(headMesh);
		
		// Create knight material
		const knightMaterial = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0,
			shininess: 100
		});
		
		// Apply material to all knight parts
		knightGeometry.traverse((object) => {
			if (object.isMesh) {
				object.material = knightMaterial;
				object.castShadow = true;
				object.receiveShadow = true;
			}
		});
		
		// Add knight group
		const knight = new THREE.Group();
		knight.add(knightGeometry);
		knight.position.set(0, 0, 0);
		sceneRef.current.add(knight);
		knightRef.current = knight;
	};
	
	// Create progress bar
	const createProgressBar = () => {
		if (!sceneRef.current) return;
		
		const progressGroup = new THREE.Group();
		
		// Background bar
		const bgGeometry = new THREE.BoxGeometry(2, 0.2, 0.05);
		const bgMaterial = new THREE.MeshBasicMaterial({
			color: 0x333333
		});
		const bgBar = new THREE.Mesh(bgGeometry, bgMaterial);
		
		// Progress fill
		const fillGeometry = new THREE.BoxGeometry(2, 0.2, 0.06);
		const fillMaterial = new THREE.MeshBasicMaterial({
			color: 0xF1C40F // Gold color
		});
		const fillBar = new THREE.Mesh(fillGeometry, fillMaterial);
		fillBar.position.z = 0.01;
		
		// Set initial scale
		const progressScale = moveCount / 8;
		fillBar.scale.x = progressScale;
		fillBar.position.x = -1 + progressScale;
		
		// Add to group
		progressGroup.add(bgBar);
		progressGroup.add(fillBar);
		
		// Position below pieces
		progressGroup.position.y = -1.5;
		
		// Add markers for 8 moves
		for (let i = 0; i <= 8; i++) {
			const markerGeometry = new THREE.BoxGeometry(0.03, 0.3, 0.07);
			const markerMaterial = new THREE.MeshBasicMaterial({
				color: i === 8 ? 0xE74C3C : 0xECF0F1
			});
			const marker = new THREE.Mesh(markerGeometry, markerMaterial);
			marker.position.x = -1 + (i / 4);
			marker.position.z = 0.02;
			progressGroup.add(marker);
			
			// Add text for important markers
			if (i === 0 || i === 4 || i === 8) {
				// In a production environment, we would use TextGeometry from THREE
				// Here we'll simulate it with a simple plane
				const labelGeometry = new THREE.PlaneGeometry(0.2, 0.2);
				const labelMaterial = new THREE.MeshBasicMaterial({
					color: 0xffffff,
					transparent: true,
					opacity: 0.8
				});
				const label = new THREE.Mesh(labelGeometry, labelMaterial);
				label.position.x = -1 + (i / 4);
				label.position.y = -0.3;
				label.position.z = 0.02;
				progressGroup.add(label);
			}
		}
		
		sceneRef.current.add(progressGroup);
		progressBarRef.current = progressGroup;
	};
	
	// Update progress bar
	const updateProgressBar = () => {
		if (!progressBarRef.current) return;
		
		const progressFill = progressBarRef.current.children[1];
		
		if (isPromoting) {
			// Animate to full during promotion
			const targetScale = 1;
			const currentScale = progressFill.scale.x;
			progressFill.scale.x = currentScale + (targetScale - currentScale) * 0.05;
			progressFill.position.x = -1 + progressFill.scale.x;
			
			// Change color during promotion
			progressFill.material.color.setHex(0x27AE60); // Green
		} else {
			// Normal progress display
			const targetScale = moveCount / 8;
			progressFill.scale.x = targetScale;
			progressFill.position.x = -1 + (targetScale);
		}
	};
	
	// Create and animate celebration particles
	const animateCelebration = () => {
		if (!sceneRef.current || !sceneRef.current.userData.celebrationStarted) {
			// Create celebration particles
			sceneRef.current.userData.celebrationStarted = true;
			sceneRef.current.userData.celebrationParticles = [];
			
			// Create particles
			for (let i = 0; i < 50; i++) {
				const geometry = new THREE.SphereGeometry(0.05, 8, 8);
				const material = new THREE.MeshBasicMaterial({
					color: getRandomCelebrationColor(),
					transparent: true
				});
				
				const particle = new THREE.Mesh(geometry, material);
				
				// Random starting position
				particle.position.set(
					(Math.random() - 0.5) * 0.5,
					(Math.random() - 0.5) * 0.5,
					(Math.random() - 0.5) * 0.5
				);
				
				// Random velocity
				particle.userData.velocity = new THREE.Vector3(
					(Math.random() - 0.5) * 0.05,
					(Math.random() - 0.5) * 0.05 + 0.02, // Slight upward bias
					(Math.random() - 0.5) * 0.05
				);
				
				// Random rotation
				particle.userData.rotation = new THREE.Vector3(
					Math.random() * 0.1,
					Math.random() * 0.1,
					Math.random() * 0.1
				);
				
				sceneRef.current.add(particle);
				sceneRef.current.userData.celebrationParticles.push(particle);
			}
		}
		
		// Animate existing particles
		const particles = sceneRef.current.userData.celebrationParticles || [];
		
		particles.forEach((particle, index) => {
			// Move particle
			particle.position.add(particle.userData.velocity);
			
			// Rotate particle
			particle.rotation.x += particle.userData.rotation.x;
			particle.rotation.y += particle.userData.rotation.y;
			particle.rotation.z += particle.userData.rotation.z;
			
			// Apply gravity
			particle.userData.velocity.y -= 0.001;
			
			// Fade out
			particle.material.opacity -= 0.005;
			
			// Remove when faded out
			if (particle.material.opacity <= 0) {
				sceneRef.current.remove(particle);
				sceneRef.current.userData.celebrationParticles.splice(index, 1);
				
				// Clean up
				particle.geometry.dispose();
				particle.material.dispose();
			}
		});
		
		// End celebration when all particles are gone
		if (particles.length === 0 && sceneRef.current.userData.celebrationStarted) {
			sceneRef.current.userData.celebrationStarted = false;
			setShowCelebration(false);
		}
	};
	
	// Get random color for celebration particles
	const getRandomCelebrationColor = () => {
		const colors = [
			0xF1C40F, // Gold
			0xE74C3C, // Red
			0x3498DB, // Blue
			0x2ECC71, // Green
			0x9B59B6  // Purple
		];
		
		return colors[Math.floor(Math.random() * colors.length)];
	};
	
	// Update move count from props
	useEffect(() => {
		if (progressBarRef.current) {
			const progressFill = progressBarRef.current.children[1];
			const targetScale = moveCount / 8;
			progressFill.scale.x = targetScale;
			progressFill.position.x = -1 + (targetScale);
		}
	}, [moveCount]);
	
	// Handle promotion trigger
	useEffect(() => {
		if (isPromoting) {
			setPromotionProgress(0);
		}
	}, [isPromoting]);
	
	return (
		<div className="pawn-promotion-visualizer">
			<div className="promotion-viewport" ref={containerRef} />
			<div className="promotion-info">
				<div className="move-counter">
					<span className="counter-label">Moves toward promotion:</span>
					<span className="counter-value">{moveCount}/8</span>
				</div>
				{isPromoting && (
					<div className="promotion-message">
						<span className="message-text">Promoting to Knight!</span>
						<div className="celebration-icon">♞</div>
					</div>
				)}
				{!isPromoting && moveCount === 8 && (
					<div className="promotion-ready">
						<span className="ready-text">Ready for promotion!</span>
					</div>
				)}
			</div>
		</div>
	);
};

PawnPromotionVisualizer.propTypes = {
	pawnId: PropTypes.string.isRequired,
	moveCount: PropTypes.number,
	isPromoting: PropTypes.bool,
	pawnPosition: PropTypes.shape({
		x: PropTypes.number,
		y: PropTypes.number
	}),
	onPromotionComplete: PropTypes.func
};

export default PawnPromotionVisualizer; 
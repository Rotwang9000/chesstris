import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import './RowClearingVisualizer.css';

/**
 * RowClearingVisualizer Component
 * 
 * Displays an animation when rows are cleared (8 cells in a line)
 */
const RowClearingVisualizer = ({
	cellPositions = [],
	direction = 'horizontal',
	isAnimating = false,
	onAnimationComplete
}) => {
	const containerRef = useRef(null);
	const rendererRef = useRef(null);
	const sceneRef = useRef(null);
	const cameraRef = useRef(null);
	const animationFrameRef = useRef(null);
	const cellRefs = useRef([]);
	
	// Animation state
	const [animationProgress, setAnimationProgress] = useState(0);
	
	// Initialize 3D scene
	useEffect(() => {
		if (!containerRef.current) return;
		
		// Create scene
		const scene = new THREE.Scene();
		sceneRef.current = scene;
		
		// Create camera
		const camera = new THREE.PerspectiveCamera(
			50,
			containerRef.current.clientWidth / containerRef.current.clientHeight,
			0.1,
			1000
		);
		
		// Position camera based on direction
		if (direction === 'horizontal') {
			camera.position.set(0, 5, 10);
		} else {
			camera.position.set(0, 10, 5);
		}
		
		camera.lookAt(0, 0, 0);
		cameraRef.current = camera;
		
		// Create renderer
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true
		});
		renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		renderer.setClearColor(0x000000, 0); // Transparent background
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
		
		// Create cells
		createCells();
		
		// Animation loop
		const animate = () => {
			if (isAnimating && animationProgress < 1) {
				// Update animation progress
				setAnimationProgress(prev => {
					const newProgress = prev + 0.01;
					if (newProgress >= 1 && onAnimationComplete) {
						// Notify parent component when animation completes
						onAnimationComplete();
					}
					return Math.min(newProgress, 1);
				});
				
				// Animate cells
				animateCells();
			}
			
			renderer.render(scene, camera);
			animationFrameRef.current = requestAnimationFrame(animate);
		};
		
		animate();
		
		// Handle resize
		const handleResize = () => {
			if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
			
			camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		};
		
		window.addEventListener('resize', handleResize);
		
		// Cleanup
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
	
	// Update when cell positions or direction changes
	useEffect(() => {
		if (!sceneRef.current) return;
		
		// Clear existing cells
		cellRefs.current.forEach(cell => {
			if (sceneRef.current && cell) {
				sceneRef.current.remove(cell);
				if (cell.geometry) cell.geometry.dispose();
				if (cell.material) {
					if (Array.isArray(cell.material)) {
						cell.material.forEach(material => material.dispose());
					} else {
						cell.material.dispose();
					}
				}
			}
		});
		
		cellRefs.current = [];
		
		// Create new cells
		createCells();
		
	}, [cellPositions, direction]);
	
	// Update when animation state changes
	useEffect(() => {
		if (isAnimating) {
			setAnimationProgress(0);
		}
	}, [isAnimating]);
	
	// Create 3D cells for visualization
	const createCells = () => {
		if (!sceneRef.current) return;
		
		// Cell geometry and material
		const geometry = new THREE.BoxGeometry(0.9, 0.1, 0.9);
		
		// Create cells
		cellPositions.forEach((pos, index) => {
			// Calculate position in 3D space
			let x, y, z;
			
			if (direction === 'horizontal') {
				x = pos.x - cellPositions.length / 2 + 0.5;
				z = 0;
			} else if (direction === 'vertical') {
				x = 0;
				z = pos.y - cellPositions.length / 2 + 0.5;
			} else { // diagonal
				x = pos.x - cellPositions.length / 2 + 0.5;
				z = pos.y - cellPositions.length / 2 + 0.5;
			}
			
			y = 0;
			
			// Create random color for each cell
			const hue = index / cellPositions.length;
			const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
			
			const material = new THREE.MeshPhongMaterial({
				color: color,
				transparent: true,
				opacity: 1,
				shininess: 50
			});
			
			const cell = new THREE.Mesh(geometry, material);
			cell.position.set(x, y, z);
			cell.castShadow = true;
			cell.receiveShadow = true;
			
			// Save original position for animation
			cell.userData.originalPosition = {
				x: cell.position.x,
				y: cell.position.y,
				z: cell.position.z
			};
			
			// Add to scene
			sceneRef.current.add(cell);
			cellRefs.current.push(cell);
		});
		
		// Add highlight line
		addHighlightLine();
	};
	
	// Add a line to highlight the clearing row/column
	const addHighlightLine = () => {
		if (!sceneRef.current || cellPositions.length === 0) return;
		
		// Line geometry
		const lineGeometry = new THREE.BufferGeometry();
		const start = new THREE.Vector3();
		const end = new THREE.Vector3();
		
		if (direction === 'horizontal') {
			start.set(-5, 0.05, 0);
			end.set(5, 0.05, 0);
		} else if (direction === 'vertical') {
			start.set(0, 0.05, -5);
			end.set(0, 0.05, 5);
		} else { // diagonal
			start.set(-5, 0.05, -5);
			end.set(5, 0.05, 5);
		}
		
		const points = [start, end];
		lineGeometry.setFromPoints(points);
		
		const lineMaterial = new THREE.LineBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.5,
			linewidth: 2
		});
		
		const line = new THREE.Line(lineGeometry, lineMaterial);
		sceneRef.current.add(line);
		
		// Add to references
		cellRefs.current.push(line);
	};
	
	// Animate cells during clearing
	const animateCells = () => {
		if (!cellRefs.current.length) return;
		
		cellRefs.current.forEach((cell, index) => {
			if (!cell || !cell.material) return;
			
			// Skip the highlight line
			if (cell instanceof THREE.Line) {
				cell.material.opacity = (1 - animationProgress) * 0.5;
				return;
			}
			
			// Different animation timing for each cell
			const cellProgress = Math.min(
				1,
				(animationProgress - index * 0.05) * 1.5
			);
			
			if (cellProgress <= 0) return;
			
			// Scale effect
			const scale = 1 + cellProgress * 0.5;
			cell.scale.set(scale, scale, scale);
			
			// Fade out
			cell.material.opacity = 1 - cellProgress;
			
			// Change color to white
			const originalColor = new THREE.Color().setHSL(index / cellPositions.length, 0.8, 0.5);
			const whiteColor = new THREE.Color(0xffffff);
			cell.material.color.copy(originalColor).lerp(whiteColor, cellProgress);
			
			// Spin and float upward
			cell.rotation.y += 0.1;
			cell.rotation.x += 0.05;
			
			// Move upward
			if (cell.userData.originalPosition) {
				cell.position.y = cell.userData.originalPosition.y + cellProgress * 3;
			}
			
			// Particle effects for higher progress
			if (cellProgress > 0.5 && !cell.userData.particlesAdded) {
				addCellParticles(cell);
				cell.userData.particlesAdded = true;
			}
		});
	};
	
	// Add particles to cells during animation
	const addCellParticles = (cell) => {
		if (!sceneRef.current) return;
		
		// Create particle group
		const particleGroup = new THREE.Group();
		
		// Create particles
		for (let i = 0; i < 8; i++) {
			const particleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
			const particleMaterial = new THREE.MeshBasicMaterial({
				color: cell.material.color.clone(),
				transparent: true,
				opacity: 0.8
			});
			
			const particle = new THREE.Mesh(particleGeometry, particleMaterial);
			
			// Random position
			particle.position.set(
				(Math.random() - 0.5) * 0.8,
				(Math.random() - 0.5) * 0.8,
				(Math.random() - 0.5) * 0.8
			);
			
			// Random velocity
			particle.userData.velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 0.1,
				Math.random() * 0.1 + 0.05,
				(Math.random() - 0.5) * 0.1
			);
			
			particleGroup.add(particle);
		}
		
		// Position particle group at cell position
		particleGroup.position.copy(cell.position);
		
		// Add to scene
		sceneRef.current.add(particleGroup);
		cellRefs.current.push(particleGroup);
		
		// Store reference
		cell.userData.particles = particleGroup;
	};
	
	// Animation frame for particles
	useEffect(() => {
		if (!isAnimating || !cellRefs.current.length) return;
		
		// Animate particles
		const particleAnimation = () => {
			cellRefs.current.forEach(obj => {
				if (obj instanceof THREE.Group) {
					// It's a particle group
					obj.children.forEach(particle => {
						if (particle.userData.velocity) {
							// Move based on velocity
							particle.position.add(particle.userData.velocity);
							
							// Apply gravity
							particle.userData.velocity.y -= 0.002;
							
							// Fade out
							if (particle.material) {
								particle.material.opacity -= 0.01;
							}
						}
					});
				}
			});
			
			// Clean up completely faded particles
			const toRemove = [];
			cellRefs.current.forEach(obj => {
				if (obj instanceof THREE.Group) {
					const allFaded = obj.children.every(
						particle => particle.material && particle.material.opacity <= 0
					);
					
					if (allFaded) {
						toRemove.push(obj);
					}
				}
			});
			
			// Remove faded particle groups
			toRemove.forEach(group => {
				if (sceneRef.current) {
					sceneRef.current.remove(group);
					
					// Dispose geometries and materials
					group.children.forEach(particle => {
						if (particle.geometry) particle.geometry.dispose();
						if (particle.material) particle.material.dispose();
					});
					
					// Remove from refs
					const index = cellRefs.current.indexOf(group);
					if (index > -1) {
						cellRefs.current.splice(index, 1);
					}
				}
			});
		};
		
		const particleAnimationFrame = requestAnimationFrame(particleAnimation);
		
		return () => {
			cancelAnimationFrame(particleAnimationFrame);
		};
	}, [isAnimating, animationProgress]);
	
	return (
		<div 
			className={`row-clearing-visualizer ${isAnimating ? 'animating' : ''} ${direction}`}
			ref={containerRef}
		>
			<div className="clearing-info">
				<div className="clearing-count">
					<span className="count-value">{cellPositions.length} cells</span>
					<span className="count-label">cleared</span>
				</div>
			</div>
		</div>
	);
};

RowClearingVisualizer.propTypes = {
	cellPositions: PropTypes.arrayOf(
		PropTypes.shape({
			x: PropTypes.number.isRequired,
			y: PropTypes.number.isRequired
		})
	),
	direction: PropTypes.oneOf(['horizontal', 'vertical', 'diagonal']),
	isAnimating: PropTypes.bool,
	onAnimationComplete: PropTypes.func
};

export default RowClearingVisualizer; 
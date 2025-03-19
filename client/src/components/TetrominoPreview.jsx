import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import './TetrominoPreview.css';

/**
 * TetrominoPreview Component
 * 
 * Displays a preview of the next tetromino using Three.js
 */
const TetrominoPreview = ({ tetromino, size = 150 }) => {
	const canvasRef = useRef(null);
	const sceneRef = useRef(null);
	const cameraRef = useRef(null);
	const rendererRef = useRef(null);
	const tetrominoRef = useRef(null);
	const animationFrameRef = useRef(null);
	const [isReady, setIsReady] = useState(false);

	// Initialize Three.js scene
	useEffect(() => {
		if (!canvasRef.current) return;

		// Create scene
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x121212);
		sceneRef.current = scene;

		// Create camera
		const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
		camera.position.set(0, 5, 5);
		camera.lookAt(0, 0, 0);
		cameraRef.current = camera;

		// Create renderer
		const renderer = new THREE.WebGLRenderer({ 
			canvas: canvasRef.current,
			antialias: true 
		});
		renderer.setSize(size, size);
		renderer.setPixelRatio(window.devicePixelRatio);
		rendererRef.current = renderer;

		// Add ambient light
		const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
		scene.add(ambientLight);

		// Add directional light
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(5, 10, 7);
		scene.add(directionalLight);

		setIsReady(true);

		// Cleanup on unmount
		return () => {
			cancelAnimationFrame(animationFrameRef.current);
			scene.clear();
			renderer.dispose();
		};
	}, [size]);

	// Handle tetromino changes
	useEffect(() => {
		if (!isReady || !tetromino) return;

		// Remove previous tetromino
		if (tetrominoRef.current) {
			sceneRef.current.remove(tetrominoRef.current);
		}

		// Create new tetromino group
		const tetrominoGroup = createTetrominoMesh(tetromino);
		sceneRef.current.add(tetrominoGroup);
		tetrominoRef.current = tetrominoGroup;

		// Start render loop
		const animate = () => {
			if (tetrominoGroup) {
				tetrominoGroup.rotation.y += 0.01;
			}
			rendererRef.current.render(sceneRef.current, cameraRef.current);
			animationFrameRef.current = requestAnimationFrame(animate);
		};
		animate();
	}, [tetromino, isReady]);

	/**
	 * Create a Three.js mesh for a tetromino
	 * @param {Object} tetromino - The tetromino data
	 * @returns {THREE.Group} - The tetromino mesh group
	 */
	const createTetrominoMesh = (tetromino) => {
		const group = new THREE.Group();
		const { shape, color } = tetromino;
		
		// Get dimensions
		const height = shape.length;
		const width = shape[0].length;
		
		// Create blocks for each cell in shape
		for (let z = 0; z < height; z++) {
			for (let x = 0; x < width; x++) {
				if (shape[z][x]) {
					// Adjust position to center the tetromino
					const posX = x - Math.floor(width / 2) + 0.5;
					const posZ = z - Math.floor(height / 2) + 0.5;
					
					// Create block with slight transparency
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					const material = new THREE.MeshPhongMaterial({
						color: new THREE.Color(color),
						shininess: 50,
						transparent: true,
						opacity: 0.9
					});
					
					const cube = new THREE.Mesh(geometry, material);
					cube.position.set(posX, 0, posZ);
					
					// Add wireframe for better visibility
					const wireframe = new THREE.LineSegments(
						new THREE.WireframeGeometry(geometry),
						new THREE.LineBasicMaterial({ 
							color: 0xffffff, 
							transparent: true, 
							opacity: 0.3 
						})
					);
					cube.add(wireframe);
					
					group.add(cube);
				}
			}
		}
		
		return group;
	};

	return (
		<div className="tetromino-preview">
			<h3 className="preview-title">Next Tetromino</h3>
			<div className="preview-container">
				<canvas 
					ref={canvasRef} 
					width={size} 
					height={size} 
					className="preview-canvas"
				/>
			</div>
		</div>
	);
};

TetrominoPreview.propTypes = {
	/** The tetromino to preview */
	tetromino: PropTypes.shape({
		shape: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
		color: PropTypes.string.isRequired,
		type: PropTypes.string
	}),
	/** Size of the preview canvas in pixels */
	size: PropTypes.number
};

export default TetrominoPreview; 
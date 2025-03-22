import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import gameService from '../services/GameService';
import './TetrominoSystem.css';

/**
 * TetrominoSystem Component
 * 
 * Responsible for visualizing tetromino Z-axis behavior using Three.js.
 */
const TetrominoSystem = ({ 
	gameState,
	activeTetromino,
	boardCells,
	playerKingPosition,
	onPlaceTetromino,
	gameStarted = false
}) => {
	const containerRef = useRef(null);
	const sceneRef = useRef(null);
	const cameraRef = useRef(null);
	const rendererRef = useRef(null);
	const controlsRef = useRef(null);
	const tetrominoRef = useRef(null);
	const ghostRef = useRef(null);
	const boardRef = useRef(null);
	const animationFrameRef = useRef(null);
	const placementStartTimeRef = useRef(null);
	
	// Animation state
	const [zPosition, setZPosition] = useState(10); // Start position on Z axis
	const [isExploding, setIsExploding] = useState(false);
	const [isPlacing, setIsPlacing] = useState(false);
	const [isFalling, setIsFalling] = useState(false);
	
	// Position state
	const [position, setPosition] = useState({ x: 0, y: 0, rotation: 0 });
	const [validPlacement, setValidPlacement] = useState(false);
	
	// Initialize Three.js scene
	useEffect(() => {
		if (!containerRef.current) return;
		
		// Create scene
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEEB); // Sky blue
		sceneRef.current = scene;
		
		// Create camera
		const camera = new THREE.PerspectiveCamera(
			60,
			containerRef.current.clientWidth / containerRef.current.clientHeight,
			0.1,
			1000
		);
		camera.position.set(0, -15, 20);
		camera.lookAt(0, 0, 0);
		cameraRef.current = camera;
		
		// Create renderer
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		renderer.shadowMap.enabled = true;
		containerRef.current.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		
		// Create lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		scene.add(ambientLight);
		
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(10, -10, 20);
		directionalLight.castShadow = true;
		scene.add(directionalLight);
		
		// Create orbit controls
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.25;
		controlsRef.current = controls;
		
		// Create board base
		createGameBoard();
		
		// Handle resize
		const handleResize = () => {
			if (!containerRef.current) return;
			
			camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
		};
		
		window.addEventListener('resize', handleResize);
		
		// Animation loop
		const animate = () => {
			if (controlsRef.current) {
				controlsRef.current.update();
			}
			
			// Animate tetromino falling
			if (tetrominoRef.current && !isPlacing && !isExploding) {
				if (zPosition > 0) {
					setZPosition(prev => Math.max(prev - 0.1, 0));
					tetrominoRef.current.position.z = zPosition;
					
					// Check for Z=1 position (explosion zone)
					if (zPosition <= 1 && zPosition > 0 && hasCellUnderneath()) {
						setIsExploding(true);
					}
					
					// Check for Z=0 position (attachment zone)
					if (zPosition === 0) {
						if (hasAdjacentCell() && hasPathToKing()) {
							setIsPlacing(true);
						} else {
							setIsFalling(true);
						}
					}
				} else if (isFalling) {
					// Continue falling and fading if no valid connection
					setZPosition(prev => prev - 0.1);
					tetrominoRef.current.position.z = zPosition;
					
					// Fade out the tetromino
					tetrominoRef.current.children.forEach(child => {
						if (child.material) {
							child.material.opacity = Math.max(0, child.material.opacity - 0.05);
						}
					});
					
					// Remove when fully transparent
					if (tetrominoRef.current.children[0]?.material?.opacity <= 0) {
						sceneRef.current.remove(tetrominoRef.current);
						tetrominoRef.current = null;
						// Reset for next tetromino
						setZPosition(10);
						setIsFalling(false);
					}
				}
			}
			
			// Animate explosion effect
			if (isExploding && tetrominoRef.current) {
				animateExplosion();
			}
			
			// Animate placement effect
			if (isPlacing && tetrominoRef.current) {
				animatePlacement();
			}
			
			rendererRef.current.render(sceneRef.current, cameraRef.current);
			animationFrameRef.current = requestAnimationFrame(animate);
		};
		
		animate();
		
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
	
	// Update tetromino when active tetromino changes
	useEffect(() => {
		if (!sceneRef.current || !activeTetromino) return;
		
		// Remove old tetromino if it exists
		if (tetrominoRef.current) {
			sceneRef.current.remove(tetrominoRef.current);
		}
		
		// Create new tetromino
		const tetromino = createTetrominoMesh(activeTetromino);
		tetromino.position.set(position.x, position.y, zPosition);
		tetromino.rotation.z = position.rotation * Math.PI / 2;
		sceneRef.current.add(tetromino);
		tetrominoRef.current = tetromino;
		
		// Reset state
		setIsExploding(false);
		setIsPlacing(false);
		setIsFalling(false);
		
		// Reset ghost tetromino
		updateGhostTetromino();
	}, [activeTetromino]);
	
	// Update board when cells change
	useEffect(() => {
		if (!sceneRef.current || !boardCells) return;
		
		updateGameBoard();
		updateValidPlacement();
	}, [boardCells]);
	
	// Update position and ghost
	useEffect(() => {
		if (!tetrominoRef.current) return;
		
		tetrominoRef.current.position.x = position.x;
		tetrominoRef.current.position.y = position.y;
		tetrominoRef.current.rotation.z = position.rotation * Math.PI / 2;
		
		updateGhostTetromino();
		updateValidPlacement();
	}, [position]);
	
	// Create tetromino mesh
	const createTetrominoMesh = (tetromino) => {
		const { shape, color } = tetromino;
		const group = new THREE.Group();
		
		// Create blocks for each cell in the shape
		shape.forEach((row, rowIndex) => {
			row.forEach((cell, cellIndex) => {
				if (cell) {
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					const material = new THREE.MeshPhongMaterial({
						color: new THREE.Color(color),
						transparent: true,
						opacity: 0.9,
						shininess: 30
					});
					
					const block = new THREE.Mesh(geometry, material);
					block.position.set(
						cellIndex - Math.floor(row.length / 2) + 0.5,
						-rowIndex + Math.floor(shape.length / 2) - 0.5,
						0
					);
					
					block.castShadow = true;
					block.receiveShadow = true;
					
					group.add(block);
				}
			});
		});
		
		return group;
	};
	
	// Create ghost tetromino for placement preview
	const updateGhostTetromino = () => {
		if (!sceneRef.current || !tetrominoRef.current || !activeTetromino) return;
		
		// Remove old ghost if it exists
		if (ghostRef.current) {
			sceneRef.current.remove(ghostRef.current);
			ghostRef.current = null;
		}
		
		// Create new ghost at Z=0
		const ghost = createTetrominoMesh(activeTetromino);
		ghost.position.set(position.x, position.y, 0);
		ghost.rotation.z = position.rotation * Math.PI / 2;
		
		// Make ghost transparent
		ghost.traverse((object) => {
			if (object.isMesh) {
				object.material = object.material.clone();
				object.material.opacity = 0.3;
				object.material.color.set(validPlacement ? 0x00ff00 : 0xff0000);
			}
		});
		
		sceneRef.current.add(ghost);
		ghostRef.current = ghost;
	};
	
	// Create game board with existing cells
	const createGameBoard = () => {
		if (!sceneRef.current) return;
		
		// Remove old board if it exists
		if (boardRef.current) {
			sceneRef.current.remove(boardRef.current);
		}
		
		const board = new THREE.Group();
		
		// Create base platform
		const baseGeometry = new THREE.BoxGeometry(30, 30, 0.5);
		const baseMaterial = new THREE.MeshPhongMaterial({
			color: 0x888888,
			transparent: true,
			opacity: 0.3
		});
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.set(0, 0, -0.25);
		base.receiveShadow = true;
		board.add(base);
		
		// Create grid lines
		const gridHelper = new THREE.GridHelper(30, 30, 0x000000, 0x444444);
		gridHelper.rotation.x = Math.PI / 2;
		gridHelper.position.z = 0.01;
		board.add(gridHelper);
		
		sceneRef.current.add(board);
		boardRef.current = board;
		
		// Update with cell data
		updateGameBoard();
	};
	
	// Update game board with current cell data
	const updateGameBoard = () => {
		if (!boardRef.current || !boardCells) return;
		
		// Remove existing cell blocks
		boardRef.current.children = boardRef.current.children.filter(
			child => !child.userData.isCell
		);
		
		// Add current cells
		boardCells.forEach(cell => {
			const { x, y, playerId, isHomeZone } = cell;
			
			const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
			const material = new THREE.MeshPhongMaterial({
				color: getPlayerColor(playerId),
				transparent: true,
				opacity: isHomeZone ? 0.8 : 0.9,
				shininess: 30
			});
			
			const block = new THREE.Mesh(geometry, material);
			block.position.set(x, y, 0);
			block.userData.isCell = true;
			block.userData.playerId = playerId;
			block.userData.isHomeZone = isHomeZone;
			
			block.castShadow = true;
			block.receiveShadow = true;
			
			// Add border effect for home zones
			if (isHomeZone) {
				const borderGeometry = new THREE.BoxGeometry(1, 1, 1);
				const borderMaterial = new THREE.MeshBasicMaterial({
					color: 0xffffff,
					wireframe: true
				});
				const border = new THREE.Mesh(borderGeometry, borderMaterial);
				block.add(border);
			}
			
			boardRef.current.add(block);
		});
	};
	
	// Check if tetromino has a cell underneath at Z=1
	const hasCellUnderneath = () => {
		if (!tetrominoRef.current || !boardCells) return false;
		
		// Get tetromino blocks positions
		const blocks = [];
		tetrominoRef.current.children.forEach(block => {
			const worldPosition = new THREE.Vector3();
			block.getWorldPosition(worldPosition);
			blocks.push({
				x: Math.round(worldPosition.x),
				y: Math.round(worldPosition.y)
			});
		});
		
		// Check if any block is above an existing cell
		return blocks.some(block => 
			boardCells.some(cell => 
				cell.x === block.x && cell.y === block.y
			)
		);
	};
	
	// Check if tetromino has an adjacent cell at Z=0
	const hasAdjacentCell = () => {
		if (!tetrominoRef.current || !boardCells) return false;
		
		// Get tetromino blocks positions
		const blocks = [];
		tetrominoRef.current.children.forEach(block => {
			const worldPosition = new THREE.Vector3();
			block.getWorldPosition(worldPosition);
			blocks.push({
				x: Math.round(worldPosition.x),
				y: Math.round(worldPosition.y)
			});
		});
		
		// Check if any block is adjacent to an existing cell
		return blocks.some(block => 
			boardCells.some(cell => 
				(Math.abs(cell.x - block.x) === 1 && cell.y === block.y) ||
				(Math.abs(cell.y - block.y) === 1 && cell.x === block.x)
			)
		);
	};
	
	// Check if adjacent cells have a path to king
	const hasPathToKing = () => {
		// Simplified implementation - in practice, this would check
		// if the adjacent cells have a path to the player's king
		return true;
	};
	
	// Animate explosion effect
	const animateExplosion = () => {
		if (!tetrominoRef.current) return;
		
		// Create explosion particles
		if (!tetrominoRef.current.userData.explosionStarted) {
			tetrominoRef.current.userData.explosionStarted = true;
			tetrominoRef.current.userData.explosionProgress = 0;
			
			// Create particles
			tetrominoRef.current.children.forEach(block => {
				// Flash effect
				block.material.emissive = new THREE.Color(0xffff00);
				block.material.emissiveIntensity = 1;
			});
		}
		
		// Update explosion animation
		tetrominoRef.current.userData.explosionProgress += 0.05;
		const progress = tetrominoRef.current.userData.explosionProgress;
		
		if (progress < 1) {
			// Scale and rotate blocks outward
			tetrominoRef.current.children.forEach(block => {
				block.position.multiplyScalar(1.05);
				block.material.opacity = 1 - progress;
				block.rotation.x += 0.1;
				block.rotation.y += 0.1;
			});
		} else {
			// Remove tetromino after explosion
			sceneRef.current.remove(tetrominoRef.current);
			tetrominoRef.current = null;
			setIsExploding(false);
			
			// Reset for next tetromino
			setZPosition(10);
		}
	};
	
	/**
	 * Animate the tetromino placement
	 */
	const animatePlacement = () => {
		if (!tetrominoRef.current || !sceneRef.current) return;
		
		// Animate the tetromino locking into place
		const scale = 1 + Math.sin(Date.now() * 0.01) * 0.05;
		tetrominoRef.current.scale.set(scale, scale, scale);
		
		// Light up the tetromino
		tetrominoRef.current.children.forEach(child => {
			if (child.material) {
				child.material.emissive = new THREE.Color(0x333333);
				child.material.emissiveIntensity = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
			}
		});
		
		// Complete placement after animation
		if (Date.now() - placementStartTimeRef.current > 500) {
			// Finalize the placement
			const finalPosition = {
				x: Math.round(position.x),
				y: 0, // Y-axis in the game is the height/depth
				z: Math.round(position.y)
			};
			
			// Check that activeTetromino exists and has required properties
			if (!activeTetromino) {
				console.error('Cannot place tetromino: activeTetromino is null or undefined');
				setIsPlacing(false);
				return;
			}
			
			if (!activeTetromino.type) {
				console.error('Cannot place tetromino: missing type property', activeTetromino);
				setIsPlacing(false);
				return;
			}
			
			console.log('Preparing tetromino placement at position:', finalPosition);
			console.log('Tetromino data:', activeTetromino);
			
			// Prepare data for the server - ensure pieceType is included
			const placementData = {
				pieceType: activeTetromino.type, // This must be sent as "pieceType", not "type"
				position: {
					x: finalPosition.x,
					y: finalPosition.y,
					z: finalPosition.z
				},
				rotation: position.rotation
			};
			
			console.log('Sending placement data to server:', placementData);
			
			// Send to server for validation and processing
			gameService.placeTetromino(placementData)
				.then(response => {
					// Handle successful placement
					console.log('SERVER CONFIRMED placement success:', response);
					
					// Keep the animation going until we get server confirmation
					// Now remove the tetromino from the scene as server accepted it
					if (tetrominoRef.current) {
						sceneRef.current.remove(tetrominoRef.current);
						tetrominoRef.current = null;
					}
					
					// Remove ghost tetromino
					if (ghostRef.current) {
						sceneRef.current.remove(ghostRef.current);
						ghostRef.current = null;
					}
					
					// Reset states for next tetromino
					setIsPlacing(false);
					setZPosition(10);
					
					// Notify parent component about the placement AFTER server confirms
					if (onPlaceTetromino) {
						onPlaceTetromino(finalPosition, activeTetromino);
					}
				})
				.catch(error => {
					console.error('SERVER REJECTED placement:', error);
					
					// Flash the tetromino red to indicate rejection
					if (tetrominoRef.current) {
						tetrominoRef.current.children.forEach(child => {
							if (child.material) {
								// Save original color to restore later
								const originalColor = child.material.color.clone();
								child.material.color.set(0xff0000); // Red flash
								
								// Restore original color after a moment
								setTimeout(() => {
									if (child.material) {
										child.material.color.copy(originalColor);
									}
								}, 300);
							}
						});
					}
					
					// Handle server rejection - stop placing and make it fall instead
					setIsPlacing(false);
					setIsFalling(true);
					
					// Display error message if provided
					if (error.message) {
						// You could show this to the user in a UI element
						console.error(`Placement rejected by server: ${error.message}`);
					}
				});
		}
	};
	
	// Update valid placement status
	const updateValidPlacement = () => {
		const isValid = hasAdjacentCell() && hasPathToKing();
		setValidPlacement(isValid);
		
		// Update ghost color
		if (ghostRef.current) {
			ghostRef.current.traverse((object) => {
				if (object.isMesh) {
					object.material.color.set(isValid ? 0x00ff00 : 0xff0000);
				}
			});
		}
	};
	
	// Get color for player
	const getPlayerColor = (playerId) => {
		// In a real implementation, this would use a consistent color per player
		const colors = {
			'player1': 0xff0000, // Red
			'player2': 0x0000ff, // Blue
			'player3': 0x00ff00, // Green
			'player4': 0xffff00, // Yellow
			'default': 0x888888  // Gray
		};
		
		return colors[playerId] || colors.default;
	};
	
	/**
	 * Validate if the tetromino position is valid
	 * @param {Object} newPosition - The new position to validate
	 * @returns {boolean} True if the position is valid
	 */
	const validatePosition = (newPosition) => {
		if (!activeTetromino || !boardCells) return false;
		
		// Get tetromino shape with rotation applied
		const rotatedShape = getRotatedShape(activeTetromino.shape, newPosition.rotation);
		
		// Check board boundaries
		for (let y = 0; y < rotatedShape.length; y++) {
			for (let x = 0; x < rotatedShape[y].length; x++) {
				if (rotatedShape[y][x]) {
					const worldX = newPosition.x + x - Math.floor(rotatedShape[y].length / 2);
					const worldY = newPosition.y - y + Math.floor(rotatedShape.length / 2);
					
					// Check board boundaries (simplified - would need actual board dimensions)
					if (worldX < -15 || worldX > 15 || worldY < -15 || worldY > 15) {
						return false;
					}
				}
			}
		}
		
		return true;
	};
	
	/**
	 * Get a rotated shape based on rotation index
	 * @param {Array} shape - Original shape
	 * @param {number} rotation - Rotation index (0-3)
	 * @returns {Array} Rotated shape
	 */
	const getRotatedShape = (shape, rotation) => {
		if (!shape || rotation === 0) return shape;
		
		let rotatedShape = [...shape];
		
		// Apply rotation 1-3 times based on rotation index
		for (let r = 0; r < rotation; r++) {
			const rows = rotatedShape.length;
			const cols = rotatedShape[0].length;
			const newShape = Array(cols).fill().map(() => Array(rows).fill(0));
			
			// Rotate 90 degrees clockwise
			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					newShape[x][rows - 1 - y] = rotatedShape[y][x];
				}
			}
			
			rotatedShape = newShape;
		}
		
		return rotatedShape;
	};
	
	// Update component to respect gameStarted state
	useEffect(() => {
		// Only initialize animation if game has started
		if (!gameStarted || !tetrominoRef.current) return;
		
		// If game has started and we have a tetromino, initialize its fall
		if (tetrominoRef.current && !isPlacing && !isExploding && !isFalling) {
			// Start tetromino falling from the top
			setZPosition(10);
		}
	}, [gameStarted, tetrominoRef.current, isPlacing, isExploding, isFalling]);
	
	// Handle keyboard input for tetromino movement
	useEffect(() => {
		// Don't process keyboard input if game hasn't started or no active tetromino
		if (!activeTetromino || !gameStarted) return;
		
		const handleKeyDown = (event) => {
			// Skip if currently placing or exploding
			if (isPlacing || isExploding) return;
			
			let newPosition = { ...position };
			
			switch (event.key) {
				case 'ArrowLeft':
					newPosition.x -= 1;
					break;
				case 'ArrowRight':
					newPosition.x += 1;
					break;
				case 'ArrowUp':
					newPosition.y -= 1;
					break;
				case 'ArrowDown':
					newPosition.y += 1;
					break;
				case 'r':
				case 'R':
					// Rotate the tetromino
					newPosition.rotation = (newPosition.rotation + 1) % 4;
					break;
				case ' ':
					// Space bar to place the tetromino immediately
					if (validPlacement) {
						setIsPlacing(true);
						setZPosition(0);
						placementStartTimeRef.current = Date.now();
						return;
					}
					break;
				default:
					return;
			}
			
			// Client-side validation - for immediate feedback only
			// The server will make the final decision
			const isValid = validatePosition(newPosition);
			
			if (isValid) {
				setPosition(newPosition);
				updateGhostTetromino(newPosition);
				updateValidPlacement();
			}
		};
		
		window.addEventListener('keydown', handleKeyDown);
		
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [activeTetromino, position, isPlacing, isExploding, validPlacement, gameStarted]);
	
	return (
		<div className="tetromino-system">
			<div className="tetromino-viewport" ref={containerRef} />
			
			{!gameStarted && (
				<div className="tetromino-waiting-message">
					Click "Start Playing" to begin the game
				</div>
			)}
			
			{gameStarted && (
				<div className="tetromino-controls">
					<div className="control-group">
						<button
							onClick={() => setPosition(prev => ({ ...prev, x: prev.x - 1 }))}
							className="control-button"
							disabled={!gameStarted || isPlacing || isExploding}
						>
							Left
						</button>
						<button
							onClick={() => setPosition(prev => ({ ...prev, x: prev.x + 1 }))}
							className="control-button"
							disabled={!gameStarted || isPlacing || isExploding}
						>
							Right
						</button>
					</div>
					<div className="control-group">
						<button
							onClick={() => setPosition(prev => ({ ...prev, y: prev.y + 1 }))}
							className="control-button"
							disabled={!gameStarted || isPlacing || isExploding}
						>
							Up
						</button>
						<button
							onClick={() => setPosition(prev => ({ ...prev, y: prev.y - 1 }))}
							className="control-button"
							disabled={!gameStarted || isPlacing || isExploding}
						>
							Down
						</button>
					</div>
					<div className="control-group">
						<button
							onClick={() => setPosition(prev => ({ ...prev, rotation: (prev.rotation + 1) % 4 }))}
							className="control-button"
							disabled={!gameStarted || isPlacing || isExploding}
						>
							Rotate
						</button>
						<button
							onClick={() => {
								if (validPlacement && gameStarted) {
									setZPosition(0);
									setIsPlacing(true);
									placementStartTimeRef.current = Date.now();
								}
							}}
							className={`control-button ${validPlacement ? 'valid' : 'invalid'}`}
							disabled={!validPlacement || !gameStarted || isPlacing || isExploding}
						>
							Place
						</button>
					</div>
				</div>
			)}
			
			{gameStarted && (
				<div className="placement-status">
					<div className={`status-indicator ${validPlacement ? 'valid' : 'invalid'}`}>
						{validPlacement ? 'Valid Placement' : 'Invalid Placement'}
					</div>
					<div className="status-details">
						{zPosition > 1 && 'Tetromino falling...'}
						{zPosition <= 1 && zPosition > 0 && hasCellUnderneath() && 'Warning: Cell underneath - will explode!'}
						{zPosition === 0 && hasAdjacentCell() && !hasPathToKing() && 'No path to king!'}
						{zPosition === 0 && !hasAdjacentCell() && 'No adjacent cells!'}
					</div>
				</div>
			)}
		</div>
	);
};

TetrominoSystem.propTypes = {
	gameState: PropTypes.object,
	activeTetromino: PropTypes.shape({
		shape: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
		color: PropTypes.string.isRequired,
		type: PropTypes.string
	}),
	boardCells: PropTypes.arrayOf(
		PropTypes.shape({
			x: PropTypes.number.isRequired,
			y: PropTypes.number.isRequired,
			playerId: PropTypes.string.isRequired,
			isHomeZone: PropTypes.bool
		})
	),
	playerKingPosition: PropTypes.shape({
		x: PropTypes.number.isRequired,
		y: PropTypes.number.isRequired
	}),
	onPlaceTetromino: PropTypes.func.isRequired,
	gameStarted: PropTypes.bool
};

TetrominoSystem.defaultProps = {
	boardCells: [],
	activeTetromino: {
		shape: [
			[1, 1, 1, 1], // I tetromino
			[0, 0, 0, 0]
		],
		color: '#00FFFF', // Cyan
		type: 'I'
	}
};

export default TetrominoSystem; 
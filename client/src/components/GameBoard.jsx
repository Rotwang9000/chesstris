import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import BoardCell from './BoardCell';
import ChessPiece from './ChessPiece';
import './GameBoard.css';

// Define constants for board settings
const BOARD_SETTINGS = {
	HOME_ZONE_WIDTH: 8,
	HOME_ZONE_HEIGHT: 2
};

/**
 * GameBoard Component
 * 
 * Displays the 3D game board with cells and chess pieces
 */
const GameBoard = ({
	board = {},
	pieces = [],
	homeZones = {},
	selectedPiece = null,
	validMoves = [],
	activePieceId = null,
	activePlayers = [],
	pausedPlayers = [],
	onCellClick,
	onPieceClick,
	onPieceMove,
	spectatingPlayerId = null,
	playerId = null,
	onCameraAnimationComplete
}, ref) => {
	const containerRef = useRef(null);
	const sceneRef = useRef(null);
	const cameraRef = useRef(null);
	const rendererRef = useRef(null);
	const controlsRef = useRef(null);
	const boardGroupRef = useRef(null);
	const animationFrameRef = useRef(null);
	
	// State for board visualization
	const [viewportDimensions, setViewportDimensions] = useState({ width: 0, height: 0 });
	const [isSpectating, setIsSpectating] = useState(false);
	const [hoveredCell, setHoveredCell] = useState(null);
	const [isDragging, setIsDragging] = useState(false);
	
	// Calculate board dimensions based on the board object
	const boardWidth = board && board[0] ? board[0].length : 16;
	const boardHeight = board ? board.length : 16;
	
	// Initialize the 3D scene
	useEffect(() => {
		if (!containerRef.current) return;
		
		// Get viewport dimensions
		const width = containerRef.current.clientWidth;
		const height = containerRef.current.clientHeight;
		setViewportDimensions({ width, height });
		
		// Create scene
		const scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEEB); // Sky blue background
		sceneRef.current = scene;
		
		// Create camera
		const camera = new THREE.PerspectiveCamera(
			50, // Field of view
			width / height,
			0.1, // Near clipping plane
			1000 // Far clipping plane
		);
		
		// Position camera based on playerId to focus on their pieces
		if (playerId) {
			// Get player number from playerId if possible
			const playerNumber = parseInt(playerId.toString().slice(-1)) || 1;
			
			if (playerNumber % 2 === 0) {
				// For even player numbers (like player 2, 4, etc)
				camera.position.set(8, 15, -12); // Focus on top area
			} else {
				// For odd player numbers (like player 1, 3, etc)
				camera.position.set(8, 15, 24); // Focus on bottom area
			}
		} else {
			// Default camera position (center view)
			camera.position.set(8, 15, 6);
		}
		
		camera.lookAt(8, 0, 8); // Look at center of board
		cameraRef.current = camera;
		
		// Create renderer
		const renderer = new THREE.WebGLRenderer({ 
			antialias: true,
			alpha: true
		});
		renderer.setSize(width, height);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		
		// Clear old renderer if it exists
		if (containerRef.current.firstChild) {
			containerRef.current.removeChild(containerRef.current.firstChild);
		}
		
		containerRef.current.appendChild(renderer.domElement);
		rendererRef.current = renderer;
		
		// Add lights
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		scene.add(ambientLight);
		
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(50, 50, 50);
		directionalLight.castShadow = true;
		scene.add(directionalLight);
		
		// Setup shadow properties
		directionalLight.shadow.mapSize.width = 2048;
		directionalLight.shadow.mapSize.height = 2048;
		directionalLight.shadow.camera.near = 0.5;
		directionalLight.shadow.camera.far = 150;
		directionalLight.shadow.bias = -0.0005;
		
		// Add orbit controls
		const controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.25;
		controls.screenSpacePanning = false;
		controls.minDistance = 10;
		controls.maxDistance = 40;
		controls.maxPolarAngle = Math.PI / 2;
		controlsRef.current = controls;
		
		// Create board group
		const boardGroup = new THREE.Group();
		scene.add(boardGroup);
		boardGroupRef.current = boardGroup;
		
		// Add environment
		addEnvironment(scene);
		
		// Animation loop
		const animate = () => {
			controls.update();
			renderer.render(scene, camera);
			animationFrameRef.current = requestAnimationFrame(animate);
		};
		
		animate();
		
		// Handle resize
		const handleResize = () => {
			if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
			
			const newWidth = containerRef.current.clientWidth;
			const newHeight = containerRef.current.clientHeight;
			
			setViewportDimensions({ width: newWidth, height: newHeight });
			cameraRef.current.aspect = newWidth / newHeight;
			cameraRef.current.updateProjectionMatrix();
			rendererRef.current.setSize(newWidth, newHeight);
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
	}, [playerId]);
	
	// Update spectating status when spectatingPlayerId changes
	useEffect(() => {
		setIsSpectating(!!spectatingPlayerId);
		
		// Move camera to view from spectated player's perspective
		if (spectatingPlayerId && homeZones[spectatingPlayerId]) {
			const homeZone = homeZones[spectatingPlayerId];
			const centerX = homeZone.cells.reduce((sum, cell) => sum + cell.x, 0) / homeZone.cells.length;
			const centerZ = homeZone.cells.reduce((sum, cell) => sum + cell.y, 0) / homeZone.cells.length;
			
			// Position camera 15 units behind and 15 units above the home zone
			if (cameraRef.current) {
				const angle = Math.atan2(centerZ, centerX);
				const distance = 15;
				
				cameraRef.current.position.set(
					centerX - Math.cos(angle) * distance,
					15,
					centerZ - Math.sin(angle) * distance
				);
				
				cameraRef.current.lookAt(centerX, 0, centerZ);
				
				// Update controls target
				if (controlsRef.current) {
					controlsRef.current.target.set(centerX, 0, centerZ);
					controlsRef.current.update();
				}
			}
		}
	}, [spectatingPlayerId, homeZones]);
	
	// Add environment objects (sky, clouds, etc.)
	const addEnvironment = (scene) => {
		// Create a "floor" far below
		const floorGeometry = new THREE.PlaneGeometry(1000, 1000);
		const floorMaterial = new THREE.MeshBasicMaterial({ 
			color: 0x3498db,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.8
		});
		const floor = new THREE.Mesh(floorGeometry, floorMaterial);
		floor.rotation.x = Math.PI / 2;
		floor.position.y = -50;
		scene.add(floor);
		
		// Add clouds (simplified)
		for (let i = 0; i < 20; i++) {
			const cloudGeometry = new THREE.SphereGeometry(Math.random() * 5 + 2, 8, 8);
			const cloudMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.8
			});
			
			const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
			
			// Random position around the scene
			const radius = Math.random() * 100 + 50;
			const angle = Math.random() * Math.PI * 2;
			
			cloud.position.x = Math.cos(angle) * radius;
			cloud.position.y = Math.random() * 20 + 20;
			cloud.position.z = Math.sin(angle) * radius;
			
			scene.add(cloud);
		}
	};
	
	// Handle cell click
	const handleCellClick = (position) => {
		if (onCellClick) {
			onCellClick(position);
		}
	};
	
	// Handle piece click
	const handlePieceClick = (pieceId) => {
		if (onPieceClick) {
			onPieceClick(pieceId);
		}
	};
	
	// Handle piece drag
	const handlePieceDrag = (pieceId, x, y) => {
		setIsDragging(true);
		// Logic for mapping 2D mouse position to 3D space would go here
		// This is a simplified version without the full implementation
	};
	
	// Handle piece drop
	const handlePieceDrop = (pieceId) => {
		setIsDragging(false);
		if (onPieceMove && hoveredCell) {
			onPieceMove(pieceId, hoveredCell);
		}
	};
	
	// Is cell at position valid for selected piece to move to
	const isCellValidMove = (position) => {
		if (!validMoves || validMoves.length === 0) return false;
		
		return validMoves.some(move => 
			move.x === position.x && move.y === position.y
		);
	};
	
	// Is piece active (player's turn to move it)
	const isPieceActive = (pieceId) => {
		return pieceId === activePieceId;
	};
	
	// Is piece selected 
	const isPieceSelected = (pieceId) => {
		return selectedPiece && selectedPiece.id === pieceId;
	};
	
	// Is player paused
	const isPlayerPaused = (playerId) => {
		return pausedPlayers.includes(playerId);
	};
	
	// Generate board cells
	const renderBoardCells = () => {
		if (!board || !board.cells) return null;
		
		return Object.values(board.cells).map(cell => {
			// Check if cell is in a home zone
			let isHomeZone = false;
			let homeZoneDegradation = 0;
			let ownerId = cell.ownerId;
			
			// Check all home zones
			Object.entries(homeZones).forEach(([playerId, homeZone]) => {
				if (homeZone.cells.some(hzCell => hzCell.x === cell.x && hzCell.y === cell.y)) {
					isHomeZone = true;
					homeZoneDegradation = homeZone.degradation || 0;
					if (!ownerId) ownerId = playerId; // Ensure home zone cells have owner
				}
			});
			
			// Find player color
			let playerColor = '#cccccc'; // Default gray
			
			if (ownerId && activePlayers) {
				const owner = activePlayers.find(player => player.id === ownerId);
				if (owner) {
					playerColor = owner.color;
				}
			}
			
			return (
				<div
					key={`cell-${cell.x}-${cell.y}`}
					className="board-cell-container"
					style={{
						transform: `translate(${cell.x * 60}px, ${cell.y * 60}px)`
					}}
				>
					<BoardCell
						position={{ x: cell.x, y: cell.y }}
						type={cell.type || 'normal'}
						playerId={ownerId}
						playerColor={playerColor}
						isHomeZone={isHomeZone}
						isHighlighted={hoveredCell && hoveredCell.x === cell.x && hoveredCell.y === cell.y}
						isValidMove={isCellValidMove({ x: cell.x, y: cell.y })}
						homeZoneDegradation={homeZoneDegradation}
						onClick={handleCellClick}
					/>
				</div>
			);
		});
	};
	
	// Generate chess pieces
	const renderChessPieces = () => {
		if (!pieces || pieces.length === 0) return null;
		
		return pieces.map(piece => {
			// Find player color
			let playerColor = '#cccccc'; // Default gray
			
			if (piece.playerId && activePlayers) {
				const owner = activePlayers.find(player => player.id === piece.playerId);
				if (owner) {
					playerColor = owner.color;
				}
			}
			
			return (
				<div
					key={`piece-${piece.id}`}
					className="chess-piece-container"
					style={{
						transform: `translate(${piece.position.x * 60}px, ${piece.position.y * 60}px)`
					}}
				>
					<ChessPiece
						pieceType={piece.type}
						pieceId={piece.id}
						playerColor={playerColor}
						position={piece.position}
						isDraggable={isPieceActive(piece.id)}
						isMoving={isDragging && isPieceSelected(piece.id)}
						isSelected={isPieceSelected(piece.id)}
						isPaused={isPlayerPaused(piece.playerId)}
						isPawnPromoting={piece.isPromoting}
						pawnMoveCount={piece.type.toLowerCase() === 'pawn' ? (piece.moveCount || 0) : 0}
						onPieceClick={handlePieceClick}
						onPieceDrag={handlePieceDrag}
						onPieceDrop={handlePieceDrop}
					/>
				</div>
			);
		});
	};
	
	/**
	 * Animate camera to focus on player's home cells
	 * @param {string} playerIdToFocus - The player ID to focus on
	 */
	const focusCameraOnHomeCells = (playerIdToFocus) => {
		if (!cameraRef.current || !controlsRef.current) return;
		
		// Find home zone for this player
		const playerHomeZone = homeZones[playerIdToFocus];
		
		if (playerHomeZone) {
			// Calculate target position based on home zone
			const targetX = playerHomeZone.x + (BOARD_SETTINGS?.HOME_ZONE_WIDTH || 4) / 2;
			const targetZ = playerHomeZone.z + (BOARD_SETTINGS?.HOME_ZONE_HEIGHT || 2) / 2;
			
			// Start position (current camera position)
			const startPos = cameraRef.current.position.clone();
			const startTarget = controlsRef.current.target.clone();
			
			// End position (focused on home cells)
			const endPos = new THREE.Vector3();
			const endTarget = new THREE.Vector3(targetX, 0, targetZ);
			
			// Determine if player is at top or bottom based on Z position
			if (playerHomeZone.z < boardHeight / 2) {
				// Player at top - position camera below and looking up
				endPos.set(targetX, 15, targetZ + 15);
			} else {
				// Player at bottom - position camera above and looking down
				endPos.set(targetX, 15, targetZ - 15);
			}
			 
			// Animation duration
			const duration = 1500; // milliseconds
			const startTime = Date.now();
			
			// Animation function
			const animateCamera = () => {
				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / duration, 1);
				
				// Ease in-out function for smooth animation
				const easeInOut = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
				const easedProgress = easeInOut(progress);
				
				// Interpolate position and target
				cameraRef.current.position.lerpVectors(startPos, endPos, easedProgress);
				controlsRef.current.target.lerpVectors(startTarget, endTarget, easedProgress);
				controlsRef.current.update();
				
				// Continue animation if not complete
				if (progress < 1) {
					requestAnimationFrame(animateCamera);
				} else if (onCameraAnimationComplete) {
					// Callback when animation completes
					onCameraAnimationComplete();
				}
			};
			
			// Start animation
			animateCamera();
		}
	};
	
	// Expose the focusCameraOnHomeCells method on the component instance
	React.useImperativeHandle(ref, () => ({
		focusCameraOnHomeCells
	}), [homeZones]);
	
	return (
		<div 
			className={`game-board ${isSpectating ? 'spectating' : ''}`}
			ref={containerRef}
		>
			{/* WebGL rendering happens in the containerRef */}
			
			{/* Overlay for 2D elements */}
			<div className="board-overlay">
				<div className="board-cells-container">
					{renderBoardCells()}
				</div>
				
				<div className="chess-pieces-container">
					{renderChessPieces()}
				</div>
			</div>
			
			{isSpectating && (
				<div className="spectating-indicator">
					Spectating: {activePlayers.find(p => p.id === spectatingPlayerId)?.name || 'Unknown Player'}
				</div>
			)}
			
			<div className="board-controls">
				<button className="reset-camera-btn" onClick={() => {
					if (cameraRef.current && controlsRef.current) {
						cameraRef.current.position.set(8, 15, 6);
						cameraRef.current.lookAt(8, 0, 8);
						controlsRef.current.target.set(8, 0, 8);
						controlsRef.current.update();
					}
				}}>
					Reset Camera
				</button>
			</div>
		</div>
	);
};

GameBoard.propTypes = {
	board: PropTypes.shape({
		cells: PropTypes.object,
		width: PropTypes.number,
		height: PropTypes.number
	}),
	pieces: PropTypes.arrayOf(
		PropTypes.shape({
			id: PropTypes.string.isRequired,
			type: PropTypes.string.isRequired,
			playerId: PropTypes.string.isRequired,
			position: PropTypes.shape({
				x: PropTypes.number.isRequired,
				y: PropTypes.number.isRequired
			}).isRequired,
			moveCount: PropTypes.number,
			isPromoting: PropTypes.bool
		})
	),
	homeZones: PropTypes.objectOf(
		PropTypes.shape({
			playerId: PropTypes.string.isRequired,
			cells: PropTypes.arrayOf(
				PropTypes.shape({
					x: PropTypes.number.isRequired,
					y: PropTypes.number.isRequired
				})
			),
			degradation: PropTypes.number
		})
	),
	selectedPiece: PropTypes.shape({
		id: PropTypes.string.isRequired,
		type: PropTypes.string.isRequired
	}),
	validMoves: PropTypes.arrayOf(
		PropTypes.shape({
			x: PropTypes.number.isRequired,
			y: PropTypes.number.isRequired
		})
	),
	activePieceId: PropTypes.string,
	activePlayers: PropTypes.arrayOf(
		PropTypes.shape({
			id: PropTypes.string.isRequired,
			name: PropTypes.string.isRequired,
			color: PropTypes.string.isRequired
		})
	),
	pausedPlayers: PropTypes.arrayOf(PropTypes.string),
	onCellClick: PropTypes.func,
	onPieceClick: PropTypes.func,
	onPieceMove: PropTypes.func,
	spectatingPlayerId: PropTypes.string,
	playerId: PropTypes.string,
	onCameraAnimationComplete: PropTypes.func
};

// Create a ref-forwarded component
const GameBoardWithRef = React.forwardRef(GameBoard);

export default GameBoardWithRef; 
import * as sceneModule from './scene';

// Import the centre marker module functions
import { findBoardCentreMarker, createCentreMarker, toRelativePosition, toAbsolutePosition, translatePosition } from './centreBoardMarker.js';

// Import the chess piece creator functionality
import { createChessPiece as createChessPieceFromCreator } from './chessPieceCreator.js';
import { isTetrominoAdjacentToExistingCells, renderTetromino, initializeNextTetromino } from './tetromino.js';

/**
 * Update board cell incrementally (for animations or live updates)
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {*} value - Value to set
 */
function updateBoardCell(gameState, x, z, value) {
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}
	
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Update the cell
	const key = `${x},${z}`;
	
	if (value === 0 || value === null) {
		// Remove the cell if setting to empty
		delete gameState.board.cells[key];
	} else {
		// Set the cell value based on type
		if (typeof value === 'object' && value !== null) {
			// For object-based values, we might be adding to an array of cell contents
			const existingCell = gameState.board.cells[key];
			
			if (existingCell && Array.isArray(existingCell.contents)) {
				// Cell already exists with contents array
				// Check if we're adding a new content type or replacing one
				if (value.type) {
					// Find if we already have this type in the contents
					const existingIndex = existingCell.contents.findIndex(
						item => item.type === value.type
					);
					
					if (existingIndex >= 0) {
						// Replace the existing item of this type
						existingCell.contents[existingIndex] = value;
					} else {
						// Add new item to contents
						existingCell.contents.push(value);
					}
				} else {
					// Just push the new value if it doesn't have a type
					existingCell.contents.push(value);
				}
			} else if (existingCell && !Array.isArray(existingCell.contents)) {
				// Cell exists but doesn't have contents array
				// Convert to new multi-content format
				gameState.board.cells[key] = {
					contents: [existingCell, value],
					position: { x, z }
				};
			} else {
				// New cell with this value as its only content
				if (value.type === 'cell') {
					// This is a cell definition itself
					gameState.board.cells[key] = value;
				} else {
					// This is a content to put in a cell
					gameState.board.cells[key] = {
						contents: [value],
						position: { x, z }
					};
				}
			}
		} else {
			// For primitive values (like numbers), set directly for backward compatibility
			gameState.board.cells[key] = value;
		}
		
		// Update board boundaries
		if (x < gameState.board.minX) gameState.board.minX = x;
		if (x > gameState.board.maxX) gameState.board.maxX = x;
		if (z < gameState.board.minZ) gameState.board.minZ = z;
		if (z > gameState.board.maxZ) gameState.board.maxZ = z;
		
		// Update board dimensions
		gameState.board.width = gameState.board.maxX - gameState.board.minX + 1;
		gameState.board.height = gameState.board.maxZ - gameState.board.minZ + 1;
	}
}

/**
 * Helper function to extract specific content type from a cell
 * @param {Object} cell - The cell data
 * @param {string} contentType - The type of content to extract (chess, tetromino, homeZone, etc.)
 * @returns {Object} The content object or null if not found
 */
function extractCellContent(cell, contentType) {
	// Debug log the input
	// console.log(`Extracting ${contentType} from cell:`, cell);
	
	// Handle null/undefined cells
	if (!cell) {
		console.log('Cell is null or undefined');
		return null;
	}
	
	// Handle legacy number format
	if (typeof cell === 'number') {
		// Convert legacy numeric cell types
		if (contentType === 'chess' && cell >= 11) {
			const player = Math.floor(cell / 10);
			const pieceType = cell % 10;
			return {
				type: 'chess',
				player: player,
				chessPiece: {
					type: pieceType,
					player: player
				}
			};
		} else if (contentType === 'tetromino' && cell >= 1 && cell <= 5) {
			return {
				type: 'tetromino',
				player: cell
			};
		} else if (contentType === 'homeZone' && cell >= 6 && cell <= 10) {
			return {
				type: 'homeZone',
				player: cell - 5
			};
		}
		return null;
	}
	
	// NEW FORMAT: Handle array format (new format where cell is an array of objects)
	if (Array.isArray(cell)) {
		const found = cell.find(item => item.type === contentType);
		// console.log(`Array search for ${contentType}:`, found);
		return found || null;
	}
	
	// Handle modern object format
	if (typeof cell === 'object') {
		// Direct match if cell has a type property
		if (cell.type === contentType) {
			console.log(`Direct match for ${contentType}:`, cell);
			return cell;
		}
		
		// Check in contents array if it exists
		if (cell.contents && Array.isArray(cell.contents)) {
			const found = cell.contents.find(item => item.type === contentType);
			console.log(`Contents search for ${contentType}:`, found);
			return found || null;
		}
	}
	
	console.log(`No ${contentType} found in cell`);
	return null;
}

/**
 * Create a base grid of board cells
 * @param {Object} gameState - The current game state
 * @param {Object} boardGroup - THREE.js group for board cells
 * @param {Function} createFloatingIsland - Function to create island mesh
 * @param {Object} THREE - THREE.js library
 */
function createBoardCells(gameState, boardGroup, createFloatingIsland, THREE) {
	// Clear existing board first
	const boardElements = boardGroup.children?.filter(child => 
		child.userData && (child.userData.type === 'cell' || child.userData.type === 'cloud'));
	
	// Preserve the centre marker cell if it exists
	let centreMarkerCell = boardGroup.children?.find(child => 
		child.userData && child.userData.type === 'centreMarker');
	
	for (const element of boardElements) {
		if (element !== centreMarkerCell) {
			boardGroup.remove(element);
		}
	}
	
	
	// Get board boundaries from state
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 2048;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 2048;
	
	// Create basic materials
	const whiteMaterial = new THREE.MeshStandardMaterial({ 
		color: 0xf5f5f5,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const darkMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x3a3a3a,
		roughness: 0.7, 
		metalness: 0.2
	});
	
	// Special material for the centre marker
	const centreMarkerMaterial = new THREE.MeshStandardMaterial({
		color: 0x00FF00, // Bright green for visibility
		roughness: 0.5,
		metalness: 0.5,
		transparent: true,
		opacity: 0.7 
	});
	
	// Home zone materials
	const homeZoneMaterials = {
		1: new THREE.MeshStandardMaterial({ 
			color: 0x0055AA, // Blue for player 1
			roughness: 0.7,
			metalness: 0.3,
			transparent: true,
			opacity: 0.8
		}),
		2: new THREE.MeshStandardMaterial({ 
			color: 0xAA0000, // Red for player 2
			roughness: 0.7,
			metalness: 0.3,
			transparent: true,
			opacity: 0.8
		})
	};
	
	// Create a very light cloud material for empty cells - making it more subtle
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xf8f8ff,
		roughness: 0.9,
		metalness: 0.0,
		transparent: true,
		opacity: 0.15 // Much lower opacity
	});
	
	// Create a 8x8 grid of cells at minimum
	const minGridSize = 8;
	const gridWidth = Math.max(maxX - minX + 1, minGridSize);
	const gridHeight = Math.max(maxZ - minZ + 1, minGridSize);
	
	// CRITICAL: Check if the game state has a centre marker 
	// This is the most important part of ensuring consistent positioning
	let centerX, centerZ;
	
	// Always calculate the mathematical center of the board
	const calculatedCenterX = Math.floor((minX + maxX) / 2);
	const calculatedCenterZ = Math.floor((minZ + maxZ) / 2);

	if (gameState.board && gameState.board.centreMarker && 
		typeof gameState.board.centreMarker.x === 'number' && 
		typeof gameState.board.centreMarker.z === 'number') {
		// Use the existing centre marker directly from gameState
		centerX = gameState.board.centreMarker.x;
		centerZ = gameState.board.centreMarker.z;
		console.log(`Using existing board centreMarker at (${centerX}, ${centerZ}) for cell positions`);
	} else {
		// Fallback to calculated centre
		centerX = calculatedCenterX;
		centerZ = calculatedCenterZ;
		console.log(`No centreMarker found in game state, using calculated center at (${centerX}, ${centerZ})`);
		
		// IMPORTANT: Create the centre marker in the game state for future use
		if (gameState.board) {
			// Always create the marker to ensure it exists
			gameState.board.centreMarker = { x: centerX, z: centerZ };
			console.log(`Created new centreMarker at (${centerX}, ${centerZ})`);
		}
	}
	
	// Track the number of cells created for performance monitoring
	let cellCount = 0;
	let cloudCount = 0;
	
	// Create cells - only create cells that are visible or necessary
	// For very large boards, we create a subset visible in the viewport + some extras
	// The actual visible range will depend on camera position and view settings
	const maxVisibleCells = 50; // Maximum cells to create in each dimension for performance
	
	// Calculate visible range
	const visibleRangeX = Math.min(gridWidth, maxVisibleCells);
	const visibleRangeZ = Math.min(gridHeight, maxVisibleCells);
	
	// Calculate start and end positions
	const startX = Math.max(minX, Math.floor(centerX - visibleRangeX/2));
	const endX = Math.min(maxX + 1, startX + visibleRangeX);
	const startZ = Math.max(minZ, Math.floor(centerZ - visibleRangeZ/2));
	const endZ = Math.min(maxZ + 1, startZ + visibleRangeZ);
	
	// Log visible cell range
	console.log(`Creating cells in range: x=${startX}-${endX}, z=${startZ}-${endZ} (board bounds: x=${minX}-${maxX}, z=${minZ}-${maxZ})`);
	
	// Debug output of the actual board structure
	console.log('Board structure sample:', 
		gameState.board.cells ? `${Object.keys(gameState.board.cells).length} cells` : 'Empty');
	
	// If createFloatingIsland function is not provided, create a simple fallback
	const createIsland = createFloatingIsland || function(x, z, material, offset, hasContent) {
		const geometry = new THREE.BoxGeometry(0.9, 0.2, 0.9);
		const mesh = new THREE.Mesh(geometry, material);
		return mesh;
	};
	
	// IMPORTANT: Always create the centre marker cell to ensure it exists
	// This is the anchor point for all positioning
	console.log(`Creating centre marker cell at (${centerX}, ${centerZ})`);
	
	// Create a special island for the centre marker
	const centreIsland = createIsland(centerX, centerZ, centreMarkerMaterial, 0.3, true);
	
	// Make it slightly taller to ensure visibility
	centreIsland.scale.y = 2.0;
	
	// Tag as a special cell
	centreIsland.userData = {
		type: 'centreMarker',
		position: { x: centerX, z: centerZ },
		isCentreMarker: true
	};
	
	// Position relative to center (which is the marker itself)
	centreIsland.position.x = 0; // Exactly at origin
	centreIsland.position.z = 0;
	centreIsland.position.y = -0.3; // Slightly raised to be visible
	
	// Add to board group
	boardGroup.add(centreIsland);
	cellCount++;
	
	// Add to the cells structure if needed
	if (gameState.board && gameState.board.cells) {
		const key = `${centerX},${centerZ}`;
		if (!gameState.board.cells[key]) {
			// Create new cell with special marker
			gameState.board.cells[key] = [{
				type: 'specialMarker',
				isCentreMarker: true,
				centreX: centerX,
				centreZ: centerZ
			}];
		} else if (Array.isArray(gameState.board.cells[key])) {
			// Check if the center marker exists in the array
			const markerExists = gameState.board.cells[key].some(item => 
				item.type === 'specialMarker' && item.isCentreMarker);
				
			if (!markerExists) {
				// Add to existing array
				gameState.board.cells[key].push({
					type: 'specialMarker',
					isCentreMarker: true,
					centreX: centerX,
					centreZ: centerZ
				});
			}
		} else if (typeof gameState.board.cells[key] === 'object') {
			// Legacy format - add special marker property
			gameState.board.cells[key].specialMarker = {
				type: 'boardCentre',
				isCentreMarker: true,
				centreX: centerX,
				centreZ: centerZ
			};
		}
		
		// Also ensure the game state has a direct reference to the centre marker
		gameState.board.centreMarker = { x: centerX, z: centerZ };
	}
	
	// Also extract chess pieces from board cells
	const extractedPieces = [];
	
	for (let z = startZ; z < endZ; z++) {
		for (let x = startX; x < endX; x++) {
			// Skip the centre marker cell as we already created it
			if (x === centerX && z === centerZ) {
				continue;
			}
			
			// Check if this position has actual content in the sparse board
			const key = `${x},${z}`;
			const cellData = gameState.board.cells ? gameState.board.cells[key] : null;
							  
			const hasContent = cellData !== undefined && cellData !== null;
							  
			// Always create a cell for border areas or non-empty cells
			const isBorder = x === startX || x === endX - 1 || z === startZ || z === endZ - 1;
			const isCheckerboardSquare = (x + z) % 2 === 0;
			if (hasContent || (isCheckerboardSquare && (isBorder || Math.random() < 0.3))) {
				// Choose material based on content and checkerboard pattern
				let material;
				
				// Check for special home zone content
				if (hasContent) {
					const homeZoneContent = extractCellContent(cellData, 'homeZone');
					
					// First check if it's a home zone
					if (homeZoneContent && homeZoneContent.player) {
						material = homeZoneMaterials[homeZoneContent.player] || (isCheckerboardSquare ? whiteMaterial : darkMaterial);
					} else {
						// Use standard checkerboard pattern
						material = isCheckerboardSquare ? whiteMaterial : darkMaterial;
					}
					
					// Create floating island with slightly less vertical offset
					const island = createIsland(x, z, material, 0.3, hasContent);
					
					// Tag as a proper cell
					island.userData = {
						type: 'cell',
						position: { x, z },
						isEmpty: !hasContent,
						cellData: cellData
					};
					
					// Add to board group
					boardGroup.add(island);
					
					// Position relative to center marker
					island.position.x = x - centerX;
					island.position.z = z - centerZ;
					island.position.y = -0.5; // Move lower to create flat board
					
					cellCount++;
					
					// Check for chess pieces in this cell
					if (hasContent) {
						// Extract chess content from cell data
						const chessContent = extractCellContent(cellData, 'chess');
						
						// Log more detailed information about what we're finding
						if (chessContent) {
							console.log(`Found chess piece: ${chessContent.pieceType || chessContent.chessPiece?.type || 'UNKNOWN'} for player ${chessContent.player || 'unknown'}`);
							
							// Create a properly formatted chess piece object from the data
							extractedPieces.push({
								id: chessContent.pieceId || 
									`${chessContent.player}-${chessContent.pieceType || 'PAWN'}-${x}-${z}`,
								position: { x, z },
								type: chessContent.pieceType ? chessContent.pieceType.toUpperCase() : 
									(chessContent.chessPiece?.type || "PAWN"),
								player: chessContent.player || 'player1',
								color: chessContent.color || 0xcccccc
							});
							
							console.log(`Extracted chess piece at (${x},${z}): ${chessContent.pieceType || 'PAWN'} for player ${chessContent.player || 'player1'}`);
						} else if (Array.isArray(cellData)) {
							// Try direct array handling as a backup
							for (const cellItem of cellData) {
								if (cellItem.type === 'chess') {
									console.log(`Found chess piece through direct array access: ${cellItem.pieceType || 'UNKNOWN'}`);
									
									extractedPieces.push({
										id: cellItem.pieceId || 
											`${cellItem.player}-${cellItem.pieceType || 'PAWN'}-${x}-${z}`,
										position: { x, z },
										type: cellItem.pieceType ? cellItem.pieceType.toUpperCase() : "PAWN",
										player: cellItem.player || 'player1',
										color: cellItem.color || 0xcccccc
									});
									
									console.log(`Extracted chess piece at (${x},${z}): ${cellItem.pieceType || 'PAWN'} for player ${cellItem.player || 'player1'}`);
								}
							}
						} else {
							console.log(`No chess piece found at (${x},${z}) in:`, cellData);
						}
					}
				}
			} else if ((x + z) % 4 === 0 && Math.random() < 0.15) { // Reduced density
				// Create a very simple flat plane for empty areas - no caps, just flat clouds
				const cloudSize = 0.5 + Math.random() * 0.2; // Smaller size
				const cloudGeometry = new THREE.PlaneGeometry(cloudSize, cloudSize);
				const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
				
				// Tag as a decoration cloud
				cloud.userData = {
					type: 'cloud',
					position: { x, z }
				};
				
				// Set position relative to center marker
				cloud.position.x = x - centerX;
				cloud.position.z = z - centerZ;
				cloud.position.y = -1.5 - Math.random() * 0.3; // Lower than cells
				cloud.rotation.x = -Math.PI / 2; // Flat orientation
				
				// Add to board group
				boardGroup.add(cloud);
				cloudCount++;
			}
		}
	}
	
	// Update the game state with extracted chess pieces
	if (extractedPieces.length > 0) {
		console.log(`Extracted ${extractedPieces.length} chess pieces from board cells`);
		// Always set the pieces we found, as they should be the most current representation
		gameState.chessPieces = extractedPieces;
	} else {
		console.warn('No chess pieces were extracted from the board');
	}
	
	console.log(`Created ${cellCount} board cells and ${cloudCount} decorative clouds for visualization`);
	return { cellCount, cloudCount };
}

/**
 * Improved renderBoard function with efficient cell reuse
 * @param {Object} gameState - The current game state
 * @param {Object} boardGroup - THREE.js group for board cells
 * @param {Function} createFloatingIsland - Function to create island mesh
 * @param {Object} THREE - THREE.js library
 * @returns {Object} Stats about the update operation
 */
function renderBoard(gameState, boardGroup, createFloatingIsland, THREE) {
	// Start timing for performance measurement
	const startTime = performance.now();
	// console.log("Rendering board with efficient cell reuse...");
	
	// Get board boundaries
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 32;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 32;
	
	// Find center marker - critical for positioning
	let centerX, centerZ;
	
	// Use the centralized function to find or create the centre marker
	const centreMark = findBoardCentreMarker(gameState);
	centerX = centreMark.x;
	centerZ = centreMark.z;
	console.log(`Using centralized centre marker at (${centerX}, ${centerZ}) for board rendering`);
	
	// Ensure the marker is saved to the game state for future use
	if (gameState.board) {
		gameState.board.centreMarker = { x: centerX, z: centerZ };
	}
	
	// Define the visible grid size based on screen size
	const screenWidth = window.innerWidth;
	const gridWidth = screenWidth > 1200 ? 40 : (screenWidth > 800 ? 30 : 20);
	const gridHeight = gridWidth; // Keep it square for simplicity
	
	// Create map of existing cells for fast lookup
	const existingCells = {};
	if (boardGroup && boardGroup.children) {
		boardGroup.children.forEach(child => {
			if (child && child.userData && child.userData.type === 'cell' && 
				child.userData.position && child.userData.position.x !== undefined && 
				child.userData.position.z !== undefined) {
				const key = `${child.userData.position.x},${child.userData.position.z}`;
				existingCells[key] = child;
			}
		});
	}
	
	// Keep track of cells we've processed in this update
	const processedCells = {};
	let cellsCreated = 0;
	let cellsRemoved = 0;
	let cellsReused = 0;
	
	// Process all cells in the board data regardless of position
	// This ensures we don't miss any cells including those with negative coordinates
	if (gameState.board && gameState.board.cells) {
		for (const key in gameState.board.cells) {
			// Extract coordinates from the key
			const [x, z] = key.split(',').map(Number);
			
			// Skip invalid coordinates
			if (isNaN(x) || isNaN(z)) continue;
			
			// Generate a unique key for this cell position
			const cellKey = `${x},${z}`;
			processedCells[cellKey] = true;
			
			// Get the cell data
			const cellData = gameState.board.cells[key];
			
			// Skip empty cells
			if (cellData === null || cellData === undefined) continue;
			
			// Check if a cell already exists at this position
			const existingCell = existingCells[cellKey];
			
			if (existingCell) {
				// Reuse the existing cell - just update its userData if needed
				existingCell.userData.data = cellData;
				existingCell.userData.processed = true;
				cellsReused++;
				
				// Position the cell relative to the center marker using translation functions
				const relativePosition = {x, z};
				existingCell.position.x = relativePosition.x;
				existingCell.position.z = relativePosition.z;
			} else {
				// Create a new cell
				try {
					// Choose the appropriate material based on cell type
					let material;
					
					// Extract the home zone or tetromino data if present
					let isHomeZone = false;
					let homePlayer = null;
					let tetrominoPlayer = null;
					
					// Handle array-based cells
					if (Array.isArray(cellData)) {
						// Look for home zone in array
						const homeZone = cellData.find(item => item && item.type === 'home');
						if (homeZone) {
							isHomeZone = true;
							homePlayer = homeZone.player;
						}
						
						// Look for tetromino in array
						const tetromino = cellData.find(item => item && item.type === 'tetromino');
						if (tetromino) {
							tetrominoPlayer = tetromino.player;
						}
					} 
					// Handle object-based cells
					else if (typeof cellData === 'object') {
						// Extract home zone
						if (cellData.type === 'home' || cellData.homeZone) {
							isHomeZone = true;
							homePlayer = cellData.player;
						}
						
						// Extract tetromino
						if (cellData.type === 'tetromino' || cellData.tetromino) {
							tetrominoPlayer = cellData.player;
						}
					}
					
					// Create the material based on cell content
					if (isHomeZone) {
						// Home zone material - use player color if available
						const homeColor = getPlayerColor(homePlayer, gameState, 'home');
						material = new THREE.MeshStandardMaterial({ 
							color: homeColor, 
							roughness: 0.7,
							metalness: 0.3,
							transparent: true,
							opacity: 0.85
						});
					} else if (tetrominoPlayer) {
						// Tetromino material - use player color with tetromino flag
						const tetrominoColor = getPlayerColor(tetrominoPlayer, gameState, 'tetromino');
						material = new THREE.MeshStandardMaterial({ 
							color: tetrominoColor, 
							roughness: 0.5,
							metalness: 0.5,
							transparent: false,
							opacity: 1.0
						});
					} else {
						// Default chess board material - maintain chequered pattern
						const isWhite = (x + z) % 2 === 0;
						material = new THREE.MeshStandardMaterial({ 
							color: isWhite ? 0xe9e9e9 : 0x808080, 
							roughness: 0.6,
							metalness: 0.2,
							transparent: true,
							opacity: 0.9
						});
					}
					
					// Get relative position from the center marker using translation functions
					// const relativePosition = {x, z};
					
					// Create the cell mesh
					/*const newCell = createFloatingIsland(
						relativePosition.x,   // Position relative to the center marker
						relativePosition.z, 
						material, 
						boardGroup,
						centerX,
						centerZ
					);
					
					// Store the cell data in userData
					newCell.userData = {
						type: 'cell',
						position: { x, z },
						data: cellData,
						processed: true
					};
					
					// Add to board group
					if (!boardGroup.children.includes(newCell)) {
						boardGroup.add(newCell);
					}*/
					
					cellsCreated++;
				} catch (error) {
					console.error(`Error creating cell at (${x}, ${z}):`, error);
				}
			}
		}
	}
	
	// Remove any cells that are no longer in the game state
	if (boardGroup && boardGroup.children) {
		const cellsToRemove = [];
		
		boardGroup.children.forEach(child => {
			if (child && child.userData && child.userData.type === 'cell' && 
				child.userData.position) {
				const key = `${child.userData.position.x},${child.userData.position.z}`;
				
				// If the cell wasn't processed in this update, remove it
				if (!processedCells[key]) {
					cellsToRemove.push(child);
				}
			}
		});
		
		// Remove the cells that are no longer needed
		cellsToRemove.forEach(cell => {
			boardGroup.remove(cell);
			if (cell.material) {
				if (Array.isArray(cell.material)) {
					cell.material.forEach(m => m && m.dispose());
				} else {
					cell.material.dispose();
				}
			}
			if (cell.geometry) cell.geometry.dispose();
			cellsRemoved++;
		});
	}
	
	// Extract chess pieces from the board cells
	if (gameState.chessPieces === undefined || gameState.chessPieces.length === 0) {
		// Use the centralized function for consistent extraction
		gameState.chessPieces = extractChessPiecesFromCells(gameState);
		console.log(`Extracted ${gameState.chessPieces.length} chess pieces during board rendering`);
	}
	
	// Report performance and statistics
	const endTime = performance.now();
	console.log(`Board rendering completed in ${(endTime - startTime).toFixed(2)}ms`);
	console.log(`Statistics: ${cellsCreated} cells created, ${cellsReused} reused, ${cellsRemoved} removed`);
	
	// Return statistics for callers
	return {
		cellsCreated,
		cellsReused,
		cellsRemoved,
		totalCells: cellsCreated + cellsReused,
		centerX,
		centerZ,
		renderTime: endTime - startTime
	};
}

/**
 * Find the current player's king position
 * @param {Object} gameState - The current game state
 * @returns {Object|null} - The king's position {x, z} or null if not found
 */
function findPlayerKingPosition(gameState) {
	const currentPlayer = gameState.currentPlayer;
	
	// Check if we have chess pieces
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces)) {
		console.log("No chess pieces found in game state, using default position for player " + currentPlayer);
		return getDefaultPlayerPosition(gameState, currentPlayer);
	}
	
	console.log(`Looking for ${currentPlayer}'s king among ${gameState.chessPieces.length} pieces`);
	
	// Find the king for the current player
	for (const piece of gameState.chessPieces) {
		// Skip pieces that don't belong to the current player
		if (piece.player !== currentPlayer) {
			continue;
		}
		
		// Check if this is a king (type 6 or "KING")
		const isKing = 
			piece.type === 6 || 
			piece.type === "KING" || 
			piece.type === "king" || 
			(typeof piece.type === 'string' && piece.type.toUpperCase() === "KING");
		
		if (isKing && piece.position) {
			console.log(`Found king at (${piece.position.x}, ${piece.position.z})`);
			return {
				x: piece.position.x,
				z: piece.position.z
			};
		}
	}
	
	console.log(`No king found for player ${currentPlayer}, using default position`);
	return getDefaultPlayerPosition(gameState, currentPlayer);
}


/**
 * Handle click on Tetris phase button
 * @param {Object} gameState - The current game state
 * @param {Function} updateGameStatusDisplay - Function to update game status
 * @param {Function} updateBoardVisuals - Function to update board visuals
 * @param {Object} tetrominoGroup - THREE.js group for tetromino pieces
 * @param {Function} createTetrominoBlock - Function to create tetromino blocks
 */
function handleTetrisPhaseClick(gameState, updateGameStatusDisplay, updateBoardVisuals, tetrominoGroup, createTetrominoBlock) {
	console.log("Debug: Changed to TETRIS phase");

	gameState.turnPhase = 'tetris';
	
	// Create a new tetromino if none exists
	if (!gameState.currentTetromino) {
		gameState.currentTetromino = initializeNextTetromino(gameState);
		console.log("Created new tetromino:", gameState.currentTetromino);
	}
	
	// Force refresh piece visibility
	if (typeof updateGameStatusDisplay === 'function') {
		updateGameStatusDisplay();
	}
	
	// Make sure pieces are shown/hidden correctly
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
	
	// Render the tetromino
	renderTetromino(gameState, gameState.currentTetromino, tetrominoGroup, createTetrominoBlock);
	
}

/**
 * Create a chess piece at the specified position
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate on the board
 * @param {number} z - Z coordinate on the board
 * @param {string|number} pieceType - Type of piece (PAWN, ROOK, etc. or numeric)
 * @param {number|string} playerIdent - Player identifier
 * @param {number|string} ourPlayerIdent - Our player identifier
 * @param {Object} orientation - Orientation for the piece, if specified
 * @param {Object} THREE - THREE.js library
 * @returns {Object} THREE.js Group containing the piece
 */
function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE) {
	// Get board center for correct positioning 
	let centerX, centerZ;
	
	// Use the centralized function to find the centre marker
	const centreMark = findBoardCentreMarker(gameState);
	centerX = centreMark.x;
	centerZ = centreMark.z;
	console.log(`Using centralized centre marker at (${centerX}, ${centerZ}) for chess piece creation`);
	
	// Ensure the marker is saved to the game state for future use
	if (gameState.board) {
		gameState.board.centreMarker = { x: centerX, z: centerZ };
	}
	
	// Log for debugging the positioning
	console.log(`Creating piece at board coordinates (${x}, ${z}), using board centre: (${centerX}, ${centerZ})`);
	
	try {
		// Verify parameters for debugging
		if (pieceType === undefined || pieceType === null) {
			console.warn(`Invalid pieceType (${pieceType}) for cell at (${x},${z}), using default`);
			pieceType = 'PAWN'; // Default to pawn
		}
		
		const pieceNames = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

		// Ensure string type for piece name
		let type;
		if (typeof pieceType === 'string') {
			type = pieceType.toUpperCase();
		} else if (typeof pieceType === 'number') {
			// Check if it's a legacy format (player*10 + type)
			if (pieceType > 10) {
				// Legacy format - extract type from combined code
				const extractedType = pieceType % 10;
				type = pieceNames[extractedType - 1] || 'PAWN';
			} else {
				// Direct numeric type (1=PAWN, 2=ROOK, etc.)
				type = pieceNames[pieceType - 1] || 'PAWN';
			}
		} else {
			type = 'PAWN'; // Default if unrecognized format
		}
		
		// Map player to appropriate format
		// Handle both string player IDs and numeric values
		let playerStr = playerIdent || 'unknown_player'; // Default to generic value
		
		// Determine if this is the local player
		const isLocalPlayer = (String(playerStr) === String(ourPlayerIdent) || 
					          String(playerStr) === String(gameState.myPlayerId));
		
		// Get player color using our getPlayerColor function
		const playerColor = getPlayerColor(playerStr, gameState);
		
		// Create the piece using the chessPieceCreator module
		const pieceGroup = createChessPieceFromCreator(
			gameState,
			x,
			z,
			type,
			playerStr,
			{ 
				orientation: orientation,
				color: playerColor,  // Pass the color we generated
				isLocalPlayer: isLocalPlayer  // Also pass the local player flag
			}
		);
		
		// If the creator didn't return a piece, create a fallback
		if (!pieceGroup) {
			throw new Error("Chess piece creator failed to return a piece");
		}
		
		// Position the piece group relative to the board center using translation functions
		const absPos = translatePosition({x, z}, gameState, true);
		pieceGroup.position.set(absPos.x, 0, absPos.z);
		
		// Store metadata for identification if not already set by the creator
		if (!pieceGroup.userData || !pieceGroup.userData.type) {
			pieceGroup.userData = {
				type: 'chessPiece',
				pieceType: type,
				player: playerStr,
				originalPlayer: playerIdent,
				position: { x, z },
				visible: true,
				color: playerColor
			};
		}
		
		// Make all parts cast and receive shadows
		pieceGroup.traverse(child => {
			if (child.isMesh) {
				child.castShadow = true;
				child.receiveShadow = true;
				// Ensure visibility
				child.visible = true;
				if (child.material) {
					child.material.needsUpdate = true;
				}
			}
		});
		
		// Ensure the entire piece group is visible
		pieceGroup.visible = true;
		
		return pieceGroup;
	} catch (err) {
		console.error('Error creating chess piece:', err);
		
		// Create a simple fallback piece
		const fallbackGroup = new THREE.Group();
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		
		// Use player color for the fallback piece too
		const playerColor = getPlayerColor(playerIdent, gameState);
		const fallbackMaterial = new THREE.MeshStandardMaterial({ 
			color: playerColor,
			emissive: playerColor,
			emissiveIntensity: 0.5
		});
		
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackMesh.position.y = 0.4; // Raise above the board
		fallbackGroup.add(fallbackMesh);
		
		// Position the error mesh using translation functions
		const absPos = translatePosition({x, z}, gameState, true);
		fallbackGroup.position.set(absPos.x, 0, absPos.z);
		fallbackGroup.visible = true;
		
		return fallbackGroup;
	}
}

/**
 * Helper function to add a chess piece to the game state
 * 
 * This function:
 * 1. Adds the piece to the gameState.chessPieces array
 * 2. Updates the cell in gameState.board.cells
 * 
 * Both the piece and cell include the player ID and orientation data.
 * 
 * @param {Object} gameState - Game state to update
 * @param {string} pieceType - Type of piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {string} playerId - Player ID
 * @param {number} orientation - Orientation (0-3)
 */
function addChessPiece(gameState, pieceType, x, z, playerId, orientation) {
	// Add to chess pieces array
	if (!gameState.chessPieces) {
		gameState.chessPieces = [];
	}
	
	gameState.chessPieces.push({
		position: { x, z },
		type: pieceType,
		player: playerId,
		orientation: orientation
	});
	
	// Update board cell
	const cellKey = `${x},${z}`;
	gameState.board.cells[cellKey] = {
		type: 'chess',
		chessPiece: { type: pieceType },
		player: playerId
	};
}

/**
 * Extract chess pieces from board cells - centralized function to ensure consistent extraction
 * @param {Object} gameState - The current game state
 * @returns {Array} Array of chess pieces with position, type, player, etc.
 */
function extractChessPiecesFromCells(gameState) {
	const chessPieces = [];
	
	// Verify we have a valid board with cells
	if (!gameState.board || !gameState.board.cells) {
		console.warn('No valid board data to extract chess pieces from');
		return chessPieces;
	}
	
	console.log("Extracting chess pieces from board cells");
	
	// Get the centre marker for proper positioning
	const centreMark = findBoardCentreMarker(gameState);
	const centreX = centreMark?.x ?? 4;
	const centreZ = centreMark?.z ?? 4;
	
	console.log(`Using board centre at (${centreX}, ${centreZ}) for chess piece extraction`);
	
	// Process all cells in the board data
	for (const key in gameState.board.cells) {
		try {
			const [x, z] = key.split(',').map(Number);
			
			// Verify coordinates were parsed correctly - negative values are valid!
			if (isNaN(x) || isNaN(z)) {
				console.warn(`Invalid cell coordinates in key: ${key}`);
				continue;
			}
			
			// Get cell content
			const cellData = gameState.board.cells[key];
			
			// Skip empty cells
			if (!cellData) continue;
			
			// Handle both array-based cells and object-based cells
			if (Array.isArray(cellData)) {
				// Look for chess piece in array-based cell format
				const chessPiece = cellData.find(item => 
					item && item.type === 'chess' && item.pieceType
				);
				
				if (chessPiece) {
					// Generate a consistent piece ID
					const pieceId = chessPiece.pieceId || 
						`${chessPiece.player}-${chessPiece.pieceType}-${x}-${z}`;
					
					// Add to our pieces list
					chessPieces.push({
						id: pieceId,
						position: { x, z },
						type: chessPiece.pieceType || "PAWN",
						player: chessPiece.player || 1,
						color: chessPiece.color || 0xcccccc,
						orientation: chessPiece.orientation || 0
					});
				}
			} else if (typeof cellData === 'object' && cellData !== null) {
				// Legacy format - direct object with chess property
				if (cellData.chess) {
					const chessPiece = cellData.chess;
					// Generate a consistent piece ID
					const pieceId = chessPiece.pieceId ||
						`${chessPiece.player}-${chessPiece.type || 'PAWN'}-${x}-${z}`;
					
					// Add to our pieces list
					chessPieces.push({
						id: pieceId,
						position: { x, z },
						type: chessPiece.type || "PAWN",
						player: chessPiece.player || 1,
						color: chessPiece.color || 0xcccccc,
						orientation: chessPiece.orientation || 0
					});
				} else {
					// Use the extraction function for other formats
					const chessContent = extractCellContent(cellData, 'chess');
					
					// If chess piece content exists, extract it for rendering
					if (chessContent) {
						const pieceId = chessContent.pieceId ||
							`${chessContent.player}-${chessContent.pieceType || 'PAWN'}-${x}-${z}`;
						
						chessPieces.push({
							id: pieceId,
							position: { x, z },
							type: chessContent.pieceType || "PAWN",
							player: chessContent.player || 1,
							color: chessContent.color || 0xcccccc,
							orientation: chessContent.orientation || 0
						});
					}
				}
			}
		} catch (cellErr) {
			console.error(`Error extracting chess piece at ${key}:`, cellErr);
		}
	}
	
	console.log(`Extracted ${chessPieces.length} chess pieces from board cells`);
	return chessPieces;
}

/**
 * Convert a player identifier into a consistent color
 * @param {string} playerId - The player identifier
 * @param {Object} gameState - Optional game state to check if this is the current player
 * @param {string} type - Whether this color is for a chess piece (chess) or tetromino (tetromino) or home zone (home)
 * @returns {number} - The color as a hexadecimal number
 */
function getPlayerColor(playerId, gameState = null, type = 'chess') {
	// Always convert to string
	const playerIdStr = String(playerId);
	
	// Check if this is the current player
	const isCurrentPlayer = gameState && (
		playerIdStr === String(gameState.currentPlayer) || 
		playerIdStr === String(gameState.myPlayerId) || 
		playerIdStr === String(gameState.localPlayerId)
	);
	
	// Current player always gets red shades
	if (isCurrentPlayer) {
		switch (type) {
			case 'home':
				return 0xDD0000; // Darker red for home zone
			case 'tetromino':
				return 0xFF3333; // Brighter red for tetromino
			default:
				return 0xDD0000; // Standard red for chess pieces
		}
	}
	
	// For other players, generate a consistent color based on player ID string
	// Simple hash function to convert string to a number
	let hash = 0;
	for (let i = 0; i < playerIdStr.length; i++) {
		hash = playerIdStr.charCodeAt(i) + ((hash << 5) - hash);
	}
	
	// For non-current players, we want to bias toward blue/green tones
	// Get a hue in the blue-green range (120-240 degrees)
	const h = 120 + (Math.abs(hash) % 120); // Hue: 120-240 (green to blue)
	const s = 65 + (Math.abs(hash >> 8) % 35); // Saturation: 65-100%
	const l = 45 + (Math.abs(hash >> 16) % 20); // Lightness: 45-65%
	
	// Convert HSL to RGB
	const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
	const x = c * (1 - Math.abs((h / 60) % 2 - 1));
	const m = l / 100 - c / 2;
	
	let r, g, b;
	if (h < 180) {
		[r, g, b] = [0, c, x]; // Green to teal
	} else {
		[r, g, b] = [0, x, c]; // Teal to blue
	}
	
	// Convert to proper RGB range
	const red = Math.round((r + m) * 255);
	const green = Math.round((g + m) * 255);
	const blue = Math.round((b + m) * 255);
	
	// Convert to hex
	let color = (red << 16) | (green << 8) | blue;
	
	// If this is for a tetromino, make it slightly brighter
	if (type === 'tetromino') {
		// Extract the RGB components
		const r = (color >> 16) & 0xFF;
		const g = (color >> 8) & 0xFF;
		const b = color & 0xFF;
		
		// Make brighter by increasing all components
		const newR = Math.min(255, r + 40);
		const newG = Math.min(255, g + 40);
		const newB = Math.min(255, b + 40);
		
		color = (newR << 16) | (newG << 8) | newB;
	}
	
	return color;
}

/**
 * Debug function to test the adjacency check
 * @param {Object} gameState - The current game state
 * @param {boolean} logBoardState - Whether to log the current board state as well
 * @returns {Object} - Debug information about adjacency checks
 */
function debugAdjacencyCheck(gameState, logBoardState = false) {
	if (!gameState.currentTetromino) {
		console.warn('No current tetromino to check adjacency for');
		return { success: false, reason: 'no_tetromino' };
	}
	
	// Get current tetromino data
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	
	// Check if board is empty
	const hasCells = gameState.board && 
		gameState.board.cells && 
		Object.keys(gameState.board.cells).length > 0;
	
	// Log board state if requested
	if (logBoardState) {
		console.log('Current board state:', {
			hasCells,
			cellCount: Object.keys(gameState.board?.cells || {}).length,
			cells: gameState.board?.cells || {},
			tetrominoPosition: { x: posX, z: posZ },
			tetrominoShape: shape
		});
	}
	
	// Count occupied cells
	const occupiedCells = Object.keys(gameState.board?.cells || {}).filter(key => {
		const cell = gameState.board.cells[key];
		return cell !== null && cell !== undefined;
	});
	
	// Check each block in the tetromino
	const adjacencyMap = [];
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const blockX = posX + x;
				const blockZ = posZ + z;
				
				// Check all 8 adjacent positions
				const directions = [
					{ dx: -1, dz: 0, name: 'Left' },
					{ dx: 1, dz: 0, name: 'Right' },
					{ dx: 0, dz: -1, name: 'Up' },
					{ dx: 0, dz: 1, name: 'Down' },
					{ dx: -1, dz: -1, name: 'TopLeft' },
					{ dx: 1, dz: -1, name: 'TopRight' },
					{ dx: -1, dz: 1, name: 'BottomLeft' },
					{ dx: 1, dz: 1, name: 'BottomRight' }
				];
				
				const blockAdjacency = {
					position: { x: blockX, z: blockZ },
					adjacentCells: []
				};
				
				for (const dir of directions) {
					const adjX = blockX + dir.dx;
					const adjZ = blockZ + dir.dz;
					const key = `${adjX},${adjZ}`;
					
					// Check if the adjacent cell contains a block
					const hasCell = gameState.board?.cells && 
						gameState.board.cells[key] !== undefined && 
						gameState.board.cells[key] !== null;
					
					if (hasCell) {
						blockAdjacency.adjacentCells.push({
							direction: dir.name,
							position: { x: adjX, z: adjZ },
							cell: gameState.board.cells[key]
						});
					}
				}
				
				adjacencyMap.push(blockAdjacency);
			}
		}
	}
	
	// Final result
	const isAdjacent = isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ);
	
	return {
		success: true,
		tetrominoPosition: { x: posX, z: posZ },
		boardIsEmpty: !hasCells || occupiedCells.length === 0,
		occupiedCellCount: occupiedCells.length,
		adjacencyMap,
		isAdjacent
	};
}

/**
 * Get adjacent cells at a given position
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {Array} Array of adjacent cells with their coordinates
 */
function getAdjacentCells(gameState, x, z) {
	const adjacentCells = [];
	
	// Check all 8 adjacent positions
	const directions = [
		{ dx: -1, dz: 0, name: 'Left' },
		{ dx: 1, dz: 0, name: 'Right' },
		{ dx: 0, dz: -1, name: 'Up' },
		{ dx: 0, dz: 1, name: 'Down' },
		{ dx: -1, dz: -1, name: 'TopLeft' },
		{ dx: 1, dz: -1, name: 'TopRight' },
		{ dx: -1, dz: 1, name: 'BottomLeft' },
		{ dx: 1, dz: 1, name: 'BottomRight' }
	];
	
	for (const dir of directions) {
		const adjX = x + dir.dx;
		const adjZ = z + dir.dz;
		const key = `${adjX},${adjZ}`;
		
		// Check if the adjacent cell exists in the board
		if (gameState.board && gameState.board.cells && gameState.board.cells[key]) {
			adjacentCells.push({
				direction: dir.name,
				position: { x: adjX, z: adjZ },
				cell: gameState.board.cells[key]
			});
		}
	}
	
	return adjacentCells;
}

/**
 * Find a chess piece by ID or position
 * @param {Object} gameState - The current game state
 * @param {string|Object} identifier - Piece ID or position {x, z}
 * @param {string} [playerId] - Optional player ID to filter by
 * @returns {Object|null} The chess piece object or null if not found
 */
function findChessPiece(gameState, identifier, playerId) {
	// Verify we have chess pieces to search
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces)) {
		console.warn('No chess pieces found in game state');
		return null;
	}
	
	// Search based on type of identifier
	if (typeof identifier === 'string') {
		// Search by ID
		const piece = gameState.chessPieces.find(p => 
			p.id === identifier && (!playerId || p.player === playerId)
		);
		return piece || null;
	} else if (typeof identifier === 'object' && identifier !== null) {
		// Search by position
		const x = identifier.x;
		const z = identifier.z;
		
		if (x !== undefined && z !== undefined) {
			const piece = gameState.chessPieces.find(p => 
				p.position.x === x && p.position.z === z && 
				(!playerId || p.player === playerId)
			);
			return piece || null;
		}
	}
	
	console.warn('Invalid identifier provided to findChessPiece');
	return null;
}

/**
 * Move a chess piece on the board
 * @param {Object} gameState - The current game state
 * @param {string|Object} pieceId - ID of the piece or the piece object itself
 * @param {number} toX - Destination X coordinate
 * @param {number} toZ - Destination Z coordinate
 * @param {Function} [updateBoardVisuals] - Optional function to update the board visuals
 * @returns {Object} Result of the move operation
 */
function moveChessPiece(gameState, pieceId, toX, toZ, updateBoardVisuals) {
	// Find the piece (either by ID or directly use the object)
	const piece = typeof pieceId === 'string' ? 
		findChessPiece(gameState, pieceId) : pieceId;
	
	if (!piece) {
		console.error(`Chess piece with ID ${pieceId} not found`);
		return {
			success: false,
			error: 'Piece not found'
		};
	}
	
	// Get current position
	const fromX = piece.position.x;
	const fromZ = piece.position.z;
	
	// Check for valid move (simplistic validation - would be expanded)
	if (fromX === toX && fromZ === toZ) {
		return {
			success: false,
			error: 'Cannot move to the same position'
		};
	}
	
	// Check if destination is in bounds
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 32;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 32;
	
	if (toX < minX || toX > maxX || toZ < minZ || toZ > maxZ) {
		return {
			success: false,
			error: 'Destination is out of bounds'
		};
	}
	
	// Check if destination has a piece of the same player
	const targetKey = `${toX},${toZ}`;
	const targetCell = gameState.board?.cells?.[targetKey];
	let capturedPiece = null;
	
	if (targetCell) {
		// Check for chess piece in cell
		const chessContent = extractCellContent(targetCell, 'chess');
		
		if (chessContent && chessContent.player === piece.player) {
			return {
				success: false,
				error: 'Cannot capture your own piece'
			};
		}
		
		// We might be capturing an opponent's piece
		if (chessContent) {
			// Find the piece in the chessPieces array to remove it
			const pieceIndex = gameState.chessPieces.findIndex(p => 
				p.position.x === toX && p.position.z === toZ
			);
			
			if (pieceIndex >= 0) {
				capturedPiece = gameState.chessPieces[pieceIndex];
				gameState.chessPieces.splice(pieceIndex, 1);
			}
		}
	}
	
	// Update the piece's position
	piece.position.x = toX;
	piece.position.z = toZ;
	piece.hasMoved = true;
	
	// Clear the old cell
	const fromKey = `${fromX},${fromZ}`;
	if (gameState.board?.cells?.[fromKey]) {
		delete gameState.board.cells[fromKey];
	}
	
	// Set the new cell
	if (gameState.board?.cells) {
		gameState.board.cells[targetKey] = {
			type: 'chess',
			player: piece.player,
			pieceType: piece.type,
			chessPiece: {
				type: piece.type,
				player: piece.player
			}
		};
	}
	
	// Update visuals if function provided
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
	
	return {
		success: true,
		piece,
		fromPosition: { x: fromX, z: fromZ },
		toPosition: { x: toX, z: toZ },
		capturedPiece
	};
}

/**
 * Build a 2D representation of the board for easier processing
 * @param {Object} gameState - The current game state
 * @returns {Array} 2D array representing the board
 */
function buildBoardRepresentation(gameState) {
	if (!gameState.board || !gameState.board.cells) {
		console.warn('No valid board data to build representation from');
		return [];
	}
	
	// Determine board boundaries
	const minX = gameState.board.minX || 0;
	const maxX = gameState.board.maxX || 32;
	const minZ = gameState.board.minZ || 0;
	const maxZ = gameState.board.maxZ || 32;
	
	// Create empty 2D array
	const boardWidth = maxX - minX + 1;
	const boardHeight = maxZ - minZ + 1;
	const boardArray = Array(boardHeight).fill(null).map(() => Array(boardWidth).fill(null));
	
	// Fill in cells from the sparse representation
	for (const key in gameState.board.cells) {
		const [x, z] = key.split(',').map(Number);
		
		// Skip invalid coordinates
		if (isNaN(x) || isNaN(z)) continue;
		
		// Adjust coordinates to 0-based array indices
		const arrayX = x - minX;
		const arrayZ = z - minZ;
		
		// Skip if out of bounds (shouldn't happen with properly calculated bounds)
		if (arrayX < 0 || arrayX >= boardWidth || arrayZ < 0 || arrayZ >= boardHeight) continue;
		
		// Add the cell to the array
		boardArray[arrayZ][arrayX] = gameState.board.cells[key];
	}
	
	return boardArray;
}

/**
 * Get valid move sets for a chess piece
 * @param {Object} gameState - The current game state
 * @param {Object} piece - The chess piece
 * @returns {Array} Array of valid move positions {x, z}
 */
function getChessPieceMoveSets(gameState, piece) {
	if (!piece || !piece.position) {
		console.warn('Invalid piece provided to getChessPieceMoveSets');
		return [];
	}
	
	const validMoves = [];
	const currentX = piece.position.x;
	const currentZ = piece.position.z;
	const pieceType = typeof piece.type === 'string' ? piece.type.toUpperCase() : 'PAWN';
	
	// Get board boundaries
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 32;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 32;
	
	// Generate moves based on piece type
	switch (pieceType) {
		case 'KING':
			// Kings move one square in any direction
			for (let dz = -1; dz <= 1; dz++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (dx === 0 && dz === 0) continue; // Skip the current position
					
					const toX = currentX + dx;
					const toZ = currentZ + dz;
					
					// Check bounds
					if (toX < minX || toX > maxX || toZ < minZ || toZ > maxZ) continue;
					
					// Check if destination has own piece
					const key = `${toX},${toZ}`;
					const targetCell = gameState.board?.cells?.[key];
					const chessContent = targetCell ? extractCellContent(targetCell, 'chess') : null;
					
					if (chessContent && chessContent.player === piece.player) continue;
					
					validMoves.push({ x: toX, z: toZ });
				}
			}
			break;
			
		case 'QUEEN':
			// Queens combine rook and bishop movement
			// Horizontal and vertical lines (like a rook)
			addStraightLineMoves(gameState, piece, validMoves, [
				{ dx: 1, dz: 0 },  // Right
				{ dx: -1, dz: 0 },  // Left
				{ dx: 0, dz: 1 },   // Down
				{ dx: 0, dz: -1 }   // Up
			]);
			
			// Diagonal lines (like a bishop)
			addStraightLineMoves(gameState, piece, validMoves, [
				{ dx: 1, dz: 1 },   // Down-right
				{ dx: -1, dz: 1 },  // Down-left
				{ dx: 1, dz: -1 },  // Up-right
				{ dx: -1, dz: -1 }  // Up-left
			]);
			break;
			
		case 'ROOK':
			// Rooks move in straight lines horizontally and vertically
			addStraightLineMoves(gameState, piece, validMoves, [
				{ dx: 1, dz: 0 },  // Right
				{ dx: -1, dz: 0 },  // Left
				{ dx: 0, dz: 1 },   // Down
				{ dx: 0, dz: -1 }   // Up
			]);
			break;
			
		case 'BISHOP':
			// Bishops move in straight diagonal lines
			addStraightLineMoves(gameState, piece, validMoves, [
				{ dx: 1, dz: 1 },   // Down-right
				{ dx: -1, dz: 1 },  // Down-left
				{ dx: 1, dz: -1 },  // Up-right
				{ dx: -1, dz: -1 }  // Up-left
			]);
			break;
			
		case 'KNIGHT':
			// Knights move in L-shape
			const knightOffsets = [
				{ dx: 2, dz: 1 }, { dx: 1, dz: 2 },
				{ dx: -2, dz: 1 }, { dx: -1, dz: 2 },
				{ dx: 2, dz: -1 }, { dx: 1, dz: -2 },
				{ dx: -2, dz: -1 }, { dx: -1, dz: -2 }
			];
			
			for (const offset of knightOffsets) {
				const toX = currentX + offset.dx;
				const toZ = currentZ + offset.dz;
				
				// Check bounds
				if (toX < minX || toX > maxX || toZ < minZ || toZ > maxZ) continue;
				
				// Check if destination has own piece
				const key = `${toX},${toZ}`;
				const targetCell = gameState.board?.cells?.[key];
				const chessContent = targetCell ? extractCellContent(targetCell, 'chess') : null;
				
				if (chessContent && chessContent.player === piece.player) continue;
				
				validMoves.push({ x: toX, z: toZ });
			}
			break;
			
		case 'PAWN':
			// Pawns move forward one square, or diagonally to capture
			// Note: This is simplified and assumes pawns move in +z direction
			// Would need to adjust based on player direction in a real game
			
			const forward = 1; // Assume all pawns move in +z direction
			
			// Forward move
			const forwardX = currentX;
			const forwardZ = currentZ + forward;
			
			// Check if forward move is valid (must be empty)
			if (forwardZ <= maxZ) {
				const forwardKey = `${forwardX},${forwardZ}`;
				const forwardCell = gameState.board?.cells?.[forwardKey];
				
				if (!forwardCell) {
					validMoves.push({ x: forwardX, z: forwardZ });
					
					// First move can be two squares forward
					if (!piece.hasMoved) {
						const doubleForwardZ = currentZ + 2 * forward;
						
						if (doubleForwardZ <= maxZ) {
							const doubleKey = `${forwardX},${doubleForwardZ}`;
							const doubleCell = gameState.board?.cells?.[doubleKey];
							
							if (!doubleCell) {
								validMoves.push({ x: forwardX, z: doubleForwardZ });
							}
						}
					}
				}
			}
			
			// Diagonal captures
			const captureOffsets = [
				{ dx: -1, dz: forward },  // Capture left
				{ dx: 1, dz: forward }    // Capture right
			];
			
			for (const offset of captureOffsets) {
				const captureX = currentX + offset.dx;
				const captureZ = currentZ + offset.dz;
				
				// Check bounds
				if (captureX < minX || captureX > maxX || captureZ < minZ || captureZ > maxZ) continue;
				
				// Check if destination has opponent's piece
				const captureKey = `${captureX},${captureZ}`;
				const captureCell = gameState.board?.cells?.[captureKey];
				const chessContent = captureCell ? extractCellContent(captureCell, 'chess') : null;
				
				if (chessContent && chessContent.player !== piece.player) {
					validMoves.push({ x: captureX, z: captureZ });
				}
			}
			break;
			
		default:
			console.warn(`Unknown piece type: ${pieceType}`);
			break;
	}
	
	return validMoves;
}

/**
 * Helper function to add straight line moves for queens, rooks, and bishops
 * @param {Object} gameState - The game state
 * @param {Object} piece - The chess piece
 * @param {Array} validMoves - Array to add valid moves to
 * @param {Array} directions - Array of direction vectors
 */
function addStraightLineMoves(gameState, piece, validMoves, directions) {
	const currentX = piece.position.x;
	const currentZ = piece.position.z;
	
	// Get board boundaries
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 32;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 32;
	
	// Check each direction
	for (const dir of directions) {
		let toX = currentX + dir.dx;
		let toZ = currentZ + dir.dz;
		
		// Move in this direction until hitting a boundary or piece
		while (toX >= minX && toX <= maxX && toZ >= minZ && toZ <= maxZ) {
			const key = `${toX},${toZ}`;
			const targetCell = gameState.board?.cells?.[key];
			
			if (targetCell) {
				// Check if it's an opponent's piece (can capture)
				const chessContent = extractCellContent(targetCell, 'chess');
				
				if (chessContent) {
					if (chessContent.player !== piece.player) {
						// Can capture opponent's piece
						validMoves.push({ x: toX, z: toZ });
					}
					// Stop after hitting any piece
					break;
				} else {
					// Non-chess cell content (like tetromino block)
					// Many games would stop here, but let's allow movement onto tetromino blocks
					validMoves.push({ x: toX, z: toZ });
				}
			} else {
				// Empty square
				validMoves.push({ x: toX, z: toZ });
			}
			
			// Move to next square in this direction
			toX += dir.dx;
			toZ += dir.dz;
		}
	}
}

/**
 * Select a chess piece for movement
 * @param {Object} gameState - The current game state
 * @param {string|Object} pieceId - ID of the piece or the piece object itself
 * @param {Function} [updateBoardVisuals] - Optional function to update the board visuals
 * @returns {Object} The selected piece or null if not found
 */
function selectChessPiece(gameState, pieceId, updateBoardVisuals) {
	// Clear previous selection
	clearSelection(gameState);
	
	// Find the piece
	const piece = typeof pieceId === 'string' ? 
		findChessPiece(gameState, pieceId) : pieceId;
	
	if (!piece) {
		console.error(`Chess piece with ID ${pieceId} not found`);
		return null;
	}
	
	// Set as selected
	gameState.selectedChessPiece = piece;
	
	// Calculate valid moves
	gameState.validMoves = getChessPieceMoveSets(gameState, piece);
	
	// Update visuals if function provided
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
	
	return piece;
}

/**
 * Move the currently selected chess piece
 * @param {Object} gameState - The current game state
 * @param {number} toX - Destination X coordinate
 * @param {number} toZ - Destination Z coordinate
 * @param {Function} [updateBoardVisuals] - Optional function to update the board visuals
 * @returns {Object} Result of the move operation
 */
function moveSelectedChessPiece(gameState, toX, toZ, updateBoardVisuals) {
	// Ensure a piece is selected
	if (!gameState.selectedChessPiece) {
		return {
			success: false,
			error: 'No chess piece selected'
		};
	}
	
	// Validate the move against validMoves
	const isValidMove = gameState.validMoves &&
		gameState.validMoves.some(move => move.x === toX && move.z === toZ);
	
	if (!isValidMove) {
		return {
			success: false,
			error: 'Invalid move for this piece'
		};
	}
	
	// Move the piece
	const result = moveChessPiece(gameState, gameState.selectedChessPiece, toX, toZ, updateBoardVisuals);
	
	// Clear selection after moving
	if (result.success) {
		clearSelection(gameState);
	}
	
	return result;
}

/**
 * Get all chess pieces for a specific player
 * @param {Object} gameState - The current game state
 * @param {string|number} playerId - The player ID
 * @returns {Array} Array of the player's chess pieces
 */
function getPiecesForPlayer(gameState, playerId) {
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces)) {
		console.warn('No chess pieces found in game state');
		return [];
	}
	
	// Filter pieces by player ID
	const playerPieces = gameState.chessPieces.filter(piece => 
		String(piece.player) === String(playerId)
	);
	
	return playerPieces;
}

function getPieceForPlayer(gameState, playerId, pieceType) {
	const playerPieces = getPiecesForPlayer(gameState, playerId);
	return playerPieces.filter(piece => piece.type.toLowerCase() === pieceType.toLowerCase());
}

function getPlayersKing(gameState, playerId, absoluteCoordinates = false){
	const arrKing = getPieceForPlayer(gameState, playerId, 'king');
	if (arrKing.length === 0) {
		console.warn('No king found for player ' + playerId, gameState);
		return null;
	}
	
	const king = arrKing[0];
	
	if (absoluteCoordinates) {
		// Use the translation function to convert to absolute position
		const absoluteKing = { ...king }; // Clone the king object to avoid modifying the original
		absoluteKing.position = translatePosition(king.position, gameState, true); // Convert to absolute position
		return absoluteKing;
	} else {
		return king; // Return the king with relative coordinates
	}
}


/**
 * Clear the current piece selection
 * @param {Object} gameState - The current game state
 * @param {Function} [updateBoardVisuals] - Optional function to update the board visuals
 */
function clearSelection(gameState) {
	gameState.selectedChessPiece = null;
	gameState.validMoves = [];
}

/**
 * Analyze all possible moves for a player
 * @param {Object} gameState - The current game state
 * @param {string|number} playerId - The player ID
 * @returns {Object} Analysis of possible moves
 */
function analyzePossibleMoves(gameState, playerId) {
	const playerPieces = getPiecesForPlayer(gameState, playerId);
	
	// Get all possible moves for all pieces
	const allMoves = [];
	const piecesWithMoves = [];
	const piecesWithoutMoves = [];
	const captureMoves = [];
	
	for (const piece of playerPieces) {
		const moves = getChessPieceMoveSets(gameState, piece);
		
		if (moves.length > 0) {
			piecesWithMoves.push(piece);
			
			// Add all moves with piece reference
			for (const move of moves) {
				allMoves.push({
					piece,
					move
				});
				
				// Check if this is a capture move
				const key = `${move.x},${move.z}`;
				const targetCell = gameState.board?.cells?.[key];
				const chessContent = targetCell ? extractCellContent(targetCell, 'chess') : null;
				
				if (chessContent && chessContent.player !== piece.player) {
					captureMoves.push({
						piece,
						move,
						targetPiece: chessContent
					});
				}
			}
		} else {
			piecesWithoutMoves.push(piece);
		}
	}
	
	// Return analysis
	return {
		totalPieces: playerPieces.length,
		piecesWithMoves: piecesWithMoves.length,
		piecesWithoutMoves: piecesWithoutMoves.length,
		totalPossibleMoves: allMoves.length,
		possibleCaptures: captureMoves.length,
		hasMoves: allMoves.length > 0,
		allMoves,
		captureMoves,
		movablePieces: piecesWithMoves,
		immobilePieces: piecesWithoutMoves
	};
}

/**
 * Check if a player can capture any opponent pieces
 * @param {Object} gameState - The current game state
 * @param {string|number} playerId - The player ID
 * @returns {boolean} True if the player can capture at least one opponent piece
 */
function canCaptureOpponentPiece(gameState, playerId) {
	const analysis = analyzePossibleMoves(gameState, playerId);
	return analysis.possibleCaptures > 0;
}

/**
 * Synchronizes the visual board with an updated state, handling animations for moved/removed cells
 * @param {Object} gameState - The current game state
 * @param {Object} newBoardState - The new board state to sync with
 * @param {Object} boardGroup - THREE.js group containing board elements
 * @param {Object} chessPiecesGroup - THREE.js group containing chess pieces
 * @param {Object} THREE - THREE.js library
 * @param {Function} animateRemoval - Function to animate cell removal
 * @param {Function} animateMovement - Function to animate cell movement
 * @returns {Object} Stats about the synchronization operation
 */
function synchronizeBoardState(
	gameState, 
	newBoardState, 
	boardGroup, 
	chessPiecesGroup, 
	THREE, 
	animateRemoval, 
	animateMovement
) {
	console.log("Synchronizing board state with updates...");
	const startTime = performance.now();
	
	// Clone current state for comparison
	const currentCells = { ...gameState.board.cells };
	const currentPieces = [...(gameState.chessPieces || [])];
	
	// Track changes for statistics and debugging
	const stats = {
		cellsAdded: 0,
		cellsRemoved: 0,
		cellsMoved: 0,
		piecesAdded: 0,
		piecesRemoved: 0,
		piecesMoved: 0
	};
	
	// First, extract chess pieces from the new board state
	const newPieces = extractChessPiecesFromCells(newBoardState);
	
	// Create a map of current pieces by ID for quick lookup
	const currentPiecesMap = {};
	currentPieces.forEach(piece => {
		// Generate a consistent ID if one doesn't exist
		const pieceId = piece.id || `${piece.player}-${piece.type}-${piece.position.x}-${piece.position.z}`;
		currentPiecesMap[pieceId] = piece;
	});
	
	// Create a map of new pieces by ID
	const newPiecesMap = {};
	newPieces.forEach(piece => {
		const pieceId = piece.id || `${piece.player}-${piece.type}-${piece.position.x}-${piece.position.z}`;
		piece.id = pieceId; // Ensure ID is set
		newPiecesMap[pieceId] = piece;
	});
	
	// Process chess pieces - first find pieces that were removed or moved
	for (const pieceId in currentPiecesMap) {
		const currentPiece = currentPiecesMap[pieceId];
		const newPiece = newPiecesMap[pieceId];
		
		if (!newPiece) {
			// Piece was removed
			console.log(`Piece removed: ${pieceId}`);
			stats.piecesRemoved++;
			
			// Find the visual representation in the chess pieces group
			const pieceObject = chessPiecesGroup.children.find(obj => 
				obj.userData && obj.userData.id === pieceId
			);
			
			if (pieceObject) {
				if (typeof animateRemoval === 'function') {
					// Animate removal if in visual range
					const isInVisualRange = isPositionInVisualRange(
						currentPiece.position.x, 
						currentPiece.position.z, 
						gameState
					);
					
					if (isInVisualRange) {
						animateRemoval(pieceObject, () => {
							// Remove after animation completes
							chessPiecesGroup.remove(pieceObject);
							disposeObject3D(pieceObject);
						});
					} else {
						// Remove immediately if not in visual range
						chessPiecesGroup.remove(pieceObject);
						disposeObject3D(pieceObject);
					}
				} else {
					// No animation function, remove immediately
					chessPiecesGroup.remove(pieceObject);
					disposeObject3D(pieceObject);
				}
			}
		} else if (
			currentPiece.position.x !== newPiece.position.x || 
			currentPiece.position.z !== newPiece.position.z
		) {
			// Piece moved
			console.log(`Piece moved: ${pieceId} from (${currentPiece.position.x}, ${currentPiece.position.z}) to (${newPiece.position.x}, ${newPiece.position.z})`);
			stats.piecesMoved++;
			
			// Find the visual representation
			const pieceObject = chessPiecesGroup.children.find(obj => 
				obj.userData && obj.userData.id === pieceId
			);
			
			if (pieceObject) {
				const isInVisualRange = isPositionInVisualRange(
					currentPiece.position.x, 
					currentPiece.position.z, 
					gameState
				) || isPositionInVisualRange(
					newPiece.position.x, 
					newPiece.position.z, 
					gameState
				);
				
				// Get absolute positions for animation
				const startPos = translatePosition(
					currentPiece.position, 
					gameState, 
					true
				);
				
				const endPos = translatePosition(
					newPiece.position, 
					gameState, 
					true
				);
				
				if (typeof animateMovement === 'function' && isInVisualRange) {
					// Animate movement
					animateMovement(
						pieceObject,
						startPos,
						endPos,
						() => {
							// Update metadata after animation
							pieceObject.userData.position = { ...newPiece.position };
						}
					);
				} else {
					// No animation, update position immediately
					pieceObject.position.set(endPos.x, pieceObject.position.y, endPos.z);
					pieceObject.userData.position = { ...newPiece.position };
				}
			}
		}
	}
	
	// Add new pieces that didn't exist before
	for (const pieceId in newPiecesMap) {
		if (!currentPiecesMap[pieceId]) {
			const newPiece = newPiecesMap[pieceId];
			console.log(`New piece added: ${pieceId} at (${newPiece.position.x}, ${newPiece.position.z})`);
			stats.piecesAdded++;
			
			// Create visual representation for the new piece
			const pieceObject = createChessPiece(
				gameState,
				newPiece.position.x,
				newPiece.position.z,
				newPiece.type,
				newPiece.player,
				gameState.myPlayerId,
				newPiece.orientation,
				THREE
			);
			
			if (pieceObject) {
				// Set the ID in userData
				pieceObject.userData.id = pieceId;
				
				// Add to the chess pieces group
				chessPiecesGroup.add(pieceObject);
				
				// Animate appearance if in visual range
				const isInVisualRange = isPositionInVisualRange(
					newPiece.position.x, 
					newPiece.position.z, 
					gameState
				);
				
				if (isInVisualRange && typeof animateMovement === 'function') {
					// Simple scale-up animation for new pieces
					pieceObject.scale.set(0.01, 0.01, 0.01);
					animateMovement(
						pieceObject,
						null, // No position change
						null,
						null,
						{
							duration: 0.5,
							scaleFrom: { x: 0.01, y: 0.01, z: 0.01 },
							scaleTo: { x: 1, y: 1, z: 1 }
						}
					);
				}
			}
		}
	}
	
	// Now synchronize the board cells
	const currentCellsMap = {};
	for (const key in currentCells) {
		const [x, z] = key.split(',').map(Number);
		const cell = currentCells[key];
		
		// Generate a cell identity using its content
		// This is a simplified approach - a real implementation may need a more robust ID system
		let cellId;
		
		if (Array.isArray(cell)) {
			// Handle array format
			const contentTypes = cell.map(item => item.type).join('-');
			cellId = `cell-${contentTypes}-${key}`;
		} else if (typeof cell === 'object' && cell !== null) {
			// Handle object format
			cellId = `cell-${cell.type || 'unknown'}-${key}`;
		} else {
			// Handle primitive format
			cellId = `cell-${cell}-${key}`;
		}
		
		currentCellsMap[key] = {
			position: { x, z },
			content: cell,
			id: cellId
		};
	}
	
	// Create a map of new cells
	const newCellsMap = {};
	for (const key in newBoardState.cells) {
		const [x, z] = key.split(',').map(Number);
		const cell = newBoardState.cells[key];
		
		// Skip empty cells
		if (cell === null || cell === undefined) continue;
		
		// Generate cell identity
		let cellId;
		if (Array.isArray(cell)) {
			const contentTypes = cell.map(item => item.type).join('-');
			cellId = `cell-${contentTypes}-${key}`;
		} else if (typeof cell === 'object' && cell !== null) {
			cellId = `cell-${cell.type || 'unknown'}-${key}`;
		} else {
			cellId = `cell-${cell}-${key}`;
		}
		
		newCellsMap[key] = {
			position: { x, z },
			content: cell,
			id: cellId
		};
	}
	
	// Detect cells that were removed
	for (const key in currentCellsMap) {
		if (!newCellsMap[key]) {
			// Cell was removed at this position
			const cellInfo = currentCellsMap[key];
			console.log(`Cell removed at position ${key}`);
			stats.cellsRemoved++;
			
			// Find corresponding visual cell
			const cellObject = boardGroup.children.find(obj => 
				obj.userData && 
				obj.userData.type === 'cell' && 
				obj.userData.position && 
				obj.userData.position.x === cellInfo.position.x && 
				obj.userData.position.z === cellInfo.position.z
			);
			
			if (cellObject) {
				const isInVisualRange = isPositionInVisualRange(
					cellInfo.position.x, 
					cellInfo.position.z, 
					gameState
				);
				
				if (typeof animateRemoval === 'function' && isInVisualRange) {
					// Animate removal
					animateRemoval(cellObject, () => {
						boardGroup.remove(cellObject);
						disposeObject3D(cellObject);
					});
				} else {
					// Remove immediately
					boardGroup.remove(cellObject);
					disposeObject3D(cellObject);
				}
			}
		}
	}
	
	// Process cells that need to be added or moved
	for (const key in newCellsMap) {
		const newCellInfo = newCellsMap[key];
		
		// Check if this is a new cell or an existing one
		if (!currentCellsMap[key]) {
			// New cell
			console.log(`New cell added at position ${key}`);
			stats.cellsAdded++;
			
			// Create new visual cell
			// Actual cell creation would depend on your specific implementation
			// This would normally call a createCell function
		} else {
			// Cell exists at this position - check if content changed significantly
			const currentCellInfo = currentCellsMap[key];
			
			// Simple comparison - in a real implementation, you'd want deeper comparison
			// to detect changes in cell properties
			const contentChanged = JSON.stringify(currentCellInfo.content) !== 
				JSON.stringify(newCellInfo.content);
			
			if (contentChanged) {
				console.log(`Cell content changed at position ${key}`);
				
				// Update cell visual representation
				const cellObject = boardGroup.children.find(obj => 
					obj.userData && 
					obj.userData.type === 'cell' && 
					obj.userData.position && 
					obj.userData.position.x === newCellInfo.position.x && 
					obj.userData.position.z === newCellInfo.position.z
				);
				
				if (cellObject) {
					// Update cell material or other visual properties based on new content
					// This would depend on your specific implementation
				}
			}
		}
	}
	
	// Find cells that may have moved to new positions (matching cell IDs at different positions)
	const cellsByIdMap = {};
	
	for (const key in currentCellsMap) {
		const cellInfo = currentCellsMap[key];
		if (!cellsByIdMap[cellInfo.id]) {
			cellsByIdMap[cellInfo.id] = [];
		}
		cellsByIdMap[cellInfo.id].push({
			key,
			info: cellInfo,
			state: 'current'
		});
	}
	
	for (const key in newCellsMap) {
		const cellInfo = newCellsMap[key];
		if (!cellsByIdMap[cellInfo.id]) {
			cellsByIdMap[cellInfo.id] = [];
		}
		cellsByIdMap[cellInfo.id].push({
			key,
			info: cellInfo,
			state: 'new'
		});
	}
	
	// Check for cells that have the same ID but different positions (moved cells)
	for (const id in cellsByIdMap) {
		const cells = cellsByIdMap[id];
		
		if (cells.length === 2 && 
			cells[0].state !== cells[1].state && 
			cells[0].key !== cells[1].key) {
			
			// This cell has moved positions
			const currentCell = cells.find(c => c.state === 'current').info;
			const newCell = cells.find(c => c.state === 'new').info;
			
			console.log(`Cell moved: ${id} from ${cells.find(c => c.state === 'current').key} to ${cells.find(c => c.state === 'new').key}`);
			stats.cellsMoved++;
			
			// Find the visual representation
			const cellObject = boardGroup.children.find(obj => 
				obj.userData && 
				obj.userData.type === 'cell' && 
				obj.userData.position && 
				obj.userData.position.x === currentCell.position.x && 
				obj.userData.position.z === currentCell.position.z
			);
			
			if (cellObject) {
				const isInVisualRange = isPositionInVisualRange(
					currentCell.position.x, 
					currentCell.position.z, 
					gameState
				) || isPositionInVisualRange(
					newCell.position.x, 
					newCell.position.z, 
					gameState
				);
				
				// Get absolute positions for animation
				const startPos = translatePosition(
					currentCell.position, 
					gameState, 
					true
				);
				
				const endPos = translatePosition(
					newCell.position, 
					gameState, 
					true
				);
				
				if (typeof animateMovement === 'function' && isInVisualRange) {
					// Animate movement
					animateMovement(
						cellObject,
						startPos,
						endPos,
						() => {
							// Update metadata after animation
							cellObject.userData.position = { 
								x: newCell.position.x, 
								z: newCell.position.z 
							};
						}
					);
				} else {
					// No animation, update position immediately
					cellObject.position.x = endPos.x;
					cellObject.position.z = endPos.z;
					cellObject.userData.position = { 
						x: newCell.position.x, 
						z: newCell.position.z 
					};
				}
			}
		}
	}
	
	// Update the gameState with the new board and chess pieces
	gameState.board.cells = { ...newBoardState.cells };
	gameState.chessPieces = [...newPieces];
	
	const endTime = performance.now();
	console.log(`Board sync completed in ${(endTime - startTime).toFixed(2)}ms`);
	console.log(`Stats: ${stats.cellsAdded} cells added, ${stats.cellsRemoved} removed, ${stats.cellsMoved} moved`);
	console.log(`Pieces: ${stats.piecesAdded} added, ${stats.piecesRemoved} removed, ${stats.piecesMoved} moved`);
	
	return stats;
}

/**
 * Helper function to check if a position is within the visual range
 * @param {number} x - X coordinate to check
 * @param {number} z - Z coordinate to check
 * @param {Object} gameState - Current game state
 * @returns {boolean} Whether position is in visual range
 */
function isPositionInVisualRange(x, z, gameState) {
	// This is a simplified implementation
	// In a real scenario, you'd check against camera frustum or visible area
	
	// Get board center for reference
	const centreMark = findBoardCentreMarker(gameState);
	const centerX = centreMark.x;
	const centerZ = centreMark.z;
	
	// Define visible range (adjust based on your game's view distance)
	const visualRangeX = 20;
	const visualRangeZ = 20;
	
	// Check if position is within range of center
	return Math.abs(x - centerX) <= visualRangeX && 
		Math.abs(z - centerZ) <= visualRangeZ;
}

/**
 * Helper function to properly dispose THREE.js objects
 * @param {Object} object - THREE.js object to dispose
 */
function disposeObject3D(object) {
	if (!object) return;
	
	// Recursively dispose of child objects
	if (object.children && object.children.length > 0) {
		// Create a copy of the children array to avoid modification during iteration
		const children = object.children.slice();
		children.forEach(child => {
			disposeObject3D(child);
		});
	}
	
	// Dispose of geometries and materials
	if (object.geometry) {
		object.geometry.dispose();
	}
	
	if (object.material) {
		if (Array.isArray(object.material)) {
			object.material.forEach(material => {
				if (material.map) material.map.dispose();
				material.dispose();
			});
		} else {
			if (object.material.map) object.material.map.dispose();
			object.material.dispose();
		}
	}
}

// Export all functions as a module
export const boardFunctions = {

	isTetrominoAdjacentToExistingCells,

	updateBoardCell,
	extractCellContent,
	createBoardCells,
	renderTetromino,
	handleTetrisPhaseClick,
	createChessPiece,
	addChessPiece,
	extractChessPiecesFromCells,
	getPlayerColor,
	renderBoard,
	getAdjacentCells,
	findChessPiece,
	moveChessPiece,
	buildBoardRepresentation,
	getChessPieceMoveSets,
	selectChessPiece,
	moveSelectedChessPiece,
	getPiecesForPlayer,
	clearSelection,
	analyzePossibleMoves,
	canCaptureOpponentPiece,
	debugAdjacencyCheck,
	getPieceForPlayer,
	getPlayersKing,
	synchronizeBoardState,
	isPositionInVisualRange,
	disposeObject3D,
	
	// Re-export translation functions for convenience
	toRelativePosition,
	toAbsolutePosition,
	translatePosition
};


export default boardFunctions;
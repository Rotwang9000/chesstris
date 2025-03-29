import { boardFunctions } from './boardFunctions.js';
import { findBoardCentreMarker } from './centreBoardMarker.js';
import chessPieceCreator from './chessPieceCreator.js';
import { getTHREE } from './enhanced-gameCore.js';
import { highlightSinglePiece, setChessPiecesGroup } from './pieceHighlightManager.js';
import { createCentreMarker } from './centreBoardMarker.js';


// Add a timer to track when chess pieces were last updated
let lastChessPiecesUpdate = 0;
let baseUpdateInterval = 250; // Base milliseconds between updates
let CHESS_PIECES_UPDATE_INTERVAL = baseUpdateInterval; // Current interval, may increase on errors
let consecutiveErrors = 0; // Track consecutive errors to adjust the update frequency
const MAX_CONSECUTIVE_ERRORS = 5; // After this many errors, log more details
const ERROR_BACKOFF_MULTIPLIER = 2; // Multiply interval by this amount when errors occur
const MAX_UPDATE_INTERVAL = 2000; // Maximum milliseconds between updates

// Error tracking
let lastErrorTime = 0;
let lastErrorMessage = '';
let errorCount = 0;

// Change detection
let lastChessPiecesHash = ''; // Hash of the last processed pieces
let lastUpdateReason = ''; // Reason for the last update
let forcedUpdateCounter = 0; // Force update every N intervals regardless of changes

export function updateChessPieces(chessPiecesGroup, camera, gameState) {
	// Rate-limit updates to reduce performance impact
	const now = Date.now();
	if (now - lastChessPiecesUpdate < CHESS_PIECES_UPDATE_INTERVAL) {
		return; // Skip if called too soon after previous update
	}
	
	// Only process if there are actual changes to the pieces
	// Generate a simple hash of the current chess pieces
	let currentHash = '';
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		// Create a hash based on critical properties of each piece
		currentHash = gameState.chessPieces.map(piece => {
			if (!piece) return '';
			return `${piece.id}-${piece.type}-${piece.player}-${piece.x}-${piece.z}`;
		}).sort().join('|');
	}
	
	// Force update every 10 intervals (about 2.5 seconds) even without changes
	// This ensures we handle any external changes that our hash doesn't detect
	const forcedUpdate = (++forcedUpdateCounter >= 10);
	
	// Skip update if the pieces haven't changed and this isn't a forced update
	if (currentHash === lastChessPiecesHash && !forcedUpdate) {
		return;
	}
	
	// Reset force counter on actual updates
	if (forcedUpdate) {
		forcedUpdateCounter = 0;
		lastUpdateReason = 'forced periodic update';
	} else if (currentHash !== lastChessPiecesHash) {
		lastUpdateReason = 'chess pieces changed';
		// Update our hash
		lastChessPiecesHash = currentHash;
	}
	
	// Now we'll proceed with the update since there are changes
	lastChessPiecesUpdate = now;

	// Get THREE safely
	let THREE;
	try {
		THREE = getTHREE();
		// Verify THREE is valid
		if (!THREE) {
			console.error('THREE.js not available in updateChessPieces');
			handleUpdateError(new Error('THREE.js not available'));
			return;
		}
	} catch (err) {
		console.error('Error getting THREE reference:', err);
		handleUpdateError(err);
		return;
	}

	// Safely verify the chess pieces group exists before continuing
	if (!chessPiecesGroup) {
		console.error('Chess pieces group is undefined in updateChessPieces');
		handleUpdateError(new Error('Chess pieces group is undefined'));
		return;
	}
	
	// Set the chessPiecesGroup in the highlight manager
	try {
		setChessPiecesGroup(chessPiecesGroup);
	} catch (err) {
		console.error('Error setting chess pieces group in highlight manager:', err);
		handleUpdateError(err);
	}

	// Only log during debug mode or first run
	const isFirstRun = !chessPiecesGroup?.userData?.initialized;

	// Mark as initialized 
	if (!chessPiecesGroup.userData) {
		chessPiecesGroup.userData = {};
	}
	chessPiecesGroup.userData.initialized = true;

	if (isFirstRun || gameState.debugMode) {
		console.log(`Updating chess pieces visuals (reason: ${lastUpdateReason})`);
	}

	// If we've had too many consecutive errors, reduce update frequency
	if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
		console.warn(`Chess pieces update experiencing ${consecutiveErrors} consecutive errors, throttling updates`);
	}

	try {
		// Safety check - ensure the group has a children array
		if (!chessPiecesGroup.children) {
			console.error('Chess pieces group has no children array');
			chessPiecesGroup.children = [];
			handleUpdateError(new Error('Chess pieces group has no children array'));
			return;
		}

		// Create a map of existing pieces by ID for quick lookup
		const existingPieceMap = {};
		chessPiecesGroup.children.forEach(piece => {
			if (piece && piece.userData && piece.userData.id) {
				existingPieceMap[piece.userData.id] = piece;
			}
		});

		// Extract pieces data - first look in gameState.chessPieces
		let chessPieces = [];

		if (gameState.chessPieces && Array.isArray(gameState.chessPieces) && gameState.chessPieces.length > 0) {
			// Use the pre-extracted pieces from boardFunctions
			chessPieces = gameState.chessPieces;
			if (isFirstRun || gameState.debugMode) {
				console.log(`Using ${chessPieces.length} pre-extracted chess pieces`);
			}
		} else {
			// Otherwise extract chess pieces from board cells using the centralized function
			chessPieces = boardFunctions.extractChessPiecesFromCells(gameState);
			
			// Store them for future use
			gameState.chessPieces = chessPieces;
			
			if (isFirstRun || gameState.debugMode) {
				console.log(`Extracted ${chessPieces.length} chess pieces from board cells using centralized function`);
			}
		}

		// Quick safety check - if we have no chess pieces, stop processing
		if (!chessPieces || chessPieces.length === 0) {
			if (isFirstRun || gameState.debugMode) {
				console.warn('No chess pieces to render, skipping update');
			}
			return;
		}

		// Create/update visual pieces
		if (isFirstRun || gameState.debugMode) {
			console.log(`Processing ${chessPieces.length} chess pieces`, chessPieces.slice(0, 2));
		}

		// Keep track of which pieces we've processed to remove any that are no longer needed
		const processedPieceIds = new Set();
		let piecesCreated = 0;
		let piecesReused = 0;

		// Reset the group position to origin - this is critical!
		// The board cells are positioned directly at their coordinates without any group offset
		chessPiecesGroup.position.set(0, 0, 0);

		// Find the board centre marker for accurate positioning - CRITICAL for alignment with cells
		const centreMark = findBoardCentreMarker(gameState);

		// Always ensure we have a valid centre marker
		if (!centreMark && gameState.board) {
			console.error('Centre marker not found! Creating a new one');
			// Use the createCentreMarker function to properly initialize it
			createCentreMarker(gameState);
		}

		// Use the centre marker or fall back to reasonable defaults
		const centreX = centreMark?.x ?? 4;
		const centreZ = centreMark?.z ?? 4;

		console.log(`Using board centre at (${centreX}, ${centreZ}) for chess piece positioning`);

		chessPieces.forEach(piece => {
			try {
				// Skip invalid pieces
				if (!piece || !piece.position) {
					console.warn('Skipping invalid chess piece:', piece);
					return;
				}

				// Ensure player is always defined and represented consistently
				if (piece.player === undefined || piece.player === null) {
					piece.player = 'unknown';
				}

				// Generate a consistent ID for the piece
				const pieceId = piece.id || `${piece.player}-${piece.type}-${piece.position.x}-${piece.position.z}`;
				processedPieceIds.add(pieceId);

				// Get the position and orientation of the piece
				const { x, z } = piece.position;
				const orientation = piece.orientation || 0;
				
				// Check if we already have this piece at this location
				const existingPiece = existingPieceMap[pieceId];
				let pieceMesh;

				// If the piece exists and hasn't moved, reuse it
				if (existingPiece) {
					// Update color/appearance if needed
					const newColor = getChessPieceColor(piece, gameState);
					const newType = getChessPieceType(piece);
					
					// Check if the type or color has changed
					if (existingPiece.userData.type !== newType || existingPiece.userData.color !== newColor) {
						// Need to recreate with new appearance
						chessPiecesGroup.remove(existingPiece);
						
						// Create new piece - clear materials for proper garbage collection
						if (existingPiece.material) {
							if (Array.isArray(existingPiece.material)) {
								existingPiece.material.forEach(mat => mat && mat.dispose());
							} else {
								existingPiece.material.dispose();
							}
						}
						
						// Dispose of geometry
						if (existingPiece.geometry) existingPiece.geometry.dispose();

						// Create a new piece with updated appearance
						pieceMesh = chessPieceCreator.createPiece(newType, newColor, orientation, THREE);
						
						pieceMesh.userData = {
							...piece,
							id: pieceId,
							color: newColor,
							type: newType
						};
						
						// Calculate position relative to centre marker - CRITICAL for alignment
						const adjustX = x - centreX;
						const adjustZ = z - centreZ;
						
						pieceMesh.position.set(adjustX, 0, adjustZ);
						chessPiecesGroup.add(pieceMesh);
						
						piecesCreated++;
					} else {
						// Just update position if needed
						const adjustX = x - centreX;
						const adjustZ = z - centreZ;
						
						if (existingPiece.position.x !== adjustX || existingPiece.position.z !== adjustZ) {
							existingPiece.position.set(adjustX, 0, adjustZ);
						}

						piecesReused++;
					}
				} else {
					// Create a new piece mesh
					const pieceColor = getChessPieceColor(piece, gameState);
					const pieceType = getChessPieceType(piece);
					
					// For debugging
					console.log(`Creating chess piece: ${pieceType} for player ${piece.player}, color: ${pieceColor.toString(16)}, at position (${x}, ${z})`);
					
					// Generate a player identifier
					const playerIdentifier = piece.player;
					
					// Try to use direct creation with color
					try {
						// Create piece with explicit color
						pieceMesh = chessPieceCreator.createPiece(pieceType, pieceColor, orientation, THREE);
					} catch (err) {
						console.warn('Error creating piece with color, falling back to getChessPiece:', err);
						// Fall back to regular getChessPiece
						pieceMesh = chessPieceCreator.getChessPiece(pieceType, playerIdentifier);
					}
					
					// Specifically check if this piece is valid with a material before adding it
					if (!pieceMesh) {
						console.error(`Failed to create chess piece: ${pieceType} for player ${piece.player}`);
						return;
					}
					
					// Check if any meshes inside this piece group have materials
					let hasMaterial = false;
					if (pieceMesh.traverse) {
						pieceMesh.traverse(child => {
							if (child && child.isMesh && child.material) {
								hasMaterial = true;
							}
						});
					}

					// If no material found, we need to add a fallback material to at least one mesh
					if (!hasMaterial) {
						console.warn(`Chess piece has no materials: ${pieceType} for player ${piece.player}, adding fallback material`);
						
						// Create a fallback material
						const fallbackMaterial = new THREE.MeshStandardMaterial({
							color: pieceColor,
							roughness: 0.7,
							metalness: 0.3
						});
						
						// Try to add it to the main mesh if there is one
						let materialAdded = false;
						if (pieceMesh.children && pieceMesh.children.length > 0) {
							// Find the first mesh we can add a material to
							pieceMesh.traverse(child => {
								if (!materialAdded && child && child.isMesh) {
									child.material = fallbackMaterial;
									child.material.needsUpdate = true;
									child.visible = true;
									materialAdded = true;
								}
							});
						}
						
						// If we couldn't add to any child, add to the piece itself
						if (!materialAdded) {
							pieceMesh.material = fallbackMaterial;
						}
					}
					
					// Set up piece metadata
					pieceMesh.userData = {
						id: pieceId,
						type: 'chessPiece',
						pieceType: pieceType,
						player: piece.player,
						position: { x, z },
						color: pieceColor
					};
					
					// Add to the chess pieces group
					chessPiecesGroup.add(pieceMesh);
					piecesCreated++;
				}

				// Position piece correctly relative to the center of the board
				if (pieceMesh) {
					// CRITICAL FIX: Use relative positioning with the center marker
					const adjustX = x - centreX;
					const adjustZ = z - centreZ;
					
					pieceMesh.position.x = adjustX;
					pieceMesh.position.z = adjustZ;
					pieceMesh.position.y = 0.5; // Half-height above cell
					
					
					// For orientation 0(facing up): main pieces at bottom, pawns above
					// For orientation 2(facing down): main pieces at top, pawns below
					// For orientation 1(facing right): main pieces at left, pawns to right
					// For orientation 3(facing left): main pieces at right, pawns to left

					if(piece.orientation) { 
						// Use Y-axis rotation to rotate pieces horizontally rather than tipping them over
						pieceMesh.rotation.y = piece.orientation * Math.PI / 2;
					}

					// Ensure the scale is appropriate
					if (!pieceMesh.userData.scaleSet) {
						pieceMesh.scale.set(0.8, 0.8, 0.8);
						pieceMesh.userData.scaleSet = true;
					}
					
					// Update the userData with new position
					pieceMesh.userData.position = { x, z };
					
					// Make sure piece is visible
					pieceMesh.visible = true;
					
					// Log positioning for debugging
					// console.log(`Piece positioned at (${adjustX}, ${adjustZ}) relative to centre (${centreX}, ${centreZ})`);
					
					// Ensure materials are properly set and rendered
					if (pieceMesh.material) {
						// Make sure material has basic properties
						if (typeof pieceMesh.material === 'object' && pieceMesh.material !== null) {
							if (typeof pieceMesh.material.needsUpdate !== 'undefined') {
								pieceMesh.material.needsUpdate = true;
							}
							pieceMesh.material.transparent = false;
							pieceMesh.material.opacity = 1.0;
						}
					}
					
					// Enable shadows for better visuals
					pieceMesh.castShadow = true;
					pieceMesh.receiveShadow = true;
					
					// Make sure all child meshes are visible and have proper materials
					if (pieceMesh.traverse && typeof pieceMesh.traverse === 'function') {
						pieceMesh.traverse(child => {
							if (child && child.isMesh) {
								child.visible = true;
								child.castShadow = true;
								child.receiveShadow = true;
								
								if (child.material) {
									// Check if the material is actually an object and not a primitive value
									if (typeof child.material === 'object' && child.material !== null) {
										if (typeof child.material.needsUpdate !== 'undefined') {
											child.material.needsUpdate = true;
										}
										child.material.transparent = false;
										child.material.opacity = 1.0;
									}
								}
							}
						});
					}
					
					// Apply hover highlight if needed
					if (gameState.hoveredPlayer &&
						(String(gameState.hoveredPlayer) === String(piece.player)) &&
						typeof highlightSinglePiece === 'function') {
						try {
							highlightSinglePiece(pieceMesh);
						} catch (highlightErr) {
							console.error('Error highlighting piece:', highlightErr);
						}
					}
				}
			} catch (pieceErr) {
				console.error('Error processing chess piece:', pieceErr);
			}
		});

		// Remove any pieces that are no longer in the game
		// Create a copy of the array to avoid modification during iteration
		const currentPieces = [...chessPiecesGroup.children];
		let piecesRemoved = 0;

		currentPieces.forEach(pieceMesh => {
			try {
				if (pieceMesh && pieceMesh.userData && pieceMesh.userData.id) {
					// If the piece is not in the processed set, remove it
					if (!processedPieceIds.has(pieceMesh.userData.id)) {
						chessPiecesGroup.remove(pieceMesh);
						// Dispose of geometries and materials
						if (pieceMesh.geometry) pieceMesh.geometry.dispose();
						if (pieceMesh.material) {
							if (Array.isArray(pieceMesh.material)) {
								pieceMesh.material.forEach(m => m.dispose());
							} else {
								pieceMesh.material.dispose();
							}
						}
						piecesRemoved++;
					}
				} else {
					// Remove any invalid pieces
					chessPiecesGroup.remove(pieceMesh);
					piecesRemoved++;
				}
			} catch (removeErr) {
				console.error('Error removing chess piece:', removeErr);
			}
		});

		// If we're here due to a forced update but nothing actually changed,
		// we can skip the verbose logging at the end
		const skipDetailedLogging = forcedUpdate && piecesCreated === 0 && piecesRemoved === 0;

		// if ((isFirstRun || gameState.debugMode || piecesCreated > 0 || piecesRemoved > 0) 
		// 	&& !skipDetailedLogging) {
		// 	console.log(`Chess pieces updated: ${piecesCreated} created, ${piecesReused} reused, ${piecesRemoved} removed`);
		// }
		
		// If we get here without errors, reset error tracking
		resetErrorTracking();
	} catch (error) {
		console.error('Error in updateChessPieces:', error);
		handleUpdateError(error);
	}
}

/**
 * Handle update errors and adjust update frequency
 * @param {Error} error - The error that occurred
 */
function handleUpdateError(error) {
	const now = Date.now();
	
	// Track error types
	const errorMsg = error.message || 'Unknown error';
	
	// Check if this is the same error as before
	if (errorMsg === lastErrorMessage) {
		errorCount++;
	} else {
		// New error type
		lastErrorMessage = errorMsg;
		errorCount = 1;
	}
	
	// Increment consecutive errors
	consecutiveErrors++;
	
	// Only log full details periodically to avoid console spam
	if (now - lastErrorTime > 5000 || consecutiveErrors % 10 === 0) {
		console.error(`Chess pieces update error (${consecutiveErrors} consecutive, ${errorCount} of this type): ${errorMsg}`);
		lastErrorTime = now;
	}
	
	// Increase the update interval to reduce error frequency
	if (consecutiveErrors > 3) {
		CHESS_PIECES_UPDATE_INTERVAL = Math.min(
			CHESS_PIECES_UPDATE_INTERVAL * ERROR_BACKOFF_MULTIPLIER,
			MAX_UPDATE_INTERVAL
		);
		console.warn(`Increasing chess pieces update interval to ${CHESS_PIECES_UPDATE_INTERVAL}ms due to errors`);
	}
}

/**
 * Reset error tracking when updates succeed
 */
function resetErrorTracking() {
	if (consecutiveErrors > 0) {
		consecutiveErrors = 0;
		// Gradually reduce the update interval back to base level
		if (CHESS_PIECES_UPDATE_INTERVAL > baseUpdateInterval) {
			CHESS_PIECES_UPDATE_INTERVAL = Math.max(
				baseUpdateInterval,
				CHESS_PIECES_UPDATE_INTERVAL / ERROR_BACKOFF_MULTIPLIER
			);
		}
	}
}

/**
 * Get the color for a chess piece
 * @param {Object} piece - The chess piece data
 * @param {Object} gameState - The current game state
 * @returns {number} - The color as a hexadecimal number
 */
function getChessPieceColor(piece, gameState) {

	return boardFunctions.getPlayerColor(piece.player, gameState, false);

	// If piece has an explicit color, use it
	if (piece.color && piece.color !== 0xcccccc) {
		return piece.color;
	}
	
	// Use the centralized color function for consistent colors
	if (boardFunctions && typeof boardFunctions.getPlayerColor === 'function') {
		// Pass false for forTetromino flag since this is a chess piece
		return boardFunctions.getPlayerColor(piece.player, gameState, false);
	}
	
	// Fallback if the centralized function isn't available
	// Always color current player pieces as red
	if (gameState && gameState.currentPlayer && String(piece.player) === String(gameState.currentPlayer)) {
		return 0xAA0000; // Red for current player's pieces
	}
	
	// Player 1 is usually white
	if (String(piece.player) === '1') {
		return 0xf0f0f0; // White
	} 
	// Player 2 is usually black
	else if (String(piece.player) === '2') {
		return 0x222222; // Black
	}
	
	// Convert player ID to a deterministic color
	const playerId = String(piece.player);
	// Simple hash function
	let hash = 0;
	for (let i = 0; i < playerId.length; i++) {
		hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
	}
	// Use the hash to generate RGB values, but ensure blue/green dominance
	const r = Math.min(80, (hash & 0xFF0000) >> 16); // Keep red low
	const g = 100 + Math.min(155, (hash & 0x00FF00) >> 8); // Medium to high green
	const b = 150 + Math.min(105, hash & 0x0000FF); // Medium to high blue
	return (r << 16) | (g << 8) | b;
}

/**
 * Get the type of chess piece with consistent naming
 * @param {Object} piece - The chess piece data
 * @returns {string} - The standardized piece type
 */
function getChessPieceType(piece) {
	// Normalize piece type to uppercase
	const pieceType = (piece.type || 'PAWN').toUpperCase();
	
	// Map any variant names to standard names
	const typeMap = {
		'P': 'PAWN',
		'R': 'ROOK',
		'N': 'KNIGHT',
		'B': 'BISHOP',
		'Q': 'QUEEN',
		'K': 'KING'
	};
	
	return typeMap[pieceType] || pieceType;
}


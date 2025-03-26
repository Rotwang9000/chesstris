import { boardFunctions } from './boardFunctions';
import { findBoardCentreMarker } from './centreBoardMarker';
import { getChessPiece } from './chessPieceCreator';
import { getTHREE } from './enhanced-gameCore';

// Get THREE from the getter function
const THREE = getTHREE();

// Add a timer to track when chess pieces were last updated
let lastChessPiecesUpdate = 0;
const CHESS_PIECES_UPDATE_INTERVAL = 250; // Milliseconds between updates

export function updateChessPieces(chessPiecesGroup, camera, gameState) {
	// Rate-limit updates to reduce performance impact
	const now = Date.now();
	if (now - lastChessPiecesUpdate < CHESS_PIECES_UPDATE_INTERVAL) {
		return; // Skip if called too soon after previous update
	}
	lastChessPiecesUpdate = now;

	// Only log during debug mode or first run
	const isFirstRun = !chessPiecesGroup?.userData?.initialized;

	// Ensure the group is valid before proceeding
	if (!chessPiecesGroup) {
		console.error('Chess pieces group is not initialized, cannot update chess pieces');
		return;
	}

	// Mark as initialized 
	if (!chessPiecesGroup.userData) {
		chessPiecesGroup.userData = {};
	}
	chessPiecesGroup.userData.initialized = true;

	if (isFirstRun || gameState.debugMode) {
		console.log('Updating chess pieces visuals');
	}

	try {
		// Safety check - ensure the group has a children array
		if (!chessPiecesGroup.children) {
			console.error('Chess pieces group has no children array');
			chessPiecesGroup.children = [];
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
			// Otherwise manually extract from board cells - legacy method
			// Check if we have valid board data
			if (gameState.board && gameState.board.cells) {
				// Iterate through all cells to find chess pieces
				for (const key in gameState.board.cells) {
					try {
						const [x, z] = key.split(',').map(Number);

						// Get cell content
						const cellData = gameState.board.cells[key];

						// Ensure boardFunctions is available
						if (!boardFunctions || !boardFunctions.extractCellContent) {
							console.warn('boardFunctions.extractCellContent is not available');
							continue;
						}

						// Extract chess content using the new helper function
						const chessContent = boardFunctions.extractCellContent(cellData, 'chess');

						// If chess piece content exists, extract it for rendering
						if (chessContent) {
							const pieceId = chessContent.pieceId ||
								`${chessContent.player}-${chessContent.chessPiece?.type || 'PAWN'}-${x}-${z}`;

							chessPieces.push({
								id: pieceId,
								position: { x, z },
								type: chessContent.pieceType || "PAWN",
								player: chessContent.player || 1,
								color: chessContent.color || 0xcccccc
							});
						}
					} catch (cellErr) {
						console.error('Error processing board cell:', cellErr);
					}
				}
				if (isFirstRun || gameState.debugMode) {
					console.log(`Extracted ${chessPieces.length} chess pieces from board cells`);
				}
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
		const centreMarker = findBoardCentreMarker(gameState);

		// Always ensure we have a valid centre marker
		if (!centreMarker && gameState.board) {
			console.error('Centre marker not found! Creating a new one');
			// Force create a centre marker in case it doesn't exist
			gameState.board.centreMarker = {
				x: Math.floor((gameState.boardBounds?.minX || 0 + gameState.boardBounds?.maxX || 20) / 2),
				z: Math.floor((gameState.boardBounds?.minZ || 0 + gameState.boardBounds?.maxZ || 20) / 2)
			};
		}

		// Use the centre marker or fall back to reasonable defaults
		const centreX = centreMarker?.x ?? 8;
		const centreZ = centreMarker?.z ?? 8;

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

				// Check if we already have this piece at this location
				const existingPiece = existingPieceMap[pieceId];

				// If the piece exists and hasn't moved, reuse it
				if (existingPiece &&
					existingPiece.userData &&
					existingPiece.userData.position &&
					existingPiece.userData.position.x === x &&
					existingPiece.userData.position.z === z) {

					// Update player info in userData
					existingPiece.userData.player = piece.player;

					// Piece hasn't changed, just make sure it's visible
					existingPiece.visible = true;

					// Apply hover highlight if needed
					if (gameState.hoveredPlayer &&
						(String(gameState.hoveredPlayer) === String(piece.player)) &&
						typeof highlightSinglePiece === 'function') {
						try {
							highlightSinglePiece(existingPiece);
						} catch (highlightErr) {
							console.error('Error highlighting piece:', highlightErr);
						}
					}

					piecesReused++;
					return;
				}

				// Create a new chess piece or update existing one
				let chessPieceMesh;

				if (existingPiece) {
					// Reuse existing mesh but update its position
					chessPieceMesh = existingPiece;
					piecesReused++;
				} else {
					// Create a new piece mesh
					const pieceColor = getChessPieceColor(piece);
					const pieceType = getChessPieceType(piece);
					
					// Determine if this is the local player's piece
					const isLocalPlayer = String(piece.player) === String(gameState.localPlayerId);
					const playerIdentifier = isLocalPlayer ? 'self' : 'other';
					
					console.log(`Creating new ${pieceType} for player ${piece.player} (${playerIdentifier}) with color ${pieceColor.toString(16)}`);
					
					// Get piece from the chess piece creator
					chessPieceMesh = getChessPiece(pieceType, playerIdentifier);
					
					if (!chessPieceMesh) {
						console.error(`Failed to create chess piece: ${pieceType} for player ${piece.player}`);
						return;
					}
					
					// Set up piece metadata
					chessPieceMesh.userData = {
						id: pieceId,
						type: 'chessPiece',
						pieceType: pieceType,
						player: piece.player,
						position: { x, z },
						color: pieceColor
					};
					
					// Add to the chess pieces group
					chessPiecesGroup.add(chessPieceMesh);
					piecesCreated++;
				}

				// Position piece correctly relative to the center of the board
				chessPieceMesh.position.x = x;
				chessPieceMesh.position.z = z;
				chessPieceMesh.position.y = 0.5; // Half-height above cell
				
				// Ensure the piece is properly rotated to face the correct direction
				// Black pieces (player 2) face the opposite direction of white pieces
				if (String(piece.player) === '2') {
					chessPieceMesh.rotation.y = Math.PI; // 180 degrees
				} else {
					chessPieceMesh.rotation.y = 0;
				}
				
				// Ensure the scale is appropriate
				if (!chessPieceMesh.userData.scaleSet) {
					chessPieceMesh.scale.set(0.8, 0.8, 0.8);
					chessPieceMesh.userData.scaleSet = true;
				}
				
				// Update the userData with new position
				chessPieceMesh.userData.position = { x, z };
				
				// Make sure piece is visible
				chessPieceMesh.visible = true;
				
				// Ensure materials are properly set and rendered
				if (chessPieceMesh.material) {
					// Make sure material has basic properties
					if (typeof chessPieceMesh.material.needsUpdate !== 'undefined') {
						chessPieceMesh.material.needsUpdate = true;
					}
					chessPieceMesh.material.transparent = false;
					chessPieceMesh.material.opacity = 1.0;
				}
				
				// Enable shadows for better visuals
				chessPieceMesh.castShadow = true;
				chessPieceMesh.receiveShadow = true;
				
				// Make sure all child meshes are visible and have proper materials
				chessPieceMesh.traverse(child => {
					if (child.isMesh) {
						child.visible = true;
						child.castShadow = true;
						child.receiveShadow = true;
						
						if (child.material) {
							child.material.needsUpdate = true;
							child.material.transparent = false;
							child.material.opacity = 1.0;
						}
					}
				});
				
				// Apply hover highlight if needed
				if (gameState.hoveredPlayer && 
					(String(gameState.hoveredPlayer) === String(piece.player)) &&
					typeof highlightSinglePiece === 'function') {
					try {
						highlightSinglePiece(chessPieceMesh);
					} catch (highlightErr) {
						console.error('Error highlighting piece:', highlightErr);
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

		if (isFirstRun || gameState.debugMode || piecesCreated > 0 || piecesRemoved > 0) {
			console.log(`Chess pieces updated: ${piecesCreated} created, ${piecesReused} reused, ${piecesRemoved} removed`);
		}
	} catch (error) {
		console.error('Error in updateChessPieces:', error);
	}
}

/**
 * Get the appropriate color for a chess piece
 * @param {Object} piece - The chess piece data
 * @returns {number} - The color as a hexadecimal number
 */
function getChessPieceColor(piece) {
	// Process player color setting
	let pieceColor = 0xeeeeee; // Default to light gray
	
	// Player 1 is usually white
	if (String(piece.player) === '1') {
		pieceColor = 0xf0f0f0; // White
	} 
	// Player 2 is usually black
	else if (String(piece.player) === '2') {
		pieceColor = 0x222222; // Black
	}
	// If the piece has an explicit color, use it
	else if (piece.color) {
		pieceColor = piece.color;
	}
	// Otherwise use player ID to determine color
	else {
		// Convert player ID to a deterministic color
		const playerId = String(piece.player);
		// Simple hash function
		let hash = 0;
		for (let i = 0; i < playerId.length; i++) {
			hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
		}
		// Use the hash to generate RGB values
		const r = (hash & 0xFF0000) >> 16;
		const g = (hash & 0x00FF00) >> 8;
		const b = hash & 0x0000FF;
		pieceColor = (r << 16) | (g << 8) | b;
	}
	
	return pieceColor;
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

/**
 * Highlight a chess piece
 * @param {Object} piece - The piece to highlight
 * @param {boolean} isHighlighted - Whether to highlight or unhighlight
 */
function highlightChessPiece(piece, isHighlighted) {
	if (!piece) return;

	// Handle array of pieces
	if (Array.isArray(piece)) {
		piece.forEach(p => highlightChessPiece(p, isHighlighted));
		return;
	}

	// Skip if the piece doesn't have a material
	if (!piece.material) return;

	// Store original material if not already stored
	if (isHighlighted && !piece.userData.originalMaterial) {
		piece.userData.originalMaterial = piece.material.clone();
	}

	if (isHighlighted) {
		// Apply highlight material
		const highlightMaterial = new THREE.MeshBasicMaterial({
			color: 0xffff00,
			transparent: true,
			opacity: 0.8
		});
		piece.material = highlightMaterial;
	} else {
		// Restore original material
		if (piece.userData.originalMaterial) {
			piece.material.dispose();
			piece.material = piece.userData.originalMaterial;
			delete piece.userData.originalMaterial;
		}
	}
}

/**
 * Highlight all pieces belonging to a specific player
 * @param {string} playerId - Player ID
 */
export function highlightPlayerPieces(playerId) {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;

	// Apply highlight to matching pieces
	chessPiecesGroup.children.forEach(piece => {
		if (piece.userData && String(piece.userData.player) === String(playerId)) {
			highlightSinglePiece(piece);
		}
	});
}

/**
 * Remove highlights from all chess pieces
 */
export function removePlayerPiecesHighlight() {
	// If no chess pieces group, return
	if (!chessPiecesGroup) return;

	// Remove highlights from all pieces
	chessPiecesGroup.children.forEach(piece => {
		// Clean up previous highlight elements
		const existingHighlight = piece.getObjectByName('hover-highlight');
		const existingGlow = piece.getObjectByName('hover-glow');

		// Remove animations
		if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
			if (window._highlightAnimations) {
				const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
				if (index > -1) {
					window._highlightAnimations.splice(index, 1);
				}
			}
		}

		// Remove meshes
		if (existingHighlight) {
			piece.remove(existingHighlight);
			if (existingHighlight.geometry) existingHighlight.geometry.dispose();
			if (existingHighlight.material) existingHighlight.material.dispose();
		}

		if (existingGlow) {
			piece.remove(existingGlow);
			if (existingGlow.geometry) existingGlow.geometry.dispose();
			if (existingGlow.material) existingGlow.material.dispose();
		}

		// Reset scale
		piece.scale.set(1, 1, 1);
	});
}

/**
 * Highlight a single chess piece with a hover effect
 */
export function highlightSinglePiece(piece) {
	// Safety check - if piece is null or undefined, don't proceed
	if (!piece) {
		console.warn('Attempted to highlight null/undefined piece');
		return;
	}

	// Clean up previous highlight elements if they exist
	const existingHighlight = piece.getObjectByName('hover-highlight');
	const existingGlow = piece.getObjectByName('hover-glow');

	// Remove old elements from animation loop first
	if (existingHighlight && existingHighlight.userData && existingHighlight.userData.animation) {
		if (window._highlightAnimations) {
			const index = window._highlightAnimations.indexOf(existingHighlight.userData.animation);
			if (index > -1) {
				window._highlightAnimations.splice(index, 1);
			}
		}
	}

	// Remove old highlight meshes
	if (existingHighlight) {
		piece.remove(existingHighlight);
		if (existingHighlight.geometry) existingHighlight.geometry.dispose();
		if (existingHighlight.material) existingHighlight.material.dispose();
	}

	if (existingGlow) {
		piece.remove(existingGlow);
		if (existingGlow.geometry) existingGlow.geometry.dispose();
		if (existingGlow.material) existingGlow.material.dispose();
	}

	// Create new highlight
	try {
		const geometry = new THREE.RingGeometry(0.5, 0.6, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide
		});

		const highlight = new THREE.Mesh(geometry, material);
		highlight.name = 'hover-highlight';
		highlight.rotation.x = -Math.PI / 2; // Lay flat
		highlight.position.y = -0.65; // Positioned below the piece, adjusted for new height

		// Create glow effect - add a larger, fainter ring
		const glowGeometry = new THREE.RingGeometry(0.7, 0.9, 32);
		const glowMaterial = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.3,
			side: THREE.DoubleSide
		});
		const glow = new THREE.Mesh(glowGeometry, glowMaterial);
		glow.name = 'hover-glow';
		glow.rotation.x = -Math.PI / 2; // Lay flat
		glow.position.y = -0.67; // Positioned just below the highlight, adjusted for new height

		piece.add(highlight);
		piece.add(glow);

		// Add animation using TWEEN for better performance if available
		if (window.TWEEN) {
			const scaleData = { value: 1.0 };
			const scaleTween = new TWEEN.Tween(scaleData)
				.to({ value: 1.1 }, 800)
				.easing(TWEEN.Easing.Quadratic.InOut)
				.yoyo(true)
				.repeat(Infinity)
				.onUpdate(() => {
					if (highlight && highlight.scale) {
						highlight.scale.set(scaleData.value, scaleData.value, 1);
					}
					if (glow && glow.scale) {
						glow.scale.set(scaleData.value * 1.1, scaleData.value * 1.1, 1);
					}
				})
				.start();

			// Store reference to the tween for later cleanup
			highlight.userData.tween = scaleTween;
		} else {
			// Fallback to traditional animation loop
			const startTime = Date.now();
			highlight.userData.animation = function () {
				const elapsed = (Date.now() - startTime) / 1000;
				const scale = 1 + 0.1 * Math.sin(elapsed * 3);
				highlight.scale.set(scale, scale, 1);
				glow.scale.set(scale * 1.1, scale * 1.1, 1);
			};

			// Add to animation loop
			if (!window._highlightAnimations) {
				window._highlightAnimations = [];

				// Set up animation loop if not already running
				if (!window._highlightAnimationLoop) {
					window._highlightAnimationLoop = function () {
						if (window._highlightAnimations && window._highlightAnimations.length > 0) {
							window._highlightAnimations.forEach(anim => {
								if (typeof anim === 'function') {
									try {
										anim();
									} catch (e) {
										console.warn('Error in highlight animation:', e);
									}
								}
							});
						}
						requestAnimationFrame(window._highlightAnimationLoop);
					};
					window._highlightAnimationLoop();
				}
			}

			window._highlightAnimations.push(highlight.userData.animation);
		}

		// Scale piece slightly
		piece.scale.set(1.1, 1.1, 1.1);
	} catch (error) {
		console.error('Error creating highlight effect:', error);
	}
}


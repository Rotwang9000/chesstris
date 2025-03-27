/**
 * Chess Piece Creator Module - Russian Theme
 * 
 * This module provides functions for creating chess pieces with proper 
 * positioning on the board. It supports both default geometric pieces
 * and custom 3D models that can be loaded and cached.
 */

import { getTHREE } from './enhanced-gameCore.js';


// Global scaling factor for all chess pieces
const PIECE_SCALE = 1.5; // 50% larger than original

// Cache for custom models - separate caches for each player category
const customModels = {
	self: {},  // For local player
	other: {}  // For all other players
};

// Default colors for chess pieces - simplified to local vs others
const DEFAULT_COLORS = {
	self: 0xDD0000,   // Red for the local player
	other: 0x0088AA,  // Blue-green for all other players
};

// Materials for enhanced pieces
const ENHANCED_MATERIALS = {
	// Local player enhanced materials (red theme)
	self: {
		primary: null,
		secondary: null,
		accent: null
	},
	// Other players enhanced materials (blue-green theme)
	other: {
		primary: null,
		secondary: null,
		accent: null
	}
};

/**
 * Helper function to create safe materials that won't cause errors
 * @param {string} materialKey - Material key ('self' or 'other')
 * @returns {Object} Object with primary, secondary, and accent materials
 */
function createSafeMaterials(materialKey) {
	const THREE = getTHREE();
	
	// Default color for this player type
	const defaultColor = DEFAULT_COLORS[materialKey] || 0xCCCCCC;
	
	// Get materials for this player or create new ones
	const materials = ENHANCED_MATERIALS[materialKey] || {
		primary: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 }),
		secondary: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 }),
		accent: new THREE.MeshStandardMaterial({ color: defaultColor, roughness: 0.7, metalness: 0.3 })
	};
	
	// Ensure all materials are valid objects
	for (const key in materials) {
		// If material isn't an object, create a new one
		if (typeof materials[key] !== 'object' || materials[key] === null) {
			// Use the value as a color if it's a number
			const color = typeof materials[key] === 'number' ? materials[key] : defaultColor;
			materials[key] = new THREE.MeshStandardMaterial({ 
				color: color,
				roughness: 0.7, 
				metalness: 0.3 
			});
		}
	}
	
	return materials;
}

// Initialize materials when first needed (prevent THREE not being defined issues)
function initMaterials() {
	const THREE = getTHREE();
	if (ENHANCED_MATERIALS.self.primary !== null) return; // Already initialized
	
	// Local player - Red theme
	ENHANCED_MATERIALS.self.primary = new THREE.MeshStandardMaterial({
		color: 0xDD0000,
		roughness: 0.7,
		metalness: 0.5,
		emissive: 0x330000,
		emissiveIntensity: 0.1
	});
	ENHANCED_MATERIALS.self.secondary = new THREE.MeshStandardMaterial({
		color: 0xFF6666,
		roughness: 0.6,
		metalness: 0.4,
		emissive: 0x220000,
		emissiveIntensity: 0.15
	});
	ENHANCED_MATERIALS.self.accent = new THREE.MeshStandardMaterial({
		color: 0xFF3333,
		roughness: 0.5,
		metalness: 0.6,
		emissive: 0x440000,
		emissiveIntensity: 0.2
	});
	
	// Other players - Blue-green theme
	ENHANCED_MATERIALS.other.primary = new THREE.MeshStandardMaterial({
		color: 0x0088AA,
		roughness: 0.5,
		metalness: 0.6,
		envMapIntensity: 1.0
	});
	ENHANCED_MATERIALS.other.secondary = new THREE.MeshStandardMaterial({
		color: 0x66CCDD,
		roughness: 0.3,
		metalness: 0.8,
		emissive: 0x002233,
		emissiveIntensity: 0.2
	});
	ENHANCED_MATERIALS.other.accent = new THREE.MeshStandardMaterial({
		color: 0xAAEEFF,
		roughness: 0.2,
		metalness: 0.9,
		emissive: 0x004466,
		emissiveIntensity: 0.3
	});
}

// Map numeric piece types to string names for easier reference
const PIECE_TYPE_MAP = {
	1: 'PAWN',
	2: 'ROOK',
	3: 'KNIGHT',
	4: 'BISHOP',
	5: 'QUEEN',
	6: 'KING',
	// Also support string-based lookups with the same values
	'PAWN': 1,
	'ROOK': 2,
	'KNIGHT': 3, 
	'BISHOP': 4,
	'QUEEN': 5,
	'KING': 6
};

/**
 * Register a custom model for a specific chess piece type
 * 
 * @param {number|string} player - Player identifier (number or 'self'/'other')
 * @param {number|string} pieceType - Type of piece (e.g., 'KING', 'QUEEN', or 1-6)
 * @param {THREE.Object3D} modelObject - The 3D model to use for this piece
 */
export function registerCustomModel(player, pieceType, modelObject) {
	// Convert string piece types to numbers if needed
	const pieceTypeNum = typeof pieceType === 'string' 
		? PIECE_TYPE_MAP[pieceType] || 1
		: pieceType;
		
	// Determine which player's cache to use
	const cacheKey = player === 'self' || player === true ? 'self' : 'other';
	
	// Store the model in the cache
	customModels[cacheKey][pieceTypeNum] = modelObject.clone();
	
	console.log(`Registered custom model for ${cacheKey} player, Piece Type ${pieceType}`);
}

/**
 * Create a chess piece at the specified position
 * 
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate on the board
 * @param {number} z - Z coordinate on the board
 * @param {string|number} pieceType - Type of piece (PAWN, ROOK, etc. or numeric 1-6)
 * @param {number|string} player - Player identifier (1 or 2)
 * @param {Object} options - Optional parameters including orientation, color, and isLocalPlayer
 * @returns {Object} THREE.Group containing the piece
 */
export function createChessPiece(gameState, x, z, pieceType, player, options = {}) {
	const THREE = getTHREE();
	// Normalize inputs
	const pieceTypeNum = typeof pieceType === 'string' 
		? PIECE_TYPE_MAP[pieceType] || 1 
		: pieceType;
		
	const pieceTypeName = PIECE_TYPE_MAP[pieceTypeNum] || 'PAWN';
	
	// Convert player ID to number if it's a string
	const playerNum = parseInt(player, 10) || 1;
	
	// Determine if this is the local player (either from options or gameState)
	const isLocalPlayer = options.isLocalPlayer !== undefined 
		? options.isLocalPlayer 
		: (gameState.localPlayerId === playerNum || gameState.myPlayerId === playerNum);
	
	// Use provided custom color if available, otherwise default
	const customColor = options.color;
	
	// Material key to use - 'self' for local player, 'other' for opponents
	const materialKey = isLocalPlayer ? 'self' : 'other';
	
	// Only log during debug mode to reduce console spam
	if (gameState.debugMode) {
		console.log(`Creating chess piece at (${x}, ${z}) of type ${pieceTypeName} for player ${playerNum} (${isLocalPlayer ? 'local' : 'opponent'})`);
	}
	
	try {
		// Create a group for the piece and its decorations
		const pieceGroup = new THREE.Group();
		
		// See if we have a custom model for this piece type
		const cacheKey = isLocalPlayer ? 'self' : 'other';
		const customModel = customModels[cacheKey][pieceTypeNum];
		
		if (customModel) {
			// Clone the custom model to use for this piece
			const model = customModel.clone();
			
			// Set up the model
			model.scale.set(0.4 * PIECE_SCALE, 0.4 * PIECE_SCALE, 0.4 * PIECE_SCALE); // Scale appropriately for the board
			model.position.y = 0.1; // Position slightly above the board cell
			
			// Make sure model is visible
			model.visible = true;
			model.traverse((child) => {
				if (child.isMesh) {
					child.visible = true;
					
					// If custom color is provided, apply it to the materials
					if (customColor !== undefined) {
						if (!child.material) {
							child.material = new THREE.MeshStandardMaterial({
								color: customColor,
								roughness: 0.7,
								metalness: 0.3
							});
						} else if (Array.isArray(child.material)) {
							// Apply to all materials in the array
							for (let i = 0; i < child.material.length; i++) {
								if (child.material[i]) {
									child.material[i].color.setHex(customColor);
								}
							}
						} else {
							// Apply to single material
							child.material.color.setHex(customColor);
						}
					}
					
					// Add shadows for custom models
					child.castShadow = true;
					child.receiveShadow = true;
				}
			});
			
			// Add the model to the piece group
			pieceGroup.add(model);
		} else {
			// No custom model available - create a Russian-themed geometric piece
			let pieceMesh;
			
			// Use custom color if provided
			if (customColor !== undefined) {
				// Initialize materials if not already done
				initMaterials();
				
				// Temporarily override the material colors for this piece
				const tempMaterials = createSafeMaterials(materialKey);
				tempMaterials.primary.color.setHex(customColor);
				tempMaterials.secondary.color.setHex(customColor);
				tempMaterials.accent.color.setHex(customColor);
				
				// Create piece with custom colors
				switch (pieceTypeNum) {
					case 6: // KING
						pieceMesh = createRussianKingPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
					case 5: // QUEEN
						pieceMesh = createRussianQueenPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
					case 4: // BISHOP
						pieceMesh = createRussianBishopPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
					case 3: // KNIGHT
						pieceMesh = createRussianKnightPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
					case 2: // ROOK
						pieceMesh = createRussianRookPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
					case 1: // PAWN
					default:
						pieceMesh = createRussianPawnPiece(materialKey, isLocalPlayer, tempMaterials);
						break;
				}
			} else {
				// Create using standard colors
				switch (pieceTypeNum) {
					case 6: // KING
						pieceMesh = createRussianKingPiece(materialKey, isLocalPlayer);
						break;
					case 5: // QUEEN
						pieceMesh = createRussianQueenPiece(materialKey, isLocalPlayer);
						break;
					case 4: // BISHOP
						pieceMesh = createRussianBishopPiece(materialKey, isLocalPlayer);
						break;
					case 3: // KNIGHT
						pieceMesh = createRussianKnightPiece(materialKey, isLocalPlayer);
						break;
					case 2: // ROOK
						pieceMesh = createRussianRookPiece(materialKey, isLocalPlayer);
						break;
					case 1: // PAWN
					default:
						pieceMesh = createRussianPawnPiece(materialKey, isLocalPlayer);
						break;
				}
			}
			
			// Make sure the piece is visible
			pieceMesh.visible = true;
			
			// Add the piece to the group
			pieceGroup.add(pieceMesh);
		}
		
		// Apply orientation if provided in options - rotate around Y axis for horizontal orientation
		if (options.orientation !== undefined) {
			// Convert orientation (0-3) to rotation around Y axis
			const yRotation = (options.orientation * Math.PI / 2);
			pieceGroup.rotation.y = yRotation;
		}
		
		// Add metadata to the group for easier identification and interaction
		pieceGroup.userData = {
			type: 'chess',
			pieceType: pieceTypeName,
			pieceTypeNum: pieceTypeNum,
			player: playerNum,
			position: { x, z },
			originalPosition: { x, z },
			color: customColor
		};
		
		// Ensure piece is visible
		pieceGroup.visible = true;
		
		return pieceGroup;
	} catch (error) {
		console.error('Error creating chess piece:', error);
		
		// Create a simple fallback piece so something is visible
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMaterial = new THREE.MeshStandardMaterial({ 
			color: customColor || (isLocalPlayer ? DEFAULT_COLORS.self : DEFAULT_COLORS.other),
			emissive: customColor || (isLocalPlayer ? DEFAULT_COLORS.self : DEFAULT_COLORS.other),
			emissiveIntensity: 0.5
		});
		
		const fallbackPiece = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackPiece.position.y = 0.4; // Position the fallback piece above the board
		
		// Create a group for the fallback piece
		const fallbackGroup = new THREE.Group();
		fallbackGroup.add(fallbackPiece);
		
		// Add metadata
		fallbackGroup.userData = {
			type: 'chess',
			pieceType: pieceTypeName,
			pieceTypeNum: pieceTypeNum,
			player: playerNum,
			position: { x, z },
			isErrorFallback: true,
			color: customColor
		};
		
		fallbackGroup.visible = true;
		return fallbackGroup;
	}
}

/**
 * Create a Russian-styled pawn piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.20, 0.25, 0.10, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.05;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Middle section
	const middleGeometry = new THREE.CylinderGeometry(0.17, 0.20, 0.25, isLocalPlayer ? 16 : 12);
	const middleMesh = new THREE.Mesh(middleGeometry, materials.primary);
	middleMesh.position.y = 0.22;
	middleMesh.castShadow = true;
	middleMesh.receiveShadow = true;
	group.add(middleMesh);
	
	// Top head (sphere for simplicity)
	const headGeometry = new THREE.SphereGeometry(0.15, isLocalPlayer ? 16 : 12, isLocalPlayer ? 16 : 12);
	const headMesh = new THREE.Mesh(headGeometry, materials.primary);
	headMesh.position.y = 0.42;
	headMesh.castShadow = true;
	headMesh.receiveShadow = true;
	group.add(headMesh);
	
	// If local player, add decorative ring
	if (isLocalPlayer) {
		const ringGeometry = new THREE.TorusGeometry(0.16, 0.02, 8, 32);
		const ringMesh = new THREE.Mesh(ringGeometry, materials.accent);
		ringMesh.rotation.x = Math.PI / 2;
		ringMesh.position.y = 0.32;
		ringMesh.castShadow = true;
		ringMesh.receiveShadow = true;
		group.add(ringMesh);
	}
	
	return group;
}

/**
 * Create a Russian-styled rook piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianRookPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.22, 0.25, 0.15, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.075;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Main tower body
	const towerGeometry = new THREE.CylinderGeometry(0.20, 0.22, 0.40, isLocalPlayer ? 16 : 12);
	const towerMesh = new THREE.Mesh(towerGeometry, materials.primary);
	towerMesh.position.y = 0.35;
	towerMesh.castShadow = true;
	towerMesh.receiveShadow = true;
	group.add(towerMesh);
	
	// Add a small mushroom dome to the rook as well
	const points = [];
	const segments = isLocalPlayer ? 12 : 8;
	const height = 0.12;
	const radius = 0.18;
	
	// Create curved dome shape
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		// Using a modified sine curve to create the onion dome bulge
		const x = radius * (1.1 - 0.4 * Math.sin(t * Math.PI));
		const y = height * t;
		points.push(new THREE.Vector2(x, y));
	}
	
	const domeGeometry = new THREE.LatheGeometry(points, isLocalPlayer ? 24 : 16);
	const domeMesh = new THREE.Mesh(domeGeometry, materials.secondary);
	domeMesh.position.y = 0.52;
	domeMesh.castShadow = true;
	domeMesh.receiveShadow = true;
	group.add(domeMesh);
	
	// Create castle-like crenellations (for a Russian fortress tower)
	const crenel_count = isLocalPlayer ? 6 : 4;
	for (let i = 0; i < crenel_count; i++) {
		const angle = (i / crenel_count) * Math.PI * 2;
		const crenelGeometry = new THREE.BoxGeometry(0.06, 0.10, 0.06);
		const crenelMesh = new THREE.Mesh(crenelGeometry, materials.accent);
		
		crenelMesh.position.x = Math.cos(angle) * 0.17;
		crenelMesh.position.z = Math.sin(angle) * 0.17;
		crenelMesh.position.y = 0.65;
		crenelMesh.castShadow = true;
		crenelMesh.receiveShadow = true;
		group.add(crenelMesh);
	}
	
	// If local player, add decorative window
	if (isLocalPlayer) {
		// Add a small window in the tower
		const windowGeometry = new THREE.BoxGeometry(0.07, 0.12, 0.05);
		const windowMesh = new THREE.Mesh(windowGeometry, materials.accent);
		windowMesh.position.set(0, 0.38, -0.18);
		windowMesh.castShadow = true;
		windowMesh.receiveShadow = true;
		group.add(windowMesh);
		
		// Add a decorative band around the middle
		const bandGeometry = new THREE.TorusGeometry(0.21, 0.02, 8, 32);
		const bandMesh = new THREE.Mesh(bandGeometry, materials.accent);
		bandMesh.rotation.x = Math.PI / 2;
		bandMesh.position.y = 0.35;
		bandMesh.castShadow = true;
		bandMesh.receiveShadow = true;
		group.add(bandMesh);
	}
	
	return group;
}

/**
 * Create a Russian-styled knight piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.20, 0.25, 0.15, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.075;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Neck section 
	const neckGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.25, isLocalPlayer ? 16 : 12);
	const neckMesh = new THREE.Mesh(neckGeometry, materials.primary);
	neckMesh.position.y = 0.27;
	neckMesh.castShadow = true;
	neckMesh.receiveShadow = true;
	group.add(neckMesh);
	
	// Horse head - simplified using a curved shape made of boxes
	// Main head box
	const headGeometry = new THREE.BoxGeometry(0.18, 0.15, 0.25);
	const headMesh = new THREE.Mesh(headGeometry, materials.secondary);
	headMesh.position.set(0, 0.45, 0.05);
	headMesh.rotation.x = -Math.PI / 6; // Tilt head down slightly
	headMesh.castShadow = true;
	headMesh.receiveShadow = true;
	group.add(headMesh);
	
	// Muzzle extension
	const muzzleGeometry = new THREE.BoxGeometry(0.12, 0.10, 0.20);
	const muzzleMesh = new THREE.Mesh(muzzleGeometry, materials.secondary);
	muzzleMesh.position.set(0, 0.43, 0.18);
	muzzleMesh.rotation.x = -Math.PI / 4; // Tilt down more
	muzzleMesh.castShadow = true;
	muzzleMesh.receiveShadow = true;
	group.add(muzzleMesh);
	
	// Ears (if local player)
	if (isLocalPlayer) {
		// Left ear
		const leftEarGeometry = new THREE.ConeGeometry(0.04, 0.10, 8);
		const leftEarMesh = new THREE.Mesh(leftEarGeometry, materials.accent);
		leftEarMesh.position.set(-0.06, 0.52, 0);
		leftEarMesh.rotation.x = -Math.PI / 12;
		leftEarMesh.castShadow = true;
		leftEarMesh.receiveShadow = true;
		group.add(leftEarMesh);
		
		// Right ear
		const rightEarGeometry = new THREE.ConeGeometry(0.04, 0.10, 8);
		const rightEarMesh = new THREE.Mesh(rightEarGeometry, materials.accent);
		rightEarMesh.position.set(0.06, 0.52, 0);
		rightEarMesh.rotation.x = -Math.PI / 12;
		rightEarMesh.castShadow = true;
		rightEarMesh.receiveShadow = true;
		group.add(rightEarMesh);
		
		// Decorative mane
		const maneGeometry = new THREE.BoxGeometry(0.16, 0.12, 0.05);
		const maneMesh = new THREE.Mesh(maneGeometry, materials.accent);
		maneMesh.position.set(0, 0.46, -0.08);
		maneMesh.rotation.x = Math.PI / 6; // Tilt up slightly
		maneMesh.castShadow = true;
		maneMesh.receiveShadow = true;
		group.add(maneMesh);
	}
	
	return group;
}

/**
 * Create a Russian-styled bishop piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.20, 0.25, 0.15, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.075;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Middle column
	const columnGeometry = new THREE.CylinderGeometry(0.14, 0.18, 0.30, isLocalPlayer ? 16 : 12);
	const columnMesh = new THREE.Mesh(columnGeometry, materials.primary);
	columnMesh.position.y = 0.30;
	columnMesh.castShadow = true;
	columnMesh.receiveShadow = true;
	group.add(columnMesh);
	
	// Russian onion dome (characteristic for Orthodox churches)
	// Creating using lathe geometry for the curved shape
	const points = [];
	const segments = isLocalPlayer ? 20 : 12;
	const height = 0.25;
	const radius = 0.15;
	
	// Create curved onion dome shape with more pronounced bulge
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		// Using a modified sine curve to create a more pronounced onion/mushroom dome bulge
		const x = radius * (1.1 - 0.5 * Math.sin(t * Math.PI));
		const y = height * t;
		points.push(new THREE.Vector2(x, y));
	}
	
	const domeGeometry = new THREE.LatheGeometry(points, isLocalPlayer ? 32 : 16);
	const domeMesh = new THREE.Mesh(domeGeometry, materials.secondary);
	domeMesh.position.y = 0.45;
	domeMesh.castShadow = true;
	domeMesh.receiveShadow = true;
	group.add(domeMesh);
	
	// Cross on top (traditional for Russian bishops)
	const verticalCrossGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8);
	const verticalCrossMesh = new THREE.Mesh(verticalCrossGeometry, materials.accent);
	verticalCrossMesh.position.y = 0.73;
	verticalCrossMesh.castShadow = true;
	verticalCrossMesh.receiveShadow = true;
	group.add(verticalCrossMesh);
	
	const horizontalCrossGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.10, 8);
	const horizontalCrossMesh = new THREE.Mesh(horizontalCrossGeometry, materials.accent);
	horizontalCrossMesh.position.y = 0.70;
	horizontalCrossMesh.rotation.z = Math.PI / 2; // Rotate to horizontal
	horizontalCrossMesh.castShadow = true;
	horizontalCrossMesh.receiveShadow = true;
	group.add(horizontalCrossMesh);
	
	// If local player, add extra detailing
	if (isLocalPlayer) {
		// Add decorative band at base of dome
		const bandGeometry = new THREE.TorusGeometry(0.15, 0.02, 8, 32);
		const bandMesh = new THREE.Mesh(bandGeometry, materials.accent);
		bandMesh.rotation.x = Math.PI / 2;
		bandMesh.position.y = 0.47;
		bandMesh.castShadow = true;
		bandMesh.receiveShadow = true;
		group.add(bandMesh);
		
		// Add small decorative sphere on top of the cross
		const sphereGeometry = new THREE.SphereGeometry(0.03, 12, 12);
		const sphereMesh = new THREE.Mesh(sphereGeometry, materials.accent);
		sphereMesh.position.y = 0.82;
		sphereMesh.castShadow = true;
		sphereMesh.receiveShadow = true;
		group.add(sphereMesh);
	}
	
	return group;
}

/**
 * Create a Russian-styled queen piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.20, 0.25, 0.15, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.075;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Middle column
	const columnGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.35, isLocalPlayer ? 16 : 12);
	const columnMesh = new THREE.Mesh(columnGeometry, materials.primary);
	columnMesh.position.y = 0.325;
	columnMesh.castShadow = true;
	columnMesh.receiveShadow = true;
	group.add(columnMesh);
	
	// Neck ring
	const ringGeometry = new THREE.TorusGeometry(0.17, 0.02, 8, isLocalPlayer ? 32 : 16);
	const ringMesh = new THREE.Mesh(ringGeometry, materials.secondary);
	ringMesh.rotation.x = Math.PI / 2;
	ringMesh.position.y = 0.48;
	ringMesh.castShadow = true;
	ringMesh.receiveShadow = true;
	group.add(ringMesh);
	
	// Crown base
	const crownBaseGeometry = new THREE.CylinderGeometry(0.18, 0.16, 0.08, isLocalPlayer ? 16 : 12);
	const crownBaseMesh = new THREE.Mesh(crownBaseGeometry, materials.secondary);
	crownBaseMesh.position.y = 0.55;
	crownBaseMesh.castShadow = true;
	crownBaseMesh.receiveShadow = true;
	group.add(crownBaseMesh);
	
	// Crown points - create a traditional Russian crown with points and a central dome
	const pointCount = isLocalPlayer ? 8 : 6;
	for (let i = 0; i < pointCount; i++) {
		const angle = (i / pointCount) * Math.PI * 2;
		const pointGeometry = new THREE.ConeGeometry(0.03, 0.10, isLocalPlayer ? 8 : 6);
		const pointMesh = new THREE.Mesh(pointGeometry, materials.accent);
		
		const radius = 0.13;
		pointMesh.position.x = Math.cos(angle) * radius;
		pointMesh.position.z = Math.sin(angle) * radius;
		pointMesh.position.y = 0.65;
		pointMesh.castShadow = true;
		pointMesh.receiveShadow = true;
		group.add(pointMesh);
	}
	
	// Central dome (more pronounced mushroom/onion dome on top)
	const points = [];
	const segments = isLocalPlayer ? 16 : 10;
	const height = 0.15;
	const radius = 0.08;
	
	// Create curved onion dome shape with more pronounced bulge for mushroom effect
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		// Modified curve for more mushroom-like appearance
		const bulge = Math.sin(t * Math.PI);
		const x = radius * (1.2 - 0.6 * bulge);
		const y = height * t;
		points.push(new THREE.Vector2(x, y));
	}
	
	const domeGeometry = new THREE.LatheGeometry(points, isLocalPlayer ? 24 : 16);
	const domeMesh = new THREE.Mesh(domeGeometry, materials.secondary);
	domeMesh.position.y = 0.62;
	domeMesh.castShadow = true;
	domeMesh.receiveShadow = true;
	group.add(domeMesh);
	
	// If local player, add extra decorative elements
	if (isLocalPlayer) {
		// Add a small orb on top
		const orbGeometry = new THREE.SphereGeometry(0.04, 12, 12);
		const orbMesh = new THREE.Mesh(orbGeometry, materials.accent);
		orbMesh.position.y = 0.78;
		orbMesh.castShadow = true;
		orbMesh.receiveShadow = true;
		group.add(orbMesh);
		
		// Add decorative elements to the base
		const decorCount = 6;
		for (let i = 0; i < decorCount; i++) {
			const angle = (i / decorCount) * Math.PI * 2;
			const decorGeometry = new THREE.BoxGeometry(0.04, 0.03, 0.04);
			const decorMesh = new THREE.Mesh(decorGeometry, materials.accent);
			
			decorMesh.position.x = Math.cos(angle) * 0.22;
			decorMesh.position.z = Math.sin(angle) * 0.22;
			decorMesh.position.y = 0.08;
			decorMesh.castShadow = true;
			decorMesh.receiveShadow = true;
			group.add(decorMesh);
		}
	}
	
	return group;
}

/**
 * Create a Russian-styled king piece
 * @param {string} materialKey - Material key ('self' or 'other')
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece (for enhanced visuals)
 * @param {Object} customMaterials - Optional custom materials to use
 * @returns {THREE.Group} The chess piece mesh group
 */
function createRussianKingPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	
	// Get materials - use custom if provided, otherwise use default
	const materials = customMaterials || createSafeMaterials(materialKey);
	
	// Base
	const baseGeometry = new THREE.CylinderGeometry(0.22, 0.25, 0.15, isLocalPlayer ? 16 : 12);
	const baseMesh = new THREE.Mesh(baseGeometry, materials.primary);
	baseMesh.position.y = 0.075;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	group.add(baseMesh);
	
	// Middle column
	const columnGeometry = new THREE.CylinderGeometry(0.18, 0.20, 0.40, isLocalPlayer ? 16 : 12);
	const columnMesh = new THREE.Mesh(columnGeometry, materials.primary);
	columnMesh.position.y = 0.35;
	columnMesh.castShadow = true;
	columnMesh.receiveShadow = true;
	group.add(columnMesh);
	
	// Neck ring
	const ringGeometry = new THREE.TorusGeometry(0.19, 0.02, 8, isLocalPlayer ? 32 : 16);
	const ringMesh = new THREE.Mesh(ringGeometry, materials.secondary);
	ringMesh.rotation.x = Math.PI / 2;
	ringMesh.position.y = 0.53;
	ringMesh.castShadow = true;
	ringMesh.receiveShadow = true;
	group.add(ringMesh);
	
	// Crown base - more ornate for the king (imperial Russian crown style)
	const crownBaseGeometry = new THREE.CylinderGeometry(0.22, 0.20, 0.10, isLocalPlayer ? 16 : 12);
	const crownBaseMesh = new THREE.Mesh(crownBaseGeometry, materials.secondary);
	crownBaseMesh.position.y = 0.60;
	crownBaseMesh.castShadow = true;
	crownBaseMesh.receiveShadow = true;
	group.add(crownBaseMesh);
	
	// Central dome (large mushroom dome for king's crown)
	const kingPoints = [];
	const kingSegments = isLocalPlayer ? 20 : 12;
	const kingHeight = 0.18;
	const kingRadius = 0.15;
	
	// Create pronounced mushroom dome shape for king
	for (let i = 0; i <= kingSegments; i++) {
		const t = i / kingSegments;
		// Modified curve for strong mushroom-like appearance
		const bulge = Math.sin(t * Math.PI);
		const x = kingRadius * (1.3 - 0.7 * bulge);
		const y = kingHeight * t;
		kingPoints.push(new THREE.Vector2(x, y));
	}
	
	const kingDomeGeometry = new THREE.LatheGeometry(kingPoints, isLocalPlayer ? 32 : 20);
	const kingDomeMesh = new THREE.Mesh(kingDomeGeometry, materials.secondary);
	kingDomeMesh.position.y = 0.64;
	kingDomeMesh.castShadow = true;
	kingDomeMesh.receiveShadow = true;
	group.add(kingDomeMesh);
	
	// Crown points - smaller and positioned around the dome
	const pointCount = isLocalPlayer ? 8 : 6;
	for (let i = 0; i < pointCount; i++) {
		const angle = (i / pointCount) * Math.PI * 2;
		const pointGeometry = new THREE.ConeGeometry(0.03, 0.08, isLocalPlayer ? 8 : 6);
		const pointMesh = new THREE.Mesh(pointGeometry, materials.accent);
		
		const radius = 0.18;
		pointMesh.position.x = Math.cos(angle) * radius;
		pointMesh.position.z = Math.sin(angle) * radius;
		pointMesh.position.y = 0.60;
		pointMesh.castShadow = true;
		pointMesh.receiveShadow = true;
		group.add(pointMesh);
	}
	
	// Create Russian imperial style cross on top
	const verticalCrossGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8);
	const verticalCrossMesh = new THREE.Mesh(verticalCrossGeometry, materials.accent);
	verticalCrossMesh.position.y = 0.90;
	verticalCrossMesh.castShadow = true;
	verticalCrossMesh.receiveShadow = true;
	group.add(verticalCrossMesh);
	
	const horizontalCrossGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8);
	const horizontalCrossMesh = new THREE.Mesh(horizontalCrossGeometry, materials.accent);
	horizontalCrossMesh.position.y = 0.87;
	horizontalCrossMesh.rotation.z = Math.PI / 2; // Rotate to horizontal
	horizontalCrossMesh.castShadow = true;
	horizontalCrossMesh.receiveShadow = true;
	group.add(horizontalCrossMesh);
	
	// If local player, add elaborate detailing
	if (isLocalPlayer) {
		// Add orb at base of cross
		const orbGeometry = new THREE.SphereGeometry(0.05, 12, 12);
		const orbMesh = new THREE.Mesh(orbGeometry, materials.accent);
		orbMesh.position.y = 0.81;
		orbMesh.castShadow = true;
		orbMesh.receiveShadow = true;
		group.add(orbMesh);
		
		// Add decorative band at base
		const decorBandGeometry = new THREE.TorusGeometry(0.24, 0.02, 8, 32);
		const decorBandMesh = new THREE.Mesh(decorBandGeometry, materials.accent);
		decorBandMesh.rotation.x = Math.PI / 2;
		decorBandMesh.position.y = 0.10;
		decorBandMesh.castShadow = true;
		decorBandMesh.receiveShadow = true;
		group.add(decorBandMesh);
	}
	
	return group;
}

/**
 * Load custom models for chess pieces
 * 
 * @param {Function} modelLoader - A function that loads a model (e.g. GLTFLoader)
 * @param {Object} modelPaths - Paths to models for each piece type and player
 * @returns {Promise} Promise that resolves when all models are loaded
 */
export function loadCustomModels(modelLoader, modelPaths) {
	const THREE = getTHREE();
	const loadPromises = [];
	
	// Check if paths are provided
	if (!modelPaths) return Promise.resolve();
	
	// For each player
	for (let player = 1; player <= 4; player++) {
		const playerKey = `player${player}`;
		const playerPaths = modelPaths[playerKey] || modelPaths[player];
		
		if (!playerPaths) continue;
		
		// For each piece type
		for (const pieceType in PIECE_TYPE_MAP) {
			// Skip the string keys (we only want the numeric keys 1-6)
			if (isNaN(parseInt(pieceType))) continue;
			
			const pieceName = PIECE_TYPE_MAP[pieceType].toLowerCase();
			const modelPath = playerPaths[pieceName] || playerPaths[pieceType];
			
			if (!modelPath) continue;
			
			// Load this model
			const loadPromise = new Promise((resolve, reject) => {
				modelLoader(modelPath, (model) => {
					// Register the loaded model
					registerCustomModel(player, pieceType, model);
					resolve();
				}, null, (error) => {
					console.error(`Error loading model for ${pieceName}:`, error);
					reject(error);
				});
			});
			
			loadPromises.push(loadPromise);
		}
	}
	
	return Promise.all(loadPromises);
}

/**
 * Get a chess piece mesh based on piece type and player
 * @param {string} type - The type of chess piece (pawn, rook, knight, bishop, queen, king)
 * @param {number|string} player - Player identifier, 'self' for local player or 'other' for opponents
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece
 * @returns {THREE.Group} The chess piece mesh
 */
export function getChessPiece(type, player, isLocalPlayer = false) {
	const THREE = getTHREE();
	if (!THREE) {
		console.error('THREE.js not available in getChessPiece');
		return null;
	}
	
	// Convert player to a number if it's a string number
	const playerNum = parseInt(player);
	
	// Determine if this is the local player's piece
	// The parameter 'player' can now be a number or 'self'/'other'
	let materialKey;
	if (player === 'self' || player === 'other') {
		materialKey = player;
	} else if (isLocalPlayer || playerNum === 1) {
		materialKey = 'self';
	} else {
		materialKey = 'other';
	}
	
	console.log(`Creating ${type} piece for ${materialKey} player (ID: ${player})`);
	
	try {
		// Check if a custom model exists for this piece type and player
		if (customModels[materialKey] && customModels[materialKey][type]) {
			const model = customModels[materialKey][type].clone();
			
			// Ensure model is properly initialized
			ensureValidMaterials(model);
			return model;
		}
		
		// Create the piece based on the piece type
		let chessPiece;
		
		switch (type.toLowerCase()) {
			case 'pawn':
				chessPiece = createRussianPawnPiece(materialKey, isLocalPlayer);
				break;
			case 'rook':
				chessPiece = createRussianRookPiece(materialKey, isLocalPlayer);
				break;
			case 'knight':
				chessPiece = createRussianKnightPiece(materialKey, isLocalPlayer);
				break;
			case 'bishop':
				chessPiece = createRussianBishopPiece(materialKey, isLocalPlayer);
				break;
			case 'queen':
				chessPiece = createRussianQueenPiece(materialKey, isLocalPlayer);
				break;
			case 'king':
				chessPiece = createRussianKingPiece(materialKey, isLocalPlayer);
				break;
			default:
				console.error(`Unknown chess piece type: ${type}`);
				// Return a default piece (pawn) if type is unknown
				chessPiece = createRussianPawnPiece(materialKey, isLocalPlayer);
		}
		
		// Ensure the piece has valid materials
		ensureValidMaterials(chessPiece);
	
		// Store in cache - this uses the materialKey ('self' or 'other') for caching
		if (!customModels[materialKey]) {
			customModels[materialKey] = {};
		}
		customModels[materialKey][type] = chessPiece.clone();
		
		return chessPiece;
	} catch (error) {
		console.error(`Error creating chess piece (${type} for ${materialKey}):`, error);
		
		// Create a simple fallback piece
		const fallbackPiece = createFallbackPiece(materialKey);
		return fallbackPiece;
	}
}

/**
 * Ensure all meshes in a model have valid materials
 * @param {THREE.Object3D} model - The model to check
 */
function ensureValidMaterials(model) {
	if (!model) return;
	
	const THREE = getTHREE();
	if (!THREE) return;
	
	try {
		// Set the visible property explicitly
		model.visible = true;
		
		// Remove any material property on Groups - only Meshes should have materials
		if (model.type === 'Group' && model.material) {
			console.warn('Removing invalid material from Group object');
			delete model.material;
		}
		
		// Walk the entire model and ensure all meshes have materials
		model.traverse(child => {
			if (!child) return;
			
			// Set visible on all children
			child.visible = true;
			
			// Remove material from any Groups
			if (child.type === 'Group' && child.material) {
				console.warn('Removing invalid material from Group child');
				delete child.material;
			}
			
			if (child.isMesh) {
				// If mesh has no material, create a default one
				if (!child.material) {
					// Create a default material based on player
					const color = child.userData?.player === 'self' ? 0xDD0000 : 0x0088AA;
					child.material = new THREE.MeshStandardMaterial({
						color: color,
						roughness: 0.7,
						metalness: 0.3
					});
				}
				
				// Fix array materials
				if (Array.isArray(child.material)) {
					// Ensure all materials in the array are valid
					for (let i = 0; i < child.material.length; i++) {
						if (!child.material[i]) {
							const color = child.userData?.player === 'self' ? 0xDD0000 : 0x0088AA;
							child.material[i] = new THREE.MeshStandardMaterial({
								color: color,
								roughness: 0.7,
								metalness: 0.3
							});
						}
					}
				}
				
				// Force material update
				if (child.material) {
					child.material.needsUpdate = true;
				}
			}
		});
	} catch (error) {
		console.error('Error ensuring valid materials:', error);
	}
}

/**
 * Create a simple fallback piece when normal creation fails
 * @param {string} materialKey - 'self' or 'other'
 * @returns {THREE.Group} A simple piece
 */
function createFallbackPiece(materialKey) {
	const THREE = getTHREE();
	if (!THREE) return null;
	
	try {
		const group = new THREE.Group();
		group.visible = true;
		
		// Create a simple cube as fallback
		const geometry = new THREE.BoxGeometry(0.8, 1.2, 0.8);
		const color = materialKey === 'self' ? 0xDD0000 : 0x0088AA;
		const material = new THREE.MeshStandardMaterial({
			color: color,
			roughness: 0.7,
			metalness: 0.3
		});
		
		const mesh = new THREE.Mesh(geometry, material);
		mesh.visible = true;
		mesh.position.y = 0.6; // Move up half height
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		
		group.add(mesh);
		// Ensure the group doesn't have a material directly
		if (group.material) {
			delete group.material;
		}
		return group;
	} catch (error) {
		console.error('Error creating fallback piece:', error);
		return null;
	}
}

/**
 * Create a king mesh
 */
function createKingPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16),
		material
	);
	body.position.y = 0.45;
	group.add(body);
	
	// Top
	const top = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.25, 0.2, 16),
		material
	);
	top.position.y = 0.8;
	group.add(top);
	
	// Crown
	const crown = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.3, 0.2, 16),
		material
	);
	crown.position.y = 1.0;
	group.add(crown);
	
	// Cross on top
	const crossVertical = new THREE.Mesh(
		new THREE.BoxGeometry(0.05, 0.3, 0.05),
		material
	);
	crossVertical.position.y = 1.25;
	group.add(crossVertical);
	
	const crossHorizontal = new THREE.Mesh(
		new THREE.BoxGeometry(0.2, 0.05, 0.05),
		material
	);
	crossHorizontal.position.y = 1.2;
	group.add(crossHorizontal);
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a queen mesh
 */
function createQueenPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16),
		material
	);
	body.position.y = 0.45;
	group.add(body);
	
	// Top
	const top = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.25, 0.2, 16),
		material
	);
	top.position.y = 0.8;
	group.add(top);
	
	// Crown
	const crown = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.3, 0.2, 16),
		material
	);
	crown.position.y = 1.0;
	group.add(crown);
	
	// Ball on top
	const ball = new THREE.Mesh(
		new THREE.SphereGeometry(0.1, 16, 16),
		material
	);
	ball.position.y = 1.15;
	group.add(ball);
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a bishop mesh
 */
function createBishopPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.3, 0.6, 16),
		material
	);
	body.position.y = 0.5;
	group.add(body);
	
	// Top
	const top = new THREE.Mesh(
		new THREE.SphereGeometry(0.2, 16, 16),
		material
	);
	top.position.y = 0.9;
	group.add(top);
	
	// Slit in the top
	const slit = new THREE.Mesh(
		new THREE.BoxGeometry(0.1, 0.1, 0.01),
		material
	);
	slit.position.y = 1.0;
	slit.rotation.x = Math.PI / 2;
	group.add(slit);
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a knight mesh
 */
function createKnightPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.25, 0.3, 0.4, 16),
		material
	);
	body.position.y = 0.4;
	group.add(body);
	
	// Head base
	const headBase = new THREE.Mesh(
		new THREE.BoxGeometry(0.35, 0.2, 0.25),
		material
	);
	headBase.position.y = 0.7;
	group.add(headBase);
	
	// Head top
	const headTop = new THREE.Mesh(
		new THREE.BoxGeometry(0.2, 0.3, 0.25),
		material
	);
	headTop.position.y = 0.95;
	headTop.position.x = 0.1;
	group.add(headTop);
	
	// Ear
	const ear = new THREE.Mesh(
		new THREE.ConeGeometry(0.1, 0.3, 16),
		material
	);
	ear.position.y = 1.1;
	ear.position.x = -0.1;
	ear.rotation.z = -Math.PI / 4;
	group.add(ear);
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a rook mesh
 */
function createRookPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16),
		material
	);
	body.position.y = 0.5;
	group.add(body);
	
	// Top
	const top = new THREE.Mesh(
		new THREE.CylinderGeometry(0.35, 0.3, 0.2, 16),
		material
	);
	top.position.y = 0.9;
	group.add(top);
	
	// Battlements - create small rectangles around the top
	for (let i = 0; i < 4; i++) {
		const angle = (i / 4) * Math.PI * 2;
		const battlement = new THREE.Mesh(
			new THREE.BoxGeometry(0.1, 0.15, 0.1),
			material
		);
		battlement.position.y = 1.075;
		battlement.position.x = Math.sin(angle) * 0.25;
		battlement.position.z = Math.cos(angle) * 0.25;
		group.add(battlement);
	}
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a pawn mesh
 */
function createPawnPieceMesh(THREE, material) {
	const group = new THREE.Group();
	
	// Base
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.25, 0.35, 0.2, 16),
		material
	);
	base.position.y = 0.1;
	group.add(base);
	
	// Body
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.15, 0.25, 0.4, 16),
		material
	);
	body.position.y = 0.4;
	group.add(body);
	
	// Head
	const head = new THREE.Mesh(
		new THREE.SphereGeometry(0.15, 16, 16),
		material
	);
	head.position.y = 0.7;
	group.add(head);
	
	// Enable shadows
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	
	return group;
}

/**
 * Create a chess piece
 * @param { string } newType - Type of piece
 * @param { string|number } newColor - Color of piece (hex value or object)
 * @param { number } orientation - Orientation(0 - 3)
 * @param { THREE } THREE - THREE instance
 * @returns { THREE.Group } The chess piece mesh group
 */
function createPiece(newType, newColor, orientation, THREE) {
	let piece;
	
	// Ensure we have a valid material, not just a color value
	let material;
	
	if (typeof newColor === 'object' && newColor !== null) {
		// It's already a material object, use it directly
		material = newColor;
	} else {
		// Convert color value to material
		const colorValue = typeof newColor === 'number' ? newColor : 0xCCCCCC;
		material = new THREE.MeshStandardMaterial({
			color: colorValue,
			roughness: 0.7,
			metalness: 0.3
		});
	}

	switch (newType.toUpperCase()) {
		case 'KING':
			piece = createKingPieceMesh(THREE, material);
			break;
		case 'QUEEN':
			piece = createQueenPieceMesh(THREE, material);
			break;
		case 'BISHOP':
			piece = createBishopPieceMesh(THREE, material);
			break;
		case 'KNIGHT':
			piece = createKnightPieceMesh(THREE, material);
			break;
		case 'ROOK':
			piece = createRookPieceMesh(THREE, material);
			break;
		case 'PAWN':
			piece = createPawnPieceMesh(THREE, material);
			break;
		default:
			console.error(`Unknown piece type: ${newType}`);
			// Create fallback pawn
			piece = createPawnPieceMesh(THREE, material);
			break;
	}

	// Ensure the piece is a valid object
	if (!piece) {
		console.error(`Failed to create piece of type ${newType}`);
		// Create a fallback piece
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, material);
		
		piece = new THREE.Group();
		piece.add(fallbackMesh);
		fallbackMesh.position.y = 0.4; // Position the mesh at half-height within the group
	}

	// Add userData
	piece.userData = {
		type: newType,
		color: newColor
	};

	// Set orientation
	if (orientation !== undefined) {
		piece.rotation.y = orientation * Math.PI / 2;
	}

	// Ensure shadows are enabled
	piece.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});

	return piece;
}

// Export the main functions and constants
export default {
	createPiece,
	initMaterials,
	getChessPiece,
	registerCustomModel,
	loadCustomModels,
	PIECE_TYPE_MAP,
	DEFAULT_COLORS,
	ENHANCED_MATERIALS
};


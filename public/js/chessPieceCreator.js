/**
 * Chess Piece Creator Module - Russian Theme
 * 
 * This module provides functions for creating chess pieces with proper 
 * positioning on the board. It supports both default geometric pieces
 * and custom 3D models that can be loaded and cached.
 */

import { getTHREE } from './gameContext.js';


// Global scaling factor for all chess pieces
const PIECE_SCALE = 2.0;

// Cache for custom models - separate caches for each player category
const customModels = {
	self: {},  // For local player
	other: {}  // For all other players
};

// Default colors for chess pieces - simplified to local vs others
const DEFAULT_COLORS = {
	self: 0x6B0F1A,
	other: 0x2A3038,
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
	
	// Local player — imperial Russian inspired lacquer + gilt
	ENHANCED_MATERIALS.self.primary = new THREE.MeshStandardMaterial({
		color: 0x6B0F1A,
		roughness: 0.38,
		metalness: 0.2
	});
	ENHANCED_MATERIALS.self.secondary = new THREE.MeshStandardMaterial({
		color: 0xB08D57,
		roughness: 0.28,
		metalness: 0.45
	});
	ENHANCED_MATERIALS.self.accent = new THREE.MeshStandardMaterial({
		color: 0xD4AF37,
		roughness: 0.2,
		metalness: 0.7
	});

	// Other players — simplified darker style for faster rendering clarity
	ENHANCED_MATERIALS.other.primary = new THREE.MeshStandardMaterial({
		color: 0x2A3038,
		roughness: 0.55,
		metalness: 0.08
	});
	ENHANCED_MATERIALS.other.secondary = new THREE.MeshStandardMaterial({
		color: 0x4B5563,
		roughness: 0.5,
		metalness: 0.1
	});
	ENHANCED_MATERIALS.other.accent = new THREE.MeshStandardMaterial({
		color: 0x94A3B8,
		roughness: 0.45,
		metalness: 0.15
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
 * @param {string} player - Player identifier
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
 * @param {string} player - Player identifier
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
	
	// Player is an identifier string, not a number
	
	// Determine if this is the local player (either from options or gameState)
	const isLocalPlayer = options.isLocalPlayer !== undefined 
		? options.isLocalPlayer 
		: (gameState.localPlayerId === player || gameState.myPlayerId === player);
	
	// Use provided custom color if available, otherwise default
	const customColor = options.color;
	
	// Material key to use - 'self' for local player, 'other' for opponents
	const materialKey = isLocalPlayer ? 'self' : 'other';
	
	// Only log during debug mode to reduce console spam
	if (gameState.debugMode) {
		console.log(`Creating chess piece at (${x}, ${z}) of type ${pieceTypeName} for player ${player} (${isLocalPlayer ? 'local' : 'opponent'})`);
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
			player: player,
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
			roughness: 0.6,
			metalness: 0.3
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
			player: player,
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Flared base plinth
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.10, seg), materials.primary);
	base.position.y = 0.05;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Tapered body
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 0.30, seg), materials.primary);
	body.position.y = 0.25;
	body.castShadow = true;
	body.receiveShadow = true;
	group.add(body);

	if (isLocalPlayer) {
		// Collar ring between body and head
		const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 32), materials.accent);
		collar.rotation.x = Math.PI / 2;
		collar.position.y = 0.38;
		collar.castShadow = true;
		collar.receiveShadow = true;
		group.add(collar);

		// Slightly squashed sphere head with a visible brim
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), materials.secondary);
		head.scale.set(1, 0.85, 1);
		head.position.y = 0.48;
		head.castShadow = true;
		head.receiveShadow = true;
		group.add(head);

		// Finial point on top (small onion nub)
		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.accent);
		finial.scale.set(1, 1.6, 1);
		finial.position.y = 0.59;
		finial.castShadow = true;
		finial.receiveShadow = true;
		group.add(finial);

		// Base decoration ring
		const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 32), materials.accent);
		baseRing.rotation.x = Math.PI / 2;
		baseRing.position.y = 0.02;
		baseRing.castShadow = true;
		baseRing.receiveShadow = true;
		group.add(baseRing);
	} else {
		// Simple sphere head for opponents
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, seg, seg), materials.primary);
		head.position.y = 0.45;
		head.castShadow = true;
		head.receiveShadow = true;
		group.add(head);
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Flared base
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Tower body
	const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.40, seg), materials.primary);
	tower.position.y = 0.32;
	tower.castShadow = true;
	tower.receiveShadow = true;
	group.add(tower);

	if (isLocalPlayer) {
		// Kremlin-style flared parapet (wider at top)
		const parapet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.08, 16), materials.secondary);
		parapet.position.y = 0.56;
		parapet.castShadow = true;
		parapet.receiveShadow = true;
		group.add(parapet);

		// Swallowtail merlons (rectangular crenellations)
		const merlonCount = 8;
		for (let i = 0; i < merlonCount; i++) {
			const angle = (i / merlonCount) * Math.PI * 2;
			const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.055), materials.accent);
			merlon.position.set(Math.cos(angle) * 0.20, 0.66, Math.sin(angle) * 0.20);
			merlon.castShadow = true;
			merlon.receiveShadow = true;
			group.add(merlon);
		}

		// Small onion dome atop the tower
		const domePoints = [];
		for (let i = 0; i <= 14; i++) {
			const t = i / 14;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.10 * (1.2 - 0.6 * bulge), 0.14 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 24), materials.secondary);
		dome.position.y = 0.70;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		// Tiny spire on dome
		const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.10, 8), materials.accent);
		spire.position.y = 0.88;
		spire.castShadow = true;
		spire.receiveShadow = true;
		group.add(spire);

		// Arrow-slit windows (two, opposite sides)
		for (let side = -1; side <= 1; side += 2) {
			const slit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), materials.accent);
			slit.position.set(0, 0.34, side * 0.19);
			slit.castShadow = true;
			slit.receiveShadow = true;
			group.add(slit);
		}

		// Decorative band
		const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 32), materials.accent);
		band.rotation.x = Math.PI / 2;
		band.position.y = 0.14;
		band.castShadow = true;
		band.receiveShadow = true;
		group.add(band);
	} else {
		// Simple crenellations for opponents
		const crenelCount = 4;
		for (let i = 0; i < crenelCount; i++) {
			const angle = (i / crenelCount) * Math.PI * 2;
			const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.06), materials.accent);
			crenel.position.set(Math.cos(angle) * 0.17, 0.58, Math.sin(angle) * 0.17);
			crenel.castShadow = true;
			crenel.receiveShadow = true;
			group.add(crenel);
		}
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Flared base
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Pedestal / neck column
	const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.22, seg), materials.primary);
	pedestal.position.y = 0.23;
	pedestal.castShadow = true;
	pedestal.receiveShadow = true;
	group.add(pedestal);

	if (isLocalPlayer) {
		// Curved neck — built from stacked tapered sections
		const neckSections = 5;
		for (let i = 0; i < neckSections; i++) {
			const t = i / neckSections;
			const topR = 0.10 - t * 0.02;
			const botR = 0.12 - t * 0.02;
			const h = 0.06;
			const neckPart = new THREE.Mesh(
				new THREE.CylinderGeometry(topR, botR, h, 12),
				materials.primary
			);
			// Curve forwards as we go up
			neckPart.position.set(0, 0.37 + i * 0.055, 0.02 + t * 0.06);
			neckPart.rotation.x = -t * 0.35;
			neckPart.castShadow = true;
			neckPart.receiveShadow = true;
			group.add(neckPart);
		}

		// Cranium — slightly elongated sphere
		const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), materials.secondary);
		cranium.scale.set(0.9, 1, 1.3);
		cranium.position.set(0, 0.58, 0.12);
		cranium.rotation.x = -0.3;
		cranium.castShadow = true;
		cranium.receiveShadow = true;
		group.add(cranium);

		// Muzzle — tapered box
		const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.18), materials.secondary);
		muzzle.position.set(0, 0.52, 0.24);
		muzzle.rotation.x = -Math.PI / 5;
		muzzle.castShadow = true;
		muzzle.receiveShadow = true;
		group.add(muzzle);

		// Nostrils (two tiny spheres at tip)
		for (let side = -1; side <= 1; side += 2) {
			const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), materials.accent);
			nostril.position.set(side * 0.035, 0.48, 0.33);
			nostril.castShadow = true;
			group.add(nostril);
		}

		// Ears — two pointed cones
		for (let side = -1; side <= 1; side += 2) {
			const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 8), materials.accent);
			ear.position.set(side * 0.06, 0.68, 0.08);
			ear.rotation.x = -0.15;
			ear.rotation.z = side * 0.15;
			ear.castShadow = true;
			ear.receiveShadow = true;
			group.add(ear);
		}

		// Mane — series of thin ridges along back of neck
		for (let i = 0; i < 4; i++) {
			const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.03), materials.accent);
			ridge.position.set(0, 0.55 + i * 0.04, -0.02 - i * 0.015);
			ridge.rotation.x = 0.2;
			ridge.castShadow = true;
			group.add(ridge);
		}

		// Eye (small accent sphere, right side visible)
		const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), materials.accent);
		eye.position.set(0.08, 0.60, 0.18);
		group.add(eye);
	} else {
		// Simple head block for opponents
		const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.25), materials.secondary);
		head.position.set(0, 0.42, 0.05);
		head.rotation.x = -Math.PI / 6;
		head.castShadow = true;
		head.receiveShadow = true;
		group.add(head);

		const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.10, 0.20), materials.secondary);
		muzzle.position.set(0, 0.40, 0.18);
		muzzle.rotation.x = -Math.PI / 4;
		muzzle.castShadow = true;
		muzzle.receiveShadow = true;
		group.add(muzzle);
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Flared base
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Tapered column
	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.32, seg), materials.primary);
	column.position.y = 0.28;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	if (isLocalPlayer) {
		// Ornate transition collar
		const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 32), materials.accent);
		collar.rotation.x = Math.PI / 2;
		collar.position.y = 0.43;
		collar.castShadow = true;
		collar.receiveShadow = true;
		group.add(collar);

		// Tall onion dome with strong bulge
		const domePoints = [];
		for (let i = 0; i <= 20; i++) {
			const t = i / 20;
			const sinT = Math.sin(t * Math.PI);
			// Wider at bottom quarter, narrow at top
			const bulge = t < 0.3 ? 1.3 * sinT : 0.7 * sinT;
			domePoints.push(new THREE.Vector2(0.14 * (1.0 - 0.55 * bulge), 0.30 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 32), materials.secondary);
		dome.position.y = 0.44;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		// Diagonal slit across dome face (traditional bishop marking)
		const slit = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.04), materials.accent);
		slit.position.set(0, 0.60, 0.10);
		slit.rotation.z = Math.PI / 6;
		slit.castShadow = true;
		group.add(slit);

		// Orthodox cross on top — three horizontal bars
		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.20, 8), materials.accent);
		crossV.position.y = 0.84;
		crossV.castShadow = true;
		crossV.receiveShadow = true;
		group.add(crossV);

		// Main crossbar
		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), materials.accent);
		crossH.position.y = 0.82;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		crossH.receiveShadow = true;
		group.add(crossH);

		// Lower angled crossbar (Orthodox style)
		const crossLow = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.10, 8), materials.accent);
		crossLow.position.y = 0.76;
		crossLow.rotation.z = Math.PI / 2 + 0.25;
		crossLow.castShadow = true;
		crossLow.receiveShadow = true;
		group.add(crossLow);

		// Orb at base of cross
		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), materials.accent);
		orb.position.y = 0.74;
		orb.castShadow = true;
		group.add(orb);

		// Small finial sphere atop cross
		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), materials.accent);
		finial.position.y = 0.95;
		finial.castShadow = true;
		group.add(finial);
	} else {
		// Simple dome for opponents
		const domePoints = [];
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			domePoints.push(new THREE.Vector2(0.14 * (1.1 - 0.5 * Math.sin(t * Math.PI)), 0.22 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 16), materials.secondary);
		dome.position.y = 0.44;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		// Simple cross
		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), materials.accent);
		crossV.position.y = 0.70;
		crossV.castShadow = true;
		group.add(crossV);
		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.10, 8), materials.accent);
		crossH.position.y = 0.67;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		group.add(crossH);
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Flared base
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Elegant column
	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.36, seg), materials.primary);
	column.position.y = 0.30;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	// Neck ring
	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, seg === 16 ? 32 : 16), materials.secondary);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = 0.47;
	ring.castShadow = true;
	ring.receiveShadow = true;
	group.add(ring);

	if (isLocalPlayer) {
		// Wide kokoshnik crown rim — flared cylinder
		const kokoshnik = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.10, 16), materials.secondary);
		kokoshnik.position.y = 0.54;
		kokoshnik.castShadow = true;
		kokoshnik.receiveShadow = true;
		group.add(kokoshnik);

		// Tall ornate crown points with pearl tips
		const pointCount = 8;
		for (let i = 0; i < pointCount; i++) {
			const angle = (i / pointCount) * Math.PI * 2;
			const r = 0.17;
			// Taller, sharper points
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 8), materials.accent);
			point.position.set(Math.cos(angle) * r, 0.66, Math.sin(angle) * r);
			point.castShadow = true;
			group.add(point);

			// Tiny pearl on each point
			const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), materials.accent);
			pearl.position.set(Math.cos(angle) * r, 0.74, Math.sin(angle) * r);
			group.add(pearl);
		}

		// Central onion dome
		const domePoints = [];
		for (let i = 0; i <= 16; i++) {
			const t = i / 16;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.09 * (1.3 - 0.7 * bulge), 0.18 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 24), materials.secondary);
		dome.position.y = 0.62;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		// Imperial orb and tiny cross on top
		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), materials.accent);
		orb.position.y = 0.82;
		orb.castShadow = true;
		group.add(orb);

		const miniCrossV = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), materials.accent);
		miniCrossV.position.y = 0.90;
		miniCrossV.castShadow = true;
		group.add(miniCrossV);
		const miniCrossH = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6), materials.accent);
		miniCrossH.position.y = 0.89;
		miniCrossH.rotation.z = Math.PI / 2;
		miniCrossH.castShadow = true;
		group.add(miniCrossH);

		// Decorative base studs
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const stud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), materials.accent);
			stud.position.set(Math.cos(angle) * 0.23, 0.06, Math.sin(angle) * 0.23);
			group.add(stud);
		}
	} else {
		// Simple crown for opponents
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.08, seg), materials.secondary);
		crownBase.position.y = 0.53;
		crownBase.castShadow = true;
		group.add(crownBase);

		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 6), materials.accent);
			point.position.set(Math.cos(angle) * 0.13, 0.62, Math.sin(angle) * 0.13);
			point.castShadow = true;
			group.add(point);
		}

		// Small dome
		const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), materials.secondary);
		dome.position.y = 0.62;
		dome.castShadow = true;
		group.add(dome);
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
	const materials = customMaterials || createSafeMaterials(materialKey);
	const seg = isLocalPlayer ? 16 : 12;

	// Wide flared base
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	// Tall column
	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.42, seg), materials.primary);
	column.position.y = 0.33;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	// Neck ring
	const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, seg === 16 ? 32 : 16), materials.secondary);
	neckRing.rotation.x = Math.PI / 2;
	neckRing.position.y = 0.53;
	neckRing.castShadow = true;
	neckRing.receiveShadow = true;
	group.add(neckRing);

	if (isLocalPlayer) {
		// Imperial crown base — wide flared rim
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.10, 16), materials.secondary);
		crownBase.position.y = 0.59;
		crownBase.castShadow = true;
		crownBase.receiveShadow = true;
		group.add(crownBase);

		// Two tiers of crown points (taller than queen)
		const tiers = [
			{ count: 8, y: 0.68, r: 0.20, h: 0.16 },
			{ count: 8, y: 0.74, r: 0.15, h: 0.12 }
		];
		for (const tier of tiers) {
			for (let i = 0; i < tier.count; i++) {
				const angle = (i / tier.count) * Math.PI * 2 + (tier.r < 0.18 ? Math.PI / tier.count : 0);
				const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, tier.h, 8), materials.accent);
				point.position.set(Math.cos(angle) * tier.r, tier.y, Math.sin(angle) * tier.r);
				point.castShadow = true;
				group.add(point);

				// Pearl tip
				const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), materials.accent);
				pearl.position.set(Math.cos(angle) * tier.r, tier.y + tier.h / 2 + 0.01, Math.sin(angle) * tier.r);
				group.add(pearl);
			}
		}

		// Large central onion dome
		const domePoints = [];
		for (let i = 0; i <= 20; i++) {
			const t = i / 20;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.13 * (1.35 - 0.8 * bulge), 0.22 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 32), materials.secondary);
		dome.position.y = 0.66;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		// Imperial orb beneath cross
		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), materials.accent);
		orb.position.y = 0.90;
		orb.castShadow = true;
		group.add(orb);

		// Thick imperial cross
		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), materials.accent);
		crossV.position.y = 1.04;
		crossV.castShadow = true;
		crossV.receiveShadow = true;
		group.add(crossV);

		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), materials.accent);
		crossH.position.y = 1.02;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		crossH.receiveShadow = true;
		group.add(crossH);

		// Secondary lower crossbar
		const crossH2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.10, 8), materials.accent);
		crossH2.position.y = 0.96;
		crossH2.rotation.z = Math.PI / 2;
		crossH2.castShadow = true;
		group.add(crossH2);

		// Finial sphere
		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), materials.accent);
		finial.position.y = 1.16;
		group.add(finial);

		// Decorative band at base
		const baseBand = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 32), materials.accent);
		baseBand.rotation.x = Math.PI / 2;
		baseBand.position.y = 0.04;
		baseBand.castShadow = true;
		group.add(baseBand);

		// Second band mid-column
		const midBand = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 8, 32), materials.accent);
		midBand.rotation.x = Math.PI / 2;
		midBand.position.y = 0.34;
		midBand.castShadow = true;
		group.add(midBand);
	} else {
		// Simple crown for opponents
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 0.10, seg), materials.secondary);
		crownBase.position.y = 0.59;
		crownBase.castShadow = true;
		group.add(crownBase);

		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), materials.accent);
			point.position.set(Math.cos(angle) * 0.18, 0.68, Math.sin(angle) * 0.18);
			point.castShadow = true;
			group.add(point);
		}

		// Simple dome
		const domePoints = [];
		for (let i = 0; i <= 12; i++) {
			const t = i / 12;
			domePoints.push(new THREE.Vector2(0.13 * (1.3 - 0.7 * Math.sin(t * Math.PI)), 0.16 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 20), materials.secondary);
		dome.position.y = 0.63;
		dome.castShadow = true;
		group.add(dome);

		// Simple cross
		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), materials.accent);
		crossV.position.y = 0.86;
		crossV.castShadow = true;
		group.add(crossV);
		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), materials.accent);
		crossH.position.y = 0.83;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		group.add(crossH);
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
 * @param {string} player - Player identifier
 * @param {boolean} isLocalPlayer - Whether this is the local player's piece
 * @returns {THREE.Group} The chess piece mesh
 */
export function getChessPiece(type, player, isLocalPlayer = false) {
	const THREE = getTHREE();
	if (!THREE) {
		console.error('THREE.js not available in getChessPiece');
		return null;
	}
	
	// Determine if this is the local player's piece
	let materialKey;
	if (player === 'self' || player === 'other') {
		materialKey = player;
	} else if (isLocalPlayer) {
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


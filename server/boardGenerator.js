/**
 * Board Generator - Server-side implementation for Shaktris
 * Handles generation of the board layout including home zone positioning
 * 
 * This module is responsible for:
 * 1. Calculating positions for home zones with specific pawn clash requirements
 * 2. Generating the home zones for each player
 * 3. Creating chess pieces with the correct orientation
 * 4. Placing a centre marker for reliable client-side reference
 * 
 * The implementation uses a sparse cell-based approach rather than a traditional 2D array.
 * Each cell is identified by a coordinate key in the format "x,z".
 */

/**
 * Calculate home zone position with controlled pawn clashing.
 *
 * Placement strategy:
 *  1. The first player anchors near the origin with a random orientation.
 *  2. Subsequent players are seeded around the **centroid of existing
 *     zones** (and individual nearby zones as alternative anchors), not
 *     the origin. This keeps the play field dense as more players join
 *     rather than spreading outwards forever from `(0, 0)`.
 *  3. We try increasing search radii from each anchor, each with a few
 *     orientations and random angles. The first position that has
 *     adequate clear space and is not directly in another pawn's path
 *     wins. We prefer positions that allow a pawn clash at distance 7.
 *  4. If nothing fits, fall back to a wide spiral search far from the
 *     cluster.
 *
 * @param {number} playerIndex - Player index (0-based)
 * @param {Object} gameState - Current game state to check existing positions
 * @param {number} homeZoneWidth - Home zone width (typically 8 for chess)
 * @param {number} homeZoneHeight - Home zone height (typically 2 for chess)
 * @returns {Object} Position and orientation for the home zone
 */
function calculateHomePosition(playerIndex, gameState, homeZoneWidth, homeZoneHeight) {
	if (playerIndex === 0) {
		return makeFirstPlayerHomePosition();
	}

	const existingHomeZones = collectExistingHomeZones(gameState);
	const pawnPaths = calculateExistingPawnPaths(existingHomeZones);
	const usedOrientations = existingHomeZones.map(zone => zone.orientation);

	// Build a prioritised list of anchor points around which to try placement.
	// We aim to **stay close to the cluster** so new players land next to
	// existing ones, rather than always offsetting from the origin.
	const anchors = buildAnchors(existingHomeZones);

	const radii = [10, 14, 18, 24, 32];

	for (const anchor of anchors) {
		for (const radius of radii) {
			for (let attempt = 0; attempt < 12; attempt++) {
				const orientation = pickOrientation(attempt, usedOrientations);
				const { x, z } = sampleAroundAnchor(anchor, radius, orientation);

				if (!hasAdequateSpace(x, z, orientation, homeZoneWidth, homeZoneHeight, existingHomeZones)) {
					continue;
				}
				if (!isValidHomePosition(x, z, orientation, homeZoneWidth, homeZoneHeight, pawnPaths, 8)) {
					continue;
				}
				// Prefer (but don't require) positions that enable pawn clashes at 7.
				if (hasPartialPawnClash(x, z, orientation, homeZoneWidth, homeZoneHeight, pawnPaths, 7)) {
					return { x, z, orientation };
				}
			}
		}
	}

	// Second pass: same anchors, but accept any valid position (no clash requirement).
	for (const anchor of anchors) {
		for (const radius of radii) {
			for (let attempt = 0; attempt < 10; attempt++) {
				const orientation = pickOrientation(attempt, usedOrientations);
				const { x, z } = sampleAroundAnchor(anchor, radius, orientation);

				if (hasAdequateSpace(x, z, orientation, homeZoneWidth, homeZoneHeight, existingHomeZones)
					&& isValidHomePosition(x, z, orientation, homeZoneWidth, homeZoneHeight, pawnPaths, 8)) {
					return { x, z, orientation };
				}
			}
		}
	}

	return calculateFallbackPosition(existingHomeZones, homeZoneWidth, homeZoneHeight);
}

function makeFirstPlayerHomePosition() {
	const orientation = Math.floor(Math.random() * 4);
	let x = 0;
	let z = 0;
	switch (orientation) {
		case 0: z = 8; break;
		case 1: x = -8; break;
		case 2: z = -8; break;
		case 3: x = 8; break;
	}
	return { x, z, orientation };
}

/**
 * Collect home zones the placement engine should respect.
 *
 * Eliminated players' zones are skipped so a fresh joiner isn't
 * anchored to dead-king corpses scattered around the world (the
 * user flagged this — new games were spawning far from anyone
 * alive because long-dead players still owned home zones).
 */
function collectExistingHomeZones(gameState) {
	const zones = [];
	if (!gameState || !gameState.homeZones) return zones;
	const players = (gameState && gameState.players) || {};
	for (const playerId in gameState.homeZones) {
		if (!gameState.homeZones[playerId]) continue;
		const player = players[playerId];
		if (player && player.eliminated) continue;
		zones.push(gameState.homeZones[playerId]);
	}
	return zones;
}

function homeZoneCentre(zone) {
	return {
		x: zone.x + (zone.width || 8) / 2,
		z: zone.z + (zone.height || 2) / 2,
	};
}

function buildAnchors(existingHomeZones) {
	if (existingHomeZones.length === 0) return [{ x: 0, z: 0 }];

	// Centroid of existing zones - the heart of the cluster.
	let sumX = 0;
	let sumZ = 0;
	for (const zone of existingHomeZones) {
		const c = homeZoneCentre(zone);
		sumX += c.x;
		sumZ += c.z;
	}
	const centroid = {
		x: Math.round(sumX / existingHomeZones.length),
		z: Math.round(sumZ / existingHomeZones.length),
	};

	const anchors = [centroid];

	// Pick up to 3 random existing zones as alternative anchors so new
	// players can also seed next to a specific neighbour rather than
	// strictly the centroid.
	const shuffled = existingHomeZones.slice().sort(() => Math.random() - 0.5);
	for (let i = 0; i < Math.min(3, shuffled.length); i++) {
		anchors.push(homeZoneCentre(shuffled[i]));
	}
	return anchors;
}

function pickOrientation(attempt, usedOrientations) {
	if (attempt % 2 === 0 && usedOrientations && usedOrientations.length > 0) {
		const unused = [0, 1, 2, 3].filter(o => !usedOrientations.includes(o));
		if (unused.length > 0) {
			return unused[Math.floor(Math.random() * unused.length)];
		}
	}
	return Math.floor(Math.random() * 4);
}

function sampleAroundAnchor(anchor, radius, orientation) {
	const angle = Math.random() * Math.PI * 2;
	const jitter = radius * 0.25;
	const distance = radius + (Math.random() * 2 - 1) * jitter;
	let x = Math.round(anchor.x + Math.cos(angle) * distance);
	let z = Math.round(anchor.z + Math.sin(angle) * distance);
	switch (orientation) {
		case 0: z += 8; break;
		case 1: x -= 8; break;
		case 2: z -= 8; break;
		case 3: x += 8; break;
	}
	return { x, z };
}

/**
 * Check if a potential home zone position has adequate space around it
 * - 8 spaces in front for pawn movement (minimum requirement)
 * - 7 spaces on the other three sides
 * 
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} orientation - Orientation (0-3)
 * @param {number} width - Home zone width
 * @param {number} height - Home zone height
 * @param {Array} existingHomeZones - Array of existing home zones
 * @returns {boolean} True if position has adequate space
 */
function hasAdequateSpace(x, z, orientation, width, height, existingHomeZones) {
	// Define the space requirements
	const frontSpace = 8; // Spaces for pawns to move forward (MINIMUM REQUIREMENT)
	const sideSpace = 7; // Spaces on the other three sides

	// No need to check board boundaries in infinite board model
	// We only need to check for overlap with existing home zones
	
	// Check for collisions with existing home zones (including their required space)
	for (const zone of existingHomeZones) {
		// We need to check if this new home zone (plus its required space)
		// overlaps with any existing home zone (plus its required space)
		
		// Determine the extended area of this new home zone including its required space
		let newMinX, newMaxX, newMinZ, newMaxZ;
		
		switch (orientation) {
			case 0: // Facing up
				newMinX = x - sideSpace;
				newMaxX = x + width + sideSpace;
				newMinZ = z - frontSpace;
				newMaxZ = z + height + sideSpace;
				break;
				
			case 1: // Facing right
				newMinX = x - sideSpace;
				newMaxX = x + width + frontSpace;
				newMinZ = z - sideSpace;
				newMaxZ = z + height + sideSpace;
				break;
				
			case 2: // Facing down
				newMinX = x - sideSpace;
				newMaxX = x + width + sideSpace;
				newMinZ = z - sideSpace;
				newMaxZ = z + height + frontSpace;
				break;
				
			case 3: // Facing left
				newMinX = x - frontSpace;
				newMaxX = x + width + sideSpace;
				newMinZ = z - sideSpace;
				newMaxZ = z + height + sideSpace;
				break;
		}
		
		// Determine the extended area of the existing home zone including its required space
		let existingMinX, existingMaxX, existingMinZ, existingMaxZ;
		
		switch (zone.orientation) {
			case 0: // Facing up
				existingMinX = zone.x - sideSpace;
				existingMaxX = zone.x + zone.width + sideSpace;
				existingMinZ = zone.z - frontSpace;
				existingMaxZ = zone.z + zone.height + sideSpace;
				break;
				
			case 1: // Facing right
				existingMinX = zone.x - sideSpace;
				existingMaxX = zone.x + zone.width + frontSpace;
				existingMinZ = zone.z - sideSpace;
				existingMaxZ = zone.z + zone.height + sideSpace;
				break;
				
			case 2: // Facing down
				existingMinX = zone.x - sideSpace;
				existingMaxX = zone.x + zone.width + sideSpace;
				existingMinZ = zone.z - sideSpace;
				existingMaxZ = zone.z + zone.height + frontSpace;
				break;
				
			case 3: // Facing left
				existingMinX = zone.x - frontSpace;
				existingMaxX = zone.x + zone.width + sideSpace;
				existingMinZ = zone.z - sideSpace;
				existingMaxZ = zone.z + zone.height + sideSpace;
				break;
		}
		
		// Check for overlap with an increased safety margin
		const safetyMargin = 4; // Increased from 2 to 4 for more space between zones

		const hasXOverlap = !(newMaxX + safetyMargin <= existingMinX || newMinX >= existingMaxX + safetyMargin);
		const hasZOverlap = !(newMaxZ + safetyMargin <= existingMinZ || newMinZ >= existingMaxZ + safetyMargin);

		// If there's overlap in both X and Z dimensions, the zones overlap
		if (hasXOverlap && hasZOverlap) {
			return false;
		}
	}

	return true;
}

/**
 * Calculate existing pawn paths for all players
 * @param {Array} homeZones - Array of home zone objects
 * @returns {Array} Array of pawn path objects with position and direction
 */
function calculateExistingPawnPaths(homeZones) {
	const pawnPaths = [];
	
	for (const homeZone of homeZones) {
		const { x, z, width, height, orientation } = homeZone;
		
		// For each pawn position in the home zone (assuming front row/column has pawns)
		for (let i = 0; i < width; i++) {
			let pawnX, pawnZ, dirX = 0, dirZ = 0;
			
			switch (orientation) {
				case 0: // Facing up - pawns at bottom
					pawnX = x + i;
					pawnZ = z;
					dirZ = -1; // Pawns move up
					break;
				case 1: // Facing right - pawns at left
					pawnX = x;
					pawnZ = z + i;
					dirX = 1; // Pawns move right
					break;
				case 2: // Facing down - pawns at top
					pawnX = x + i;
					pawnZ = z + height - 1;
					dirZ = 1; // Pawns move down
					break;
				case 3: // Facing left - pawns at right
					pawnX = x + width - 1;
					pawnZ = z + i;
					dirX = -1; // Pawns move left
					break;
			}
			
			pawnPaths.push({
				startX: pawnX,
				startZ: pawnZ,
				dirX,
				dirZ
			});
		}
	}
	
	return pawnPaths;
}

/**
 * Check if a potential home zone position is valid (not in direct path of other pawns)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} orientation - Orientation (0-3)
 * @param {number} width - Home zone width
 * @param {number} height - Home zone height
 * @param {Array} pawnPaths - Array of existing pawn paths
 * @param {number} moveDistance - How many spaces forward to check
 * @returns {boolean} True if position is valid
 */
function isValidHomePosition(x, z, orientation, width, height, pawnPaths, moveDistance) {
	// Get the cells that would be occupied by this home zone
	const homeCells = [];
	
	for (let dx = 0; dx < width; dx++) {
		for (let dz = 0; dz < height; dz++) {
			homeCells.push({ x: x + dx, z: z + dz });
		}
	}
	
	// Check if any home cells are in the path of existing pawns
	for (const path of pawnPaths) {
		for (let move = 1; move <= moveDistance; move++) {
			const pathX = path.startX + (path.dirX * move);
			const pathZ = path.startZ + (path.dirZ * move);
			
			// Check if this path position conflicts with any home cell
			if (homeCells.some(cell => cell.x === pathX && cell.z === pathZ)) {
				return false;
			}
		}
	}
	
	return true;
}

/**
 * Check if the position allows for pawn clashing at a given distance
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} orientation - Orientation (0-3)
 * @param {number} width - Home zone width
 * @param {number} height - Home zone height
 * @param {Array} pawnPaths - Array of existing pawn paths
 * @param {number} clashDistance - Distance at which pawns should clash (typically 7)
 * @returns {boolean} True if at least 2 pawns can clash at the specified distance
 */
function hasPartialPawnClash(x, z, orientation, width, height, pawnPaths, clashDistance) {
	// If no existing pawns, any position is valid
	if (pawnPaths.length === 0) return true;
	
	// Calculate pawn positions for this potential home zone
	const newPawnPaths = [];
	
	switch (orientation) {
		case 0: // Facing up - pawns at bottom
			for (let i = 0; i < width; i++) {
				newPawnPaths.push({
					startX: x + i,
					startZ: z,
					dirX: 0,
					dirZ: -1
				});
			}
			break;
		case 1: // Facing right - pawns at left
			for (let i = 0; i < height; i++) {
				newPawnPaths.push({
					startX: x,
					startZ: z + i,
					dirX: 1,
					dirZ: 0
				});
			}
			break;
		case 2: // Facing down - pawns at top
			for (let i = 0; i < width; i++) {
				newPawnPaths.push({
					startX: x + i,
					startZ: z + height - 1,
					dirX: 0,
					dirZ: 1
				});
			}
			break;
		case 3: // Facing left - pawns at right
			for (let i = 0; i < height; i++) {
				newPawnPaths.push({
					startX: x + width - 1,
					startZ: z + i,
					dirX: -1,
					dirZ: 0
				});
			}
			break;
	}
	
	// Count potential pawn clashes at clashDistance
	let clashCount = 0;
	
	// Track which existing paths provide clashes to ensure they're from different players
	const clashingPathIndices = new Set();
	
	for (const newPath of newPawnPaths) {
		// Calculate where this pawn would be after moving clashDistance spaces
		const newPathX = newPath.startX + (newPath.dirX * clashDistance);
		const newPathZ = newPath.startZ + (newPath.dirZ * clashDistance);
		
		// Check existing pawns for clash
		for (let i = 0; i < pawnPaths.length; i++) {
			const existingPath = pawnPaths[i];
			const existingPathX = existingPath.startX + (existingPath.dirX * clashDistance);
			const existingPathZ = existingPath.startZ + (existingPath.dirZ * clashDistance);
			
			// If positions match, we have a clash
			if (newPathX === existingPathX && newPathZ === existingPathZ) {
				clashCount++;
				clashingPathIndices.add(i);
				
				// We need at least 2 clashes, preferably from different directions
				if (clashCount >= 2 && clashingPathIndices.size >= 1) {
					return true;
				}
			}
		}
	}
	
	// Not enough clashes found
	return false;
}

/**
 * Calculate a fallback position when normal home zone placement fails
 * @param {Array} existingHomeZones - Array of existing home zones
 * @param {number} homeZoneWidth - Home zone width
 * @param {number} homeZoneHeight - Home zone height
 * @returns {Object} Fallback position
 */
function calculateFallbackPosition(existingHomeZones, homeZoneWidth, homeZoneHeight) {
	if (existingHomeZones.length === 0) {
		return makeFirstPlayerHomePosition();
	}

	// Compute the cluster centroid so the fallback spirals out from it
	// rather than from the origin — that way an established game's
	// players stay near each other instead of seeing newcomers fling out
	// dozens of units in random directions.
	let sumX = 0;
	let sumZ = 0;
	for (const zone of existingHomeZones) {
		const c = homeZoneCentre(zone);
		sumX += c.x;
		sumZ += c.z;
	}
	const centerX = Math.round(sumX / existingHomeZones.length);
	const centerZ = Math.round(sumZ / existingHomeZones.length);

	const baseDistances = [16, 22, 28, 36, 46];
	const usedOrientations = existingHomeZones.map(zone => zone.orientation);
	const unusedOrientations = [0, 1, 2, 3].filter(o => !usedOrientations.includes(o));
	const orientationsToTry = unusedOrientations.length > 0
		? unusedOrientations.sort(() => Math.random() - 0.5)
		: [0, 1, 2, 3].sort(() => Math.random() - 0.5);

	for (const orientation of orientationsToTry) {
		for (const baseDistance of baseDistances) {
			for (let angleIndex = 0; angleIndex < 8; angleIndex++) {
				const angle = (Math.PI / 4) * angleIndex;
				const x0 = Math.round(centerX + Math.cos(angle) * baseDistance);
				const z0 = Math.round(centerZ + Math.sin(angle) * baseDistance);
				let adjustedX = x0;
				let adjustedZ = z0;
				switch (orientation) {
					case 0: adjustedZ += 8; break;
					case 1: adjustedX -= 8; break;
					case 2: adjustedZ -= 8; break;
					case 3: adjustedX += 8; break;
				}

				if (!hasAdequateSpace(adjustedX, adjustedZ, orientation, homeZoneWidth, homeZoneHeight, existingHomeZones)) {
					continue;
				}

				// Soft "stay close" rule: keep the new zone within ~50 units of
				// at least one existing zone so we never strand players in the void.
				const minSquared = 18 * 18; // not too close
				const maxFromNearest = 50 * 50; // not too far
				let nearestSquared = Infinity;
				for (const zone of existingHomeZones) {
					const zc = homeZoneCentre(zone);
					const dx = (adjustedX + homeZoneWidth / 2) - zc.x;
					const dz = (adjustedZ + homeZoneHeight / 2) - zc.z;
					const d2 = dx * dx + dz * dz;
					if (d2 < nearestSquared) nearestSquared = d2;
				}
				if (nearestSquared >= minSquared && nearestSquared <= maxFromNearest) {
					return { x: adjustedX, z: adjustedZ, orientation };
				}
			}
		}
	}

	// Absolute last resort — still near the cluster, just at a random angle.
	const orientation = Math.floor(Math.random() * 4);
	const angle = Math.random() * Math.PI * 2;
	const distance = 36 + Math.random() * 20;
	let x = Math.round(centerX + Math.cos(angle) * distance);
	let z = Math.round(centerZ + Math.sin(angle) * distance);
	switch (orientation) {
		case 0: z += 8; break;
		case 1: x -= 8; break;
		case 2: z -= 8; break;
		case 3: x += 8; break;
	}
	return { x, z, orientation };
}

/**
 * Generate home zones for all players
 * 
 * This function:
 * 1. Calculates the position and orientation for each player's home zone
 * 2. Creates the home zone cells in the game state
 * 3. Updates the gameState.homeZones object with zone information
 * 4. Places a board centre marker at (0,0,0) for reliable client-side reference
 * 
 * @param {Object} gameState - Game state object to update
 * @param {Object} players - Player data keyed by player ID
 * @returns {Object} Updated game state
 */
function generateHomeZones(gameState, players) {
	// Default to at least 2 players if none are provided
	const playerCount = players ? Object.keys(players).length : 2;
	const standardWidth = 8; // Standard chess width
	const standardHeight = 2; // Standard chess height
	
	// Always set the board centre to (0,0,0) for consistency
	if (!gameState.board) {
		gameState.board = {
			cells: {}
		};
	}
	
	// Always set the centre marker to (0,0,0) regardless of what existed before
	gameState.board.centreMarker = { x: 0, z: 0 };
	console.log("Setting consistent board centre at origin (0, 0)");
	
	// Generate home zones with controlled pawn clashing
	const homeZones = {};
	
	// For each player
	Object.keys(players).forEach((playerId, index) => {
		// Get position with controlled pawn clashing
		const homePosition = calculateHomePosition(
			index,
			gameState,
			standardWidth,
			standardHeight
		);
		
		// Determine the actual width and height based on orientation
		// For vertical orientations (1,3), swap width and height
		let zoneWidth, zoneHeight;
		
		if (homePosition.orientation === 1 || homePosition.orientation === 3) {
			// Vertical layout - swap dimensions
			zoneWidth = standardHeight;
			zoneHeight = standardWidth;
		} else {
			// Horizontal layout - standard dimensions
			zoneWidth = standardWidth;
			zoneHeight = standardHeight;
		}
		
		// Store home zone information with correct dimensions
		homeZones[playerId] = {
			x: homePosition.x,
			z: homePosition.z,
			width: zoneWidth,
			height: zoneHeight,
			orientation: homePosition.orientation
		};
		
		// Create home zone cells on the board with the correct dimensions
		for (let dz = 0; dz < zoneHeight; dz++) {
			for (let dx = 0; dx < zoneWidth; dx++) {
				const x = homePosition.x + dx;
				const z = homePosition.z + dz;
				
				// Ensure cells object exists
				if (!gameState.board.cells) {
					gameState.board.cells = {};
				}
				
				// Cell key in format "x,z"
				const cellKey = `${x},${z}`;
				
				// Create or update the cell
				gameState.board.cells[cellKey] = {
					type: 'homeZone',
					player: playerId
				};
			}
		}
	});
	
	// Store home zones in game state
	gameState.homeZones = homeZones;
	
	// Always use (0,0) as the board centre
	const centreX = 0;
	const centreZ = 0;
	const centreKey = `${centreX},${centreZ}`;
	
	// Create or update the centre marker cell
	// If there's already a cell at (0,0), we'll still mark it as the centre
	gameState.board.cells[centreKey] = gameState.board.cells[centreKey] || {};
	
	// Attach a special marker that will be recognisable and preserved
	gameState.board.cells[centreKey].specialMarker = {
		type: 'boardCentre',
		isCentreMarker: true,
		centreX,
		centreZ
	};
	
	// Also record the centre point in the board properties for easy access
	gameState.board.centreMarker = {
		x: centreX,
		z: centreZ
	};
	
	console.log(`Board centre marker placed at fixed position (${centreX}, ${centreZ})`);
	
	return gameState;
}

/**
 * Create initial chess pieces for a player
 * 
 * This function places chess pieces in a player's home zone with the correct
 * orientation based on the home zone's position. The pieces are arranged differently
 * depending on whether the orientation is horizontal (0, 2) or vertical (1, 3).
 * 
 * For each orientation:
 * - 0: Pawns at bottom row, pieces face up
 * - 1: Pawns at leftmost column, pieces face right
 * - 2: Pawns at top row, pieces face down
 * - 3: Pawns at rightmost column, pieces face left
 * 
 * @param {Object} gameState - Game state to update
 * @param {string} playerId - Player ID
 * @returns {Object} Updated game state
 */
function createInitialChessPieces(gameState, playerId) {
	// Get home zone for this player
	const homeZone = gameState.homeZones[playerId];
	if (!homeZone) {
		console.error(`No home zone found for player ${playerId}`);
		return gameState;
	}
	
	// Standard chess piece arrangement
	const backRowPieces = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
	const frontRowPieces = Array(8).fill('PAWN');
	
	// Determine piece positioning based on home zone orientation
	let xOffset, zOffset, xDir, zDir;
	
	switch (homeZone.orientation) {
		case 0: // Facing up - pawns at bottom
			xOffset = 0; // Start from left side of zone
			zOffset = 0; // Start from bottom of zone (pawns row)
			xDir = 1;    // Move right along the row
			zDir = 1;    // Back row is one step up
			break;
			
		case 1: // Facing right - pawns at left
			xOffset = 0; // Start from left side (pawns column)
			zOffset = 0; // Start from top of zone
			xDir = 1;    // Back row is one step right
			zDir = 1;    // Move down along the column
			break;
			
		case 2: // Facing down - pawns at top
			xOffset = 7; // Start from right side of zone
			zOffset = 0; // Start from top of zone (pawns row)
			xDir = -1;   // Move left along the row
			zDir = 1;    // Back row is one step down
			break;
			
		case 3: // Facing left - pawns at right
			xOffset = 7; // Start from right side (pawns column)
			zOffset = 0; // Start from top of zone
			xDir = -1;   // Back row is one step left
			zDir = 1;    // Move down along the column
			break;
			
		default:
			xOffset = 0;
			zOffset = 0;
			xDir = 1;
			zDir = 1;
	}
	
	console.log(`Creating initial chess pieces for player ${playerId} with orientation ${homeZone.orientation}`);

	// Create pieces based on orientation
	if (homeZone.orientation === 0 || homeZone.orientation === 2) {
		// Horizontal layout (orientation 0 or 2)
		
		// Create pawns (front row)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const x = homeZone.x + xOffset + (i * xDir);
			const z = homeZone.z + zOffset;
			
			addChessPiece(gameState, 'PAWN', x, z, playerId, homeZone.orientation);
		}
		
		// Create back row pieces
		for (let i = 0; i < backRowPieces.length; i++) {
			const x = homeZone.x + xOffset + (i * xDir);
			const z = homeZone.z + zOffset + zDir;
			
			addChessPiece(gameState, backRowPieces[i], x, z, playerId, homeZone.orientation);
		}
	} else {
		// Vertical layout (orientation 1 or 3)
		
		// Create pawns (front column)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const x = homeZone.x + xOffset;
			const z = homeZone.z + zOffset + (i * zDir);
			
			addChessPiece(gameState, 'PAWN', x, z, playerId, homeZone.orientation);
		}
		
		// Create back column pieces
		for (let i = 0; i < backRowPieces.length; i++) {
			const x = homeZone.x + xOffset + xDir;
			const z = homeZone.z + zOffset + (i * zDir);
			
			addChessPiece(gameState, backRowPieces[i], x, z, playerId, homeZone.orientation);
		}
	}
	
	return gameState;
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

// Export functions for use in server
module.exports = {
	calculateHomePosition,
	generateHomeZones,
	createInitialChessPieces
}; 
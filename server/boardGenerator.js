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
 * Calculate home zone position with controlled pawn clashing
 * 
 * This algorithm:
 * 1. Uses a randomized approach with specific constraints
 * 2. Ensures home cells have 8 spaces in front of them and 7 on the other 3 sides
 * 3. Ensures home cells aren't directly in the path of other players' pawns (8 spaces)
 * 4. Arranges for potential pawn clashing after 7 moves (partial clash) 
 * 5. Falls back to placement relative to the furthest cell if needed
 * 
 * @param {number} playerIndex - Player index (0-based)
 * @param {Object} gameState - Current game state to check existing positions
 * @param {number} homeZoneWidth - Home zone width (typically 8 for chess)
 * @param {number} homeZoneHeight - Home zone height (typically 2 for chess)
 * @returns {Object} Position and orientation for the home zone
 */
function calculateHomePosition(playerIndex, gameState, homeZoneWidth, homeZoneHeight) {
	// For the first player, place at origin with a random orientation
	if (playerIndex === 0) {
		const randomOrientation = Math.floor(Math.random() * 4); // 0-3
		
		// Start at origin (0,0)
		let x = 0;
		let z = 0;
		
		// Ensure minimum 8 spaces in front of pawns
		switch (randomOrientation) {
			case 0: // Facing up - ensure space above
				z = 8; // Provide space for pawns to move up
				break;
			case 1: // Facing right - ensure space to right
				x = -8; // Move left to provide space for pawns to move right
				break;
			case 2: // Facing down - ensure space below
				z = -8; // Move up to provide space for pawns to move down
				break;
			case 3: // Facing left - ensure space to left
				x = 8; // Provide space for pawns to move left
				break;
		}
		
		return {
			x,
			z,
			orientation: randomOrientation
		};
	}
	
	// Get existing player home zones
	const existingHomeZones = [];
	if (gameState && gameState.homeZones) {
		for (const playerId in gameState.homeZones) {
			existingHomeZones.push(gameState.homeZones[playerId]);
		}
	}
	
	// Track pawn paths for existing players
	const pawnPaths = calculateExistingPawnPaths(existingHomeZones);
	
	// Try to find a valid position with 100 attempts, prioritizing varied orientations
	// For better variety, prioritize orientations not already used
	const usedOrientations = existingHomeZones.map(zone => zone.orientation);
	
	// The distance at which pawns should clash (preferable)
	const clashDistance = 7;
	
	// Start with closer placement attempts and increase distance gradually
	for (let distanceIndex = 0; distanceIndex < 5; distanceIndex++) {
		// Start with a close distance and gradually increase if needed
		const initialSpread = 15 + (distanceIndex * 5); // Start at 15, then 20, 25, 30, 35
		const maxAttempts = 30 - (distanceIndex * 5); // More attempts for closer distances
		
		console.log(`Trying home zone placement with distance spread: ${initialSpread}`);
		
		// Try to find a valid position with multiple attempts at this distance
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Generate random position
			let randomOrientation;
			
			// Every other attempt, try to use an orientation that's not already in use
			if (attempt % 2 === 0 && usedOrientations.length > 0) {
				// Create array of orientations [0,1,2,3]
				const allOrientations = [0, 1, 2, 3];
				// Filter out used orientations
				const unusedOrientations = allOrientations.filter(o => !usedOrientations.includes(o));
				
				if (unusedOrientations.length > 0) {
					// Choose random unused orientation
					randomOrientation = unusedOrientations[Math.floor(Math.random() * unusedOrientations.length)];
				} else {
					// If all orientations are used, just choose random
					randomOrientation = Math.floor(Math.random() * 4);
				}
			} else {
				// Standard random orientation
				randomOrientation = Math.floor(Math.random() * 4);
			}
			
			// Always use (0,0) as the reference point rather than averaging existing zones
			// This ensures consistency in home zone placement
			const centerX = 0;
			const centerZ = 0;
			
			// Generate position within reasonable range of origin point
			// Add randomness to avoid grid-like placement
			const angle = Math.random() * Math.PI * 2; // Random angle 0-2π
			
			// Use the current distance index to determine placement distance
			const distance = initialSpread + (Math.random() * 10); // Add a small random variation
			
			let x = Math.round(centerX + Math.cos(angle) * distance);
			let z = Math.round(centerZ + Math.sin(angle) * distance);
			
			// Adjust position based on orientation to ensure enough space for pawns to move
			switch (randomOrientation) {
				case 0: // Facing up - pawns at bottom
					z += 8; // Ensure space above for pawns
					break;
				case 1: // Facing right - pawns at left
					x -= 8; // Ensure space to right for pawns
					break;
				case 2: // Facing down - pawns at top
					z -= 8; // Ensure space below for pawns
					break;
				case 3: // Facing left - pawns at right
					x += 8; // Ensure space to left for pawns
					break;
			}
			
			// First check if the position has adequate space
			if (!hasAdequateSpace(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, existingHomeZones)) {
				continue;
			}
			
			// Then check if position is valid (not in direct path of other pawns at 8 moves)
			if (!isValidHomePosition(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, pawnPaths, 8)) {
				continue;
			}
			
			// Finally check if position enables clashing at 7 spaces (preferred)
			if (hasPartialPawnClash(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, pawnPaths, clashDistance)) {
				console.log(`Found valid position at distance ${distance} with orientation ${randomOrientation}`);
				return {
					x,
					z,
					orientation: randomOrientation
				};
			}
		}
	}
	
	// If close distances don't work, try with reduced constraints at medium distances
	console.log("Trying medium distances with reduced constraints (no clash requirement)");
	for (let distanceIndex = 0; distanceIndex < 3; distanceIndex++) {
		// Use medium distances (25-35)
		const initialSpread = 20 + (distanceIndex * 5);
		const maxAttempts = 20;
		
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Use the same orientation prioritization logic for better variety
			let randomOrientation;
			
			if (attempt % 2 === 0 && usedOrientations.length > 0) {
				const allOrientations = [0, 1, 2, 3];
				const unusedOrientations = allOrientations.filter(o => !usedOrientations.includes(o));
				
				if (unusedOrientations.length > 0) {
					randomOrientation = unusedOrientations[Math.floor(Math.random() * unusedOrientations.length)];
				} else {
					randomOrientation = Math.floor(Math.random() * 4);
				}
			} else {
				randomOrientation = Math.floor(Math.random() * 4);
			}
			
			// Always use (0,0) as the reference point
			const centerX = 0;
			const centerZ = 0;
			
			// Generate position with medium distance
			const angle = Math.random() * Math.PI * 2;
			const distance = initialSpread + (Math.random() * 10);
			
			let x = Math.round(centerX + Math.cos(angle) * distance);
			let z = Math.round(centerZ + Math.sin(angle) * distance);
			
			// Adjust position based on orientation to ensure space for pawns
			switch (randomOrientation) {
				case 0: // Facing up - pawns at bottom
					z += 8; // Ensure space above for pawns
					break;
				case 1: // Facing right - pawns at left
					x -= 8; // Ensure space to right for pawns
					break;
				case 2: // Facing down - pawns at top
					z -= 8; // Ensure space below for pawns
					break;
				case 3: // Facing left - pawns at right
					x += 8; // Ensure space to left for pawns
					break;
			}
			
			// Only check for adequate space and valid position (no clash requirement)
			if (hasAdequateSpace(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, existingHomeZones) &&
				isValidHomePosition(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, pawnPaths, 8)) {
				console.log(`Found position with medium distance ${distance} with orientation ${randomOrientation}`);
				return {
					x,
					z,
					orientation: randomOrientation
				};
			}
		}
	}
	
	// If no valid position found, use fallback method
	return calculateFallbackPosition(existingHomeZones, homeZoneWidth, homeZoneHeight);
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
	
	// Log position being checked
	console.log(`Checking space at (${x}, ${z}) with orientation ${orientation}, dimensions ${width}x${height}`);
	
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
		
		// Log the bounds for debugging
		console.log(`New zone bounds: X(${newMinX}-${newMaxX}), Z(${newMinZ}-${newMaxZ})`);
		console.log(`Existing zone bounds: X(${existingMinX}-${existingMaxX}), Z(${existingMinZ}-${existingMaxZ})`);
		
		// Check if there's any overlap between the zones (including safety margin)
		const hasXOverlap = !(newMaxX + safetyMargin <= existingMinX || newMinX >= existingMaxX + safetyMargin);
		const hasZOverlap = !(newMaxZ + safetyMargin <= existingMinZ || newMinZ >= existingMaxZ + safetyMargin);
		
		// If there's overlap in both X and Z dimensions, the zones overlap
		if (hasXOverlap && hasZOverlap) {
			console.log(`Failed space check: overlap with existing home zone at (${zone.x}, ${zone.z})`);
			console.log(`X overlap: ${hasXOverlap}, Z overlap: ${hasZOverlap}`);
			return false; // Overlap detected
		}
	}
	
	console.log(`Space check passed for (${x}, ${z}) with orientation ${orientation}`);
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
	console.log("Using fallback position calculation with more aggressive spacing");
	
	// Always use (0,0) as the reference point for consistent positioning
	const centerX = 0;
	const centerZ = 0;
	
	// If no existing zones, place at origin with random orientation
	if (existingHomeZones.length === 0) {
		const randomOrientation = Math.floor(Math.random() * 4);
		let x = 0;
		let z = 0;
		
		// Adjust for orientation
		switch (randomOrientation) {
			case 0: z += 8; break; // Facing up
			case 1: x -= 8; break; // Facing right
			case 2: z -= 8; break; // Facing down
			case 3: x += 8; break; // Facing left
		}
		
		return { x, z, orientation: randomOrientation };
	}
	
	// Try positions at increasing distances in a spiral pattern
	// Use larger distances than before to ensure better spacing
	const baseDistances = [40, 50, 60, 70, 80];
	
	// Get the used orientations for variety
	const usedOrientations = existingHomeZones.map(zone => zone.orientation);
	const allOrientations = [0, 1, 2, 3];
	const unusedOrientations = allOrientations.filter(o => !usedOrientations.includes(o));
	
	// Try each possible orientation in a randomized order
	const orientationsToTry = [...unusedOrientations];
	if (orientationsToTry.length === 0) {
		// If all orientations are used, just use a shuffled array of all orientations
		orientationsToTry.push(...allOrientations.sort(() => Math.random() - 0.5));
	} else {
		// Shuffle the unused orientations
		orientationsToTry.sort(() => Math.random() - 0.5);
	}
	
	// Try each orientation with different distances
	for (const orientation of orientationsToTry) {
		for (const baseDistance of baseDistances) {
			// Try 8 different angles around the center (more precise placement)
			for (let angleIndex = 0; angleIndex < 8; angleIndex++) {
				const angle = (Math.PI / 4) * angleIndex; // 45-degree increments for better coverage
				
				// Calculate position at this distance and angle
				const x = Math.round(centerX + Math.cos(angle) * baseDistance);
				const z = Math.round(centerZ + Math.sin(angle) * baseDistance);
				
				// Adjust for pawn space
				let adjustedX = x;
				let adjustedZ = z;
				
				switch (orientation) {
					case 0: adjustedZ += 8; break; // Facing up
					case 1: adjustedX -= 8; break; // Facing right
					case 2: adjustedZ -= 8; break; // Facing down
					case 3: adjustedX += 8; break; // Facing left
				}
				
				// Check if this position works - do a thorough check
				if (hasAdequateSpace(adjustedX, adjustedZ, orientation, homeZoneWidth, homeZoneHeight, existingHomeZones)) {
					console.log(`Found fallback position at distance ${baseDistance} with orientation ${orientation}, angle ${angleIndex * 45}°`);
					
					// Double-check with direct distance measurements to each existing zone center
					let isTooClose = false;
					const minDistanceSquared = 30 * 30; // Minimum 30 units between zone centers
					
					for (const zone of existingHomeZones) {
						// Calculate zone centers
						const zoneX = zone.x + zone.width / 2;
						const zoneZ = zone.z + zone.height / 2;
						const newZoneX = adjustedX + homeZoneWidth / 2;
						const newZoneZ = adjustedZ + homeZoneHeight / 2;
						
						// Calculate squared distance between centers (faster than using Math.sqrt)
						const dx = newZoneX - zoneX;
						const dz = newZoneZ - zoneZ;
						const distanceSquared = dx * dx + dz * dz;
						
						console.log(`Distance to zone at (${zone.x}, ${zone.z}): ${Math.sqrt(distanceSquared)}`);
						
						if (distanceSquared < minDistanceSquared) {
							isTooClose = true;
							console.log(`Too close to existing zone: ${Math.sqrt(distanceSquared)} units`);
							break;
						}
					}
					
					if (!isTooClose) {
						return {
							x: adjustedX,
							z: adjustedZ,
							orientation
						};
					}
				}
			}
		}
	}
	
	// If all else fails, use completely random position very far from existing zones
	const randomOrientation = Math.floor(Math.random() * 4);
	const randomAngle = Math.random() * Math.PI * 2;
	const randomDistance = 100 + Math.random() * 50; // 100-150 units away (increased for safety)
	
	let x = Math.round(centerX + Math.cos(randomAngle) * randomDistance);
	let z = Math.round(centerZ + Math.sin(randomAngle) * randomDistance);
	
	// Adjust for pawn space based on orientation
	switch (randomOrientation) {
		case 0: z += 8; break; // Facing up
		case 1: x -= 8; break; // Facing right
		case 2: z -= 8; break; // Facing down
		case 3: x += 8; break; // Facing left
	}
	
	console.log(`Selected final fallback position at (${x}, ${z}) with orientation ${randomOrientation}, distance ${randomDistance}`);
	return { x, z, orientation: randomOrientation };
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
/**
 * Centre Board Marker Module
 * 
 * This module manages the centre board marker, which is critical for
 * correctly positioning visual elements relative to the board's centre.
 */

/**
 * Find the board centre marker in the game state
 * 
 * @param {Object} gameState - The game state object
 * @returns {Object|null} - The centre marker {x, z} or null if not found
 */
export function findBoardCentreMarker(gameState) {
	// First check for direct reference in board
	if (gameState.board && gameState.board.centreMarker &&
		typeof gameState.board.centreMarker.x === 'number' &&
		typeof gameState.board.centreMarker.z === 'number') {
		return gameState.board.centreMarker;
	}
	
	// No direct reference, check all cells
	if (gameState.board && gameState.board.cells) {
		for (const key in gameState.board.cells) {
			const cell = gameState.board.cells[key];
			
			// Handle array format (new)
			if (Array.isArray(cell)) {
				const markerData = cell.find(item => 
					(item.type === 'specialMarker' && item.isCentreMarker) ||
					(item.type === 'boardCentre'));
					
				if (markerData) {
					const [x, z] = key.split(',').map(Number);
					console.log(`Found centre marker in cell array at (${x}, ${z})`);
					return { x, z };
				}
			}
			// Handle object format (legacy)
			else if (cell && cell.specialMarker && 
				(cell.specialMarker.type === 'boardCentre' || cell.specialMarker.isCentreMarker)) {
				const [x, z] = key.split(',').map(Number);
				console.log(`Found centre marker in cell object at (${x}, ${z})`);
				return { x, z };
			}
		}
	}
	
	// No marker found, calculate center from board bounds
	if (gameState.boardBounds) {
		const { minX, maxX, minZ, maxZ } = gameState.boardBounds;
		const x = Math.floor((minX + maxX) / 2);
		const z = Math.floor((minZ + maxZ) / 2);
		
		console.log(`No centre marker found, using calculated centre at (${x}, ${z})`);
		return { x, z };
	}
	
	// Complete fallback if there are no board bounds
	console.warn('No board bounds available for center calculation, using default (15,15)');
	return { x: 15, z: 15 };
}

/**
 * Create a centre marker in the game state
 * 
 * @param {Object} gameState - The game state to modify
 * @param {number} x - X coordinate for the centre marker
 * @param {number} z - Z coordinate for the centre marker
 * @returns {Object} The created centre marker {x, z}
 */
export function createCentreMarker(gameState, x, z) {
	// Ensure we have valid coordinates
	if (x === undefined || z === undefined) {
		const marker = findBoardCentreMarker(gameState);
		x = marker.x;
		z = marker.z;
	}
	
	console.log(`Creating centre marker at (${x}, ${z})`);
	
	// Add direct reference
	if (gameState.board) {
		gameState.board.centreMarker = { x, z };
		
		// Add to cells
		if (gameState.board.cells) {
			const key = `${x},${z}`;
			
			if (!gameState.board.cells[key]) {
				// Create new cell with special marker
				gameState.board.cells[key] = [{
					type: 'specialMarker',
					isCentreMarker: true,
					centreX: x,
					centreZ: z
				}];
			} else if (Array.isArray(gameState.board.cells[key])) {
				// Check if marker already exists in array
				const markerExists = gameState.board.cells[key].some(item => 
					(item.type === 'specialMarker' && item.isCentreMarker) ||
					(item.type === 'boardCentre'));
					
				if (!markerExists) {
					// Add to existing array
					gameState.board.cells[key].push({
						type: 'specialMarker',
						isCentreMarker: true,
						centreX: x,
						centreZ: z
					});
				}
			} else if (typeof gameState.board.cells[key] === 'object') {
				// Legacy format - add special marker property
				gameState.board.cells[key].specialMarker = {
					type: 'boardCentre',
					isCentreMarker: true,
					centreX: x,
					centreZ: z
				};
			}
		}
	}
	
	return { x, z };
}

/**
 * Preserve the centre marker from one game state to another
 * 
 * @param {Object} gameState - The current game state
 * @param {Object} newBoardData - The new board data
 * @returns {Object} The preserved centre marker {x, z}
 */
export function preserveCentreMarker(gameState, newBoardData) {
	// Find the centre marker in the current game state
	const marker = findBoardCentreMarker(gameState);
	
	// Check if the new board data already has a centre marker
	if (newBoardData.centreMarker) {
		console.log(`New board data has centre marker at (${newBoardData.centreMarker.x}, ${newBoardData.centreMarker.z})`);
		return newBoardData.centreMarker;
	}
	
	// If not, create one at the same location as the current marker
	if (marker) {
		console.log(`Preserving centre marker at (${marker.x}, ${marker.z})`);
		
		// Add the marker to the new board data
		newBoardData.centreMarker = { x: marker.x, z: marker.z };
		
		// Also add it to the cells structure
		if (newBoardData.cells) {
			const key = `${marker.x},${marker.z}`;
			
			if (!newBoardData.cells[key]) {
				newBoardData.cells[key] = [{
					type: 'specialMarker',
					isCentreMarker: true,
					centreX: marker.x,
					centreZ: marker.z
				}];
			} else if (Array.isArray(newBoardData.cells[key])) {
				// Check if marker already exists
				const markerExists = newBoardData.cells[key].some(item => 
					(item.type === 'specialMarker' && item.isCentreMarker) ||
					(item.type === 'boardCentre'));
					
				if (!markerExists) {
					newBoardData.cells[key].push({
						type: 'specialMarker',
						isCentreMarker: true,
						centreX: marker.x,
						centreZ: marker.z
					});
				}
			} else if (typeof newBoardData.cells[key] === 'object') {
				newBoardData.cells[key].specialMarker = {
					type: 'boardCentre',
					isCentreMarker: true,
					centreX: marker.x,
					centreZ: marker.z
				};
			}
		}
		
		return marker;
	}
	
	// If no marker exists in current game state, calculate a new one
	const { minX, maxX, minZ, maxZ } = newBoardData;
	const x = Math.floor((minX + maxX) / 2);
	const z = Math.floor((minZ + maxZ) / 2);
	
	console.log(`Creating new centre marker at (${x}, ${z})`);
	
	// Create the marker
	newBoardData.centreMarker = { x, z };
	
	// Add to cells structure
	if (newBoardData.cells) {
		const key = `${x},${z}`;
		
		if (!newBoardData.cells[key]) {
			newBoardData.cells[key] = [{
				type: 'specialMarker',
				isCentreMarker: true,
				centreX: x,
				centreZ: z
			}];
		} else if (Array.isArray(newBoardData.cells[key])) {
			newBoardData.cells[key].push({
				type: 'specialMarker',
				isCentreMarker: true,
				centreX: x,
				centreZ: z
			});
		} else if (typeof newBoardData.cells[key] === 'object') {
			newBoardData.cells[key].specialMarker = {
				type: 'boardCentre',
				isCentreMarker: true,
				centreX: x,
				centreZ: z
			};
		}
	}
	
	return { x, z };
}

/**
 * Create a material for the centre marker
 * @param {Object} THREE - THREE.js library 
 * @returns {Object} THREE.js material
 */
export function createCentreMarkerMaterial(THREE) {
	return new THREE.MeshStandardMaterial({
		color: 0x00FF00, // Bright green for visibility
		roughness: 0.5,
		metalness: 0.5,
		transparent: true,
		opacity: 0.7 
	});
}

/**
 * Update a cell while preserving the centre marker
 * This is useful when updating cells through incremental updates.
 * 
 * @param {Object} currentCell - The existing cell data
 * @param {any} newValue - The new value to set
 * @param {Object} marker - The centre marker object
 * @returns {any} The modified new value that preserves the marker
 */
export function updateCellPreservingMarker(currentCell, newValue, marker) {
	// Early return if new value is null or undefined - we don't allow centre marker removal
	if (newValue === null || newValue === undefined) {
		console.warn('Protected centre marker from being removed');
		return currentCell; // Keep existing cell
	}
	
	// Handle array format
	if (Array.isArray(currentCell)) {
		// Find any existing marker in the array
		const markerIndex = currentCell.findIndex(item => 
			(item.type === 'specialMarker' && item.isCentreMarker) ||
			(item.type === 'boardCentre'));
			
		// If marker exists in current cell
		if (markerIndex >= 0) {
			const markerData = currentCell[markerIndex];
			
			// If new value is also an array, make sure it has the marker
			if (Array.isArray(newValue)) {
				// Check if the marker already exists in the new value
				if (!newValue.some(item => 
					(item.type === 'specialMarker' && item.isCentreMarker) ||
					(item.type === 'boardCentre'))) {
					// Add marker to new array
					newValue.push(markerData);
					console.log('Added marker to new array value');
				}
				return newValue;
			}
			// Otherwise create a new array containing the new value and the marker
			else {
				return [newValue, markerData];
			}
		}
		// No marker in current cell array, just return the new value
		else {
			return newValue;
		}
	}
	// Handle object format (legacy)
	else if (typeof currentCell === 'object' && currentCell.specialMarker) {
		// If new value is also an object, add the marker to it
		if (typeof newValue === 'object' && !Array.isArray(newValue)) {
			newValue.specialMarker = currentCell.specialMarker;
			return newValue;
		}
		// Otherwise return the current cell but update any other properties
		else {
			// If new value is simple, we can't set properties on it
			// So we keep the existing cell
			console.warn('Cannot replace object cell with non-object value at centre marker position');
			return currentCell;
		}
	}
	
	// Default - if no marker or incompatible formats, just return the new value
	return newValue;
}

// Export everything as a module
export default {
	findBoardCentreMarker,
	createCentreMarker,
	preserveCentreMarker,
	createCentreMarkerMaterial,
	updateCellPreservingMarker
}; 
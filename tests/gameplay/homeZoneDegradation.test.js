/**
 * Tests for home zone degradation
 */

// Utility function to create a mock game state
function createMockGame() {
	// Create a basic board
	const board = Array(20).fill().map(() => Array(20).fill(null));
	
	// Set up the game object
	const game = {
		board,
		players: {},
		homeZones: {},
		chessPieces: [],
		settings: {
			homeZoneDegradationInterval: 1000, // 1 second for testing
			enableHomeZoneDegradation: true
		},
		createdAt: Date.now(),
		updatedAt: Date.now()
	};
	
	return game;
}

// Utility function to add a player with a home zone
function addPlayerWithHomeZone(game, playerId, homeX, homeY, width, height) {
	// Add player
	game.players[playerId] = {
		id: playerId,
		name: `Player ${playerId}`,
		lastActivity: Date.now()
	};
	
	// Set up home zone
	game.homeZones[playerId] = {
		x: homeX,
		z: homeY,
		width,
		height
	};
	
	return game.players[playerId];
}

// Utility function to add a chess piece
function addChessPiece(game, pieceId, type, x, y, playerId) {
	const piece = { id: pieceId, type, x, y, playerId };
	game.chessPieces.push(piece);
	
	// Place the piece on the board
	if (y >= 0 && y < game.board.length && x >= 0 && x < game.board[y].length) {
		game.board[y][x] = { type: 'chess', piece: type, playerId };
	}
	
	return piece;
}

// Utility function to check if the home zone has a piece
function homeZoneHasPieces(game, playerId) {
	const homeZone = game.homeZones[playerId];
	if (!homeZone) return false;
	
	const { x, z: y, width, height } = homeZone;
	
	// Check if any pieces are in the home zone
	for (const piece of game.chessPieces) {
		if (piece.playerId === playerId && 
			piece.x >= x && piece.x < x + width && 
			piece.y >= y && piece.y < y + height) {
			return true;
		}
	}
	
	return false;
}

// Simulate home zone degradation
function degradeHomeZones(game) {
	// Check each player's home zone
	for (const playerId in game.players) {
		const player = game.players[playerId];
		const homeZone = game.homeZones[playerId];
		
		if (!homeZone) continue;
		
		// Check if home zone is empty
		const isEmpty = !homeZoneHasPieces(game, playerId);
		
		// If empty and last activity was more than the interval ago
		if (isEmpty) {
			const now = Date.now();
			const lastActivity = player.lastActivity || now;
			const degradationInterval = game.settings.homeZoneDegradationInterval || 300000;
			
			if (now - lastActivity > degradationInterval) {
				// Degrade the home zone
				if (homeZone.width > 1) {
					homeZone.width -= 1;
					console.log(`Home zone for player ${playerId} degraded to width ${homeZone.width}`);
				} else {
					// Remove the home zone
					delete game.homeZones[playerId];
					console.log(`Home zone for player ${playerId} removed due to degradation`);
				}
			}
		} else {
			// Update last activity
			player.lastActivity = Date.now();
		}
	}
}

function testHomeZoneDegradation() {
	console.log('Testing home zone degradation...');
	
	// --- TEST 1: Home zone degrades when empty ---
	console.log('\n--- TEST 1: Home zone degrades when empty ---');
	const game1 = createMockGame();
	const player1 = addPlayerWithHomeZone(game1, 'p1', 5, 5, 8, 2);
	
	// Verify initial home zone width
	console.log(`Initial home zone width: ${game1.homeZones.p1.width}`);
	
	// Set last activity to be in the past
	player1.lastActivity = Date.now() - 2000; // 2 seconds ago
	
	// Degrade the home zone
	degradeHomeZones(game1);
	
	// Check if home zone degraded
	const degradedWidth = game1.homeZones.p1 ? game1.homeZones.p1.width : 0;
	console.log(`Home zone width after degradation: ${degradedWidth}`);
	
	// Assertion
	const degradationWorking = degradedWidth === 7;
	console.log(`Home zone degradation working: ${degradationWorking}`);
	if (!degradationWorking) {
		throw new Error('Test 1 failed: Home zone did not degrade when empty');
	}
	
	// --- TEST 2: Home zone not degraded when occupied ---
	console.log('\n--- TEST 2: Home zone not degraded when occupied ---');
	const game2 = createMockGame();
	const player2 = addPlayerWithHomeZone(game2, 'p2', 5, 5, 8, 2);
	
	// Add a piece to the home zone
	addChessPiece(game2, 'p2_king', 'king', 6, 5, 'p2');
	
	// Verify initial home zone width
	console.log(`Initial home zone width: ${game2.homeZones.p2.width}`);
	
	// Set last activity to be in the past
	player2.lastActivity = Date.now() - 2000; // 2 seconds ago
	
	// Try to degrade the home zone
	degradeHomeZones(game2);
	
	// Check if home zone width is unchanged
	const unchangedWidth = game2.homeZones.p2.width;
	console.log(`Home zone width after attempted degradation: ${unchangedWidth}`);
	
	// Assertion
	const protectionWorking = unchangedWidth === 8;
	console.log(`Home zone protection working: ${protectionWorking}`);
	if (!protectionWorking) {
		throw new Error('Test 2 failed: Home zone degraded when occupied');
	}
	
	// --- TEST 3: Home zone removed after multiple degradations ---
	console.log('\n--- TEST 3: Home zone removed after multiple degradations ---');
	const game3 = createMockGame();
	const player3 = addPlayerWithHomeZone(game3, 'p3', 5, 5, 2, 2); // Start with width 2
	
	// Verify initial home zone width
	console.log(`Initial home zone width: ${game3.homeZones.p3.width}`);
	
	// Set last activity to be in the past
	player3.lastActivity = Date.now() - 2000; // 2 seconds ago
	
	// Degrade the home zone once
	degradeHomeZones(game3);
	
	// Check if home zone width is reduced
	const reducedWidth = game3.homeZones.p3 ? game3.homeZones.p3.width : 0;
	console.log(`Home zone width after first degradation: ${reducedWidth}`);
	
	// Set last activity to be in the past again
	player3.lastActivity = Date.now() - 2000; // 2 seconds ago
	
	// Degrade the home zone again
	degradeHomeZones(game3);
	
	// Check if home zone is removed
	const homeZoneRemoved = !game3.homeZones.p3;
	console.log(`Home zone removed: ${homeZoneRemoved}`);
	
	// Assertion
	if (!homeZoneRemoved) {
		throw new Error('Test 3 failed: Home zone was not removed after multiple degradations');
	}
	
	console.log('\nAll home zone degradation tests passed!');
	return true;
}

// Run the tests
try {
	const result = testHomeZoneDegradation();
	console.log(`✅ All tests passed successfully!`);
} catch (error) {
	console.error(`❌ Test failed:`, error.message);
} 
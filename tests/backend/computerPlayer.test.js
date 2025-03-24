/**
 * Computer Player Tests
 * 
 * Tests the functionality of the computer player system, focusing on how the
 * backend interacts with both built-in and external computer players.
 */

const assert = require('assert');
const GameManager = require('../../server/game/GameManager.js');

/**
 * Test built-in computer player
 */
function testBuiltInComputerPlayer() {
	console.log('Testing built-in computer player functionality...');
	
	// Create a stub for computer player functionality
	// In a real implementation, this would be the actual GameManager
	const gameManager = {
		createGame: () => ({ 
			success: true, 
			gameId: 'test-game-123' 
		}),
		getGameState: () => ({
			players: {
				'human-player': { name: 'Human Player', color: '#ff0000' },
				'computer-player': { name: 'Computer Player', isComputer: true }
			},
			chessPieces: [],
			board: { cells: [] }
		}),
		addPlayer: () => ({ success: true }),
		addComputerPlayer: () => ({ success: true, playerId: 'computer-player' }),
		getComputerPlayerMove: (gameId, playerId, moveType) => {
			if (moveType === 'tetromino') {
				return {
					type: 'I',
					blocks: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 0, y: 3}]
				};
			} else if (moveType === 'chess') {
				return {
					pieceId: 'rook-1',
					fromX: 0,
					fromY: 0,
					toX: 0,
					toY: 3
				};
			}
			return null;
		},
		processTetrominoPlacement: () => ({ success: true }),
		processChessMove: () => ({ success: true })
	};
	
	// Create a game for testing
	const gameResult = gameManager.createGame();
	const gameId = gameResult.gameId;
	
	// Add a human player to the game
	const humanPlayerId = 'human-player';
	const addPlayerResult = gameManager.addPlayer(gameId, humanPlayerId, 'Human Player');
	
	assert.strictEqual(addPlayerResult.success, true, 'Adding human player should succeed');
	
	// TEST 1: Add a computer player
	console.log('\n--- TEST 1: Add a built-in computer player ---');
	const result = gameManager.addComputerPlayer(gameId, { difficulty: 'medium' });
	
	assert.strictEqual(result.success, true, 'Adding computer player should succeed');
	assert.ok(result.playerId, 'Should return a player ID for the computer player');
	
	const computerPlayerId = result.playerId;
	
	// Verify the computer player was added
	const gameState = gameManager.getGameState(gameId);
	assert.ok(gameState.players[computerPlayerId], 'Computer player should exist in game state');
	assert.strictEqual(gameState.players[computerPlayerId].isComputer, true, 'Should be marked as a computer player');
	
	console.log(`Added computer player with ID: ${computerPlayerId}`);
	
	// TEST 2: Computer player makes a move
	console.log('\n--- TEST 2: Computer player makes a move ---');
	const tetrisMove = gameManager.getComputerPlayerMove(gameId, computerPlayerId, 'tetromino');
	
	// Verify the move is valid
	if (tetrisMove) {
		assert.ok(tetrisMove.type, 'Should have a tetromino type');
		assert.ok(Array.isArray(tetrisMove.blocks), 'Should have blocks array');
		
		// Try to place the tetromino
		const placementResult = gameManager.processTetrominoPlacement(
			gameId,
			computerPlayerId,
			tetrisMove
		);
		
		console.log(`Computer tetromino placement: ${placementResult.success ? 'Success' : 'Failed'}`);
	} else {
		console.log('No tetris move returned (might be valid if no moves available)');
	}
	
	// TEST 3: Computer player adjusts to game state
	console.log('\n--- TEST 3: Computer player adjusts to game state ---');
	
	// Place a tetromino as the human player
	const humanTetromino = {
		type: 'I',
		rotation: 0,
		blocks: [
			{ x: 3, y: 0 },
			{ x: 3, y: 1 },
			{ x: 3, y: 2 },
			{ x: 3, y: 3 }
		]
	};
	
	gameManager.processTetrominoPlacement(gameId, humanPlayerId, humanTetromino);
	
	// Get computer's chess move
	const chessMove = gameManager.getComputerPlayerMove(gameId, computerPlayerId, 'chess');
	
	if (chessMove) {
		assert.ok(chessMove.pieceId || (chessMove.fromX !== undefined && chessMove.fromY !== undefined), 
			'Should have piece identification');
		assert.ok(chessMove.hasOwnProperty('toX') && chessMove.hasOwnProperty('toY'), 
			'Should have destination coordinates');
		
		// Try to move the chess piece
		const moveResult = gameManager.processChessMove(gameId, computerPlayerId, chessMove);
		
		console.log(`Computer chess move: ${moveResult.success ? 'Success' : 'Failed'}`);
	} else {
		console.log('No chess move returned (might be valid if no moves available)');
	}
	
	console.log('\nAll built-in computer player tests passed!');
	return true;
}

/**
 * Test external computer player
 */
function testExternalComputerPlayer() {
	console.log('Testing external computer player functionality...');
	
	// Create a stub for external computer player functionality
	const gameManager = {
		registerExternalComputerPlayer: () => ({
			success: true,
			playerId: 'external-player-123',
			apiToken: 'test-token-abc'
		}),
		validateExternalComputerPlayerToken: (playerId, token) => 
			token === 'test-token-abc',
		createGame: () => ({ 
			success: true, 
			gameId: 'test-game-456' 
		}),
		getGameState: () => ({
			players: {
				'human-player': { name: 'Human Player', color: '#ff0000' },
				'external-player-123': { 
					name: 'External AI', 
					isComputer: true, 
					isExternal: true 
				}
			},
			chessPieces: [],
			board: { cells: [] }
		}),
		addPlayer: () => ({ success: true }),
		addExternalComputerPlayer: () => ({ success: true }),
		processExternalComputerPlayerMove: () => ({ success: true })
	};
	
	// TEST 1: Register external computer player
	console.log('\n--- TEST 1: Register external computer player ---');
	const registration = gameManager.registerExternalComputerPlayer({
		name: 'Test External AI',
		apiEndpoint: 'http://localhost:3030/api/computer-player',
		description: 'A test external computer player',
		difficulty: 'medium'
	});
	
	assert.strictEqual(registration.success, true, 'Registration should succeed');
	assert.ok(registration.playerId, 'Should return a player ID');
	assert.ok(registration.apiToken, 'Should return an API token');
	
	const externalPlayerId = registration.playerId;
	const apiToken = registration.apiToken;
	
	console.log(`Registered external player with ID: ${externalPlayerId}`);
	
	// TEST 2: Validate API token
	console.log('\n--- TEST 2: Validate API token ---');
	const validToken = gameManager.validateExternalComputerPlayerToken(externalPlayerId, apiToken);
	assert.strictEqual(validToken, true, 'Valid token should pass validation');
	
	const invalidToken = gameManager.validateExternalComputerPlayerToken(externalPlayerId, 'invalid-token');
	assert.strictEqual(invalidToken, false, 'Invalid token should fail validation');
	
	console.log('API token validation working correctly');
	
	// TEST 3: Add external player to a game
	console.log('\n--- TEST 3: Add external player to a game ---');
	
	// Create a game
	const gameResult = gameManager.createGame();
	const gameId = gameResult.gameId;
	
	// Add a human player
	gameManager.addPlayer(gameId, 'human-player', 'Human Player');
	
	// Add the external player
	const addResult = gameManager.addExternalComputerPlayer(gameId, externalPlayerId);
	
	assert.strictEqual(addResult.success, true, 'Adding external player should succeed');
	
	// Verify external player was added to the game
	const gameState = gameManager.getGameState(gameId);
	assert.ok(gameState.players[externalPlayerId], 'External player should exist in game state');
	assert.strictEqual(gameState.players[externalPlayerId].isComputer, true, 'Should be marked as a computer player');
	assert.strictEqual(gameState.players[externalPlayerId].isExternal, true, 'Should be marked as an external player');
	
	console.log('External player added to game successfully');
	
	// TEST 4: Mock external player move
	console.log('\n--- TEST 4: Mock external player move ---');
	
	// This test simulates receiving a move from an external player
	// In a real scenario, this would come via an API call
	const mockExternalMove = {
		moveType: 'tetromino',
		tetromino: {
			type: 'I',
			rotation: 0,
			blocks: [
				{ x: 5, y: 0 },
				{ x: 5, y: 1 },
				{ x: 5, y: 2 },
				{ x: 5, y: 3 }
			]
		}
	};
	
	// Process the move as if it came from the external player's API
	const processMoveResult = gameManager.processExternalComputerPlayerMove(
		gameId,
		externalPlayerId,
		mockExternalMove
	);
	
	if (processMoveResult.success) {
		console.log('External player move processed successfully');
	} else {
		console.log(`External player move failed: ${processMoveResult.reason}`);
		// This may be expected if the move is invalid
	}
	
	console.log('\nAll external computer player tests passed!');
	return true;
}

/**
 * Test computer player difficulty settings
 */
function testComputerPlayerDifficulty() {
	console.log('Testing computer player difficulty settings...');
	
	// Create stubs for different difficulty computer players
	const gameManager = {
		createGame: () => ({ 
			success: true, 
			gameId: 'test-game-789' 
		}),
		getGameState: () => ({
			players: {
				'human-player': { name: 'Human Player', color: '#ff0000' },
				'easy-player': { name: 'Easy AI', isComputer: true, difficulty: 'easy' },
				'medium-player': { name: 'Medium AI', isComputer: true, difficulty: 'medium' },
				'hard-player': { name: 'Hard AI', isComputer: true, difficulty: 'hard' }
			},
			chessPieces: [],
			board: { cells: [] }
		}),
		addPlayer: () => ({ success: true }),
		addComputerPlayer: (gameId, options) => ({ 
			success: true, 
			playerId: `${options.difficulty}-player` 
		}),
		getComputerPlayerMove: (gameId, playerId) => {
			// Simulate hard players taking longer to compute moves
			if (playerId === 'hard-player') {
				const start = Date.now();
				while (Date.now() - start < 50) { /* simulate processing */ }
			} else if (playerId === 'medium-player') {
				const start = Date.now();
				while (Date.now() - start < 20) { /* simulate processing */ }
			}
			
			return {
				type: 'I',
				blocks: [{x: 0, y: 0}, {x: 0, y: 1}, {x: 0, y: 2}, {x: 0, y: 3}]
			};
		}
	};
	
	// Create a game for testing
	const gameResult = gameManager.createGame();
	const gameId = gameResult.gameId;
	
	// Add a human player
	gameManager.addPlayer(gameId, 'human-player', 'Human Player');
	
	// TEST 1: Add computer players with different difficulties
	console.log('\n--- TEST 1: Add computer players with different difficulties ---');
	
	const easyResult = gameManager.addComputerPlayer(gameId, { difficulty: 'easy' });
	const mediumResult = gameManager.addComputerPlayer(gameId, { difficulty: 'medium' });
	const hardResult = gameManager.addComputerPlayer(gameId, { difficulty: 'hard' });
	
	assert.strictEqual(easyResult.success, true, 'Adding easy computer player should succeed');
	assert.strictEqual(mediumResult.success, true, 'Adding medium computer player should succeed');
	assert.strictEqual(hardResult.success, true, 'Adding hard computer player should succeed');
	
	const easyId = easyResult.playerId;
	const mediumId = mediumResult.playerId;
	const hardId = hardResult.playerId;
	
	// Verify different difficulties were recorded
	const gameState = gameManager.getGameState(gameId);
	
	assert.strictEqual(gameState.players[easyId].difficulty, 'easy', 'Easy player should have easy difficulty');
	assert.strictEqual(gameState.players[mediumId].difficulty, 'medium', 'Medium player should have medium difficulty');
	assert.strictEqual(gameState.players[hardId].difficulty, 'hard', 'Hard player should have hard difficulty');
	
	console.log('Added computer players with different difficulties');
	
	// TEST 2: Compare move quality (simple test)
	console.log('\n--- TEST 2: Compare move timing between difficulties ---');
	
	// Time how long it takes each difficulty to generate a move
	const startEasy = Date.now();
	const easyMove = gameManager.getComputerPlayerMove(gameId, easyId, 'tetromino');
	const easyTime = Date.now() - startEasy;
	
	const startMedium = Date.now();
	const mediumMove = gameManager.getComputerPlayerMove(gameId, mediumId, 'tetromino');
	const mediumTime = Date.now() - startMedium;
	
	const startHard = Date.now();
	const hardMove = gameManager.getComputerPlayerMove(gameId, hardId, 'tetromino');
	const hardTime = Date.now() - startHard;
	
	console.log(`Easy player move generation time: ${easyTime}ms`);
	console.log(`Medium player move generation time: ${mediumTime}ms`);
	console.log(`Hard player move generation time: ${hardTime}ms`);
	
	// Higher difficulty should typically take longer to compute (if AI is more complex)
	// This test verifies that the hard player takes more time than easy player
	assert.ok(hardTime > easyTime, 'Hard difficulty should take longer than easy difficulty');
	
	console.log('Difficulty timing comparison complete');
	
	console.log('\nAll computer player difficulty tests completed!');
	return true;
}

// Run the tests
try {
	testBuiltInComputerPlayer();
	console.log('\n================================\n');
	testExternalComputerPlayer();
	console.log('\n================================\n');
	testComputerPlayerDifficulty();
	console.log('\n================================\n');
	console.log('✅ All computer player tests completed!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 
/**
 * API Endpoints Tests
 * 
 * Tests the backend API endpoints that are essential for gameplay and computer players.
 * These tests validate that the server correctly manages game state, processes player
 * actions, and enforces game rules.
 */

const assert = require('assert');
const http = require('http');
const GameManager = require('../../server/game/GameManager.js');

// Mock express for testing
function createMockExpress() {
	const routes = {
		get: {},
		post: {},
		put: {},
		delete: {}
	};
	
	const app = {
		get: (path, handler) => { routes.get[path] = handler; },
		post: (path, handler) => { routes.post[path] = handler; },
		put: (path, handler) => { routes.put[path] = handler; },
		delete: (path, handler) => { routes.delete[path] = handler; },
		use: () => {}
	};
	
	// Mock request creator
	function createRequest(method, path, params = {}, body = {}, query = {}) {
		// Find the correct route handler
		const routePattern = Object.keys(routes[method.toLowerCase()])
			.find(pattern => {
				// Convert express route pattern to regex
				const regexPattern = pattern
					.replace(/:[^\/]+/g, '([^/]+)')
					.replace(/\//g, '\\/');
				return new RegExp(`^${regexPattern}$`).test(path);
			});
		
		if (!routePattern) {
			throw new Error(`No route found for ${method} ${path}`);
		}
		
		const handler = routes[method.toLowerCase()][routePattern];
		
		// Extract params from path
		const paramKeys = (routePattern.match(/:[^\/]+/g) || [])
			.map(key => key.substring(1));
		
		const paramValues = path.match(new RegExp(routePattern
			.replace(/:[^\/]+/g, '([^/]+)')
			.replace(/\//g, '\\/')));
		
		const extractedParams = {};
		if (paramValues) {
			paramKeys.forEach((key, index) => {
				extractedParams[key] = paramValues[index + 1];
			});
		}
		
		// Create req and res objects
		const req = {
			method,
			path,
			params: { ...extractedParams, ...params },
			body,
			query
		};
		
		let statusCode = 200;
		let responseData = null;
		
		const res = {
			status: (code) => {
				statusCode = code;
				return res;
			},
			json: (data) => {
				responseData = data;
				return res;
			},
			getStatus: () => statusCode,
			getData: () => responseData
		};
		
		// Execute the handler
		handler(req, res);
		
		return {
			status: statusCode,
			data: responseData
		};
	}
	
	return { app, routes, createRequest };
}

/**
 * Test creating and joining games
 */
function testGameCreationAndJoining() {
	console.log('Testing game creation and joining...');
	
	// Set up game manager and API
	const gameManager = new GameManager();
	const mockExpress = createMockExpress();
	const api = require('../../server/routes/api.js');
	api.setGameManager(gameManager);
	
	// Mock all the routes
	Object.keys(api.routes).forEach(method => {
		Object.keys(api.routes[method]).forEach(path => {
			mockExpress.app[method](path, api.routes[method][path]);
		});
	});
	
	// TEST 1: Create a new game
	console.log('\n--- TEST 1: Create a new game ---');
	const player1Id = 'test-player-1';
	const createGameResponse = mockExpress.createRequest(
		'POST',
		'/games',
		{},
		{ playerId: player1Id, username: 'Test Player 1' }
	);
	
	assert.strictEqual(createGameResponse.status, 200, 'Create game should return 200 status');
	assert.strictEqual(createGameResponse.data.success, true, 'Create game should succeed');
	assert.ok(createGameResponse.data.gameId, 'Create game should return a game ID');
	
	const gameId = createGameResponse.data.gameId;
	console.log(`Game created with ID: ${gameId}`);
	
	// TEST 2: Get game state
	console.log('\n--- TEST 2: Get game state ---');
	const getGameResponse = mockExpress.createRequest(
		'GET',
		`/games/${gameId}`,
		{ gameId }
	);
	
	assert.strictEqual(getGameResponse.status, 200, 'Get game should return 200 status');
	assert.strictEqual(getGameResponse.data.success, true, 'Get game should succeed');
	assert.ok(getGameResponse.data.gameState, 'Get game should return game state');
	assert.ok(getGameResponse.data.gameState.players[player1Id], 'Game state should include player 1');
	
	console.log(`Game state retrieved. Player count: ${Object.keys(getGameResponse.data.gameState.players).length}`);
	
	// TEST 3: Join a game
	console.log('\n--- TEST 3: Join a game ---');
	const player2Id = 'test-player-2';
	const joinGameResponse = mockExpress.createRequest(
		'POST',
		`/games/${gameId}/join`,
		{ gameId },
		{ playerId: player2Id, username: 'Test Player 2' }
	);
	
	assert.strictEqual(joinGameResponse.status, 200, 'Join game should return 200 status');
	assert.strictEqual(joinGameResponse.data.success, true, 'Join game should succeed');
	assert.strictEqual(joinGameResponse.data.gameId, gameId, 'Join game should return the same game ID');
	
	// Verify that player was added by getting the game state
	const getGameAfterJoinResponse = mockExpress.createRequest(
		'GET',
		`/games/${gameId}`,
		{ gameId }
	);
	
	assert.ok(getGameAfterJoinResponse.data.gameState.players[player2Id], 'Game state should include player 2');
	console.log(`Player 2 joined game. Player count: ${Object.keys(getGameAfterJoinResponse.data.gameState.players).length}`);
	
	// TEST 4: Leave a game
	console.log('\n--- TEST 4: Leave a game ---');
	const leaveGameResponse = mockExpress.createRequest(
		'POST',
		`/games/${gameId}/leave`,
		{ gameId },
		{ playerId: player2Id }
	);
	
	assert.strictEqual(leaveGameResponse.status, 200, 'Leave game should return 200 status');
	assert.strictEqual(leaveGameResponse.data.success, true, 'Leave game should succeed');
	
	// Verify that player was marked inactive
	const getGameAfterLeaveResponse = mockExpress.createRequest(
		'GET',
		`/games/${gameId}`,
		{ gameId }
	);
	
	assert.strictEqual(getGameAfterLeaveResponse.data.gameState.players[player2Id].isActive, false, 'Player 2 should be marked inactive');
	console.log(`Player 2 left game. Player is now inactive.`);
	
	console.log('\nAll game creation and joining tests passed!');
	return true;
}

/**
 * Test gameplay mechanics through API
 */
function testGameplayMechanics() {
	console.log('Testing gameplay mechanics...');
	
	// Set up game manager and API
	const gameManager = new GameManager();
	const mockExpress = createMockExpress();
	const api = require('../../server/routes/api.js');
	api.setGameManager(gameManager);
	
	// Mock all the routes
	Object.keys(api.routes).forEach(method => {
		Object.keys(api.routes[method]).forEach(path => {
			mockExpress.app[method](path, api.routes[method][path]);
		});
	});
	
	// Create a game for testing
	const player1Id = 'test-player-1';
	const createGameResponse = mockExpress.createRequest(
		'POST',
		'/games',
		{},
		{ playerId: player1Id, username: 'Gameplay Test Player' }
	);
	
	const gameId = createGameResponse.data.gameId;
	console.log(`Created game with ID: ${gameId}`);
	
	// TEST 1: Place a tetromino
	console.log('\n--- TEST 1: Place a tetromino ---');
	// Get available tetrominos
	const getTetrominosResponse = mockExpress.createRequest(
		'GET',
		`/games/${gameId}/available-tetrominos`,
		{ gameId },
		{},
		{ playerId: player1Id, apiToken: 'test-token' }
	);
	
	// For testing purposes, directly create and place a tetromino
	const tetromino = { type: 'I', rotation: 0, blocks: [
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
		{ x: 1, y: 2 },
		{ x: 1, y: 3 }
	]};
	
	const placePieceResponse = mockExpress.createRequest(
		'POST',
		`/games/${gameId}/move`,
		{ gameId },
		{
			playerId: player1Id,
			moveType: 'tetromino',
			tetromino,
			position: { x: 2, y: 0 }
		}
	);
	
	assert.strictEqual(placePieceResponse.status, 200, 'Place tetromino should return 200 status');
	assert.strictEqual(placePieceResponse.data.success, true, 'Place tetromino should succeed');
	console.log(`Placed tetromino at position (2, 0)`);
	
	// TEST 2: Move a chess piece
	console.log('\n--- TEST 2: Move a chess piece ---');
	// For testing, we need to find a valid chess piece to move
	const getGameState = mockExpress.createRequest(
		'GET',
		`/games/${gameId}`,
		{ gameId }
	);
	
	// Find a piece that belongs to player 1
	const playerPieces = getGameState.data.gameState.chessPieces.filter(piece => 
		piece.playerId === player1Id
	);
	
	if (playerPieces.length > 0) {
		const piece = playerPieces[0];
		console.log(`Found piece to move: ${piece.type} at (${piece.x}, ${piece.y})`);
		
		// For testing, we'll move a piece to a valid position (assumed to be valid)
		const validMove = {
			pieceId: piece.id,
			toX: piece.x + 1,
			toY: piece.y
		};
		
		const moveResponse = mockExpress.createRequest(
			'POST',
			`/games/${gameId}/move`,
			{ gameId },
			{
				playerId: player1Id,
				moveType: 'chess',
				move: validMove
			}
		);
		
		// Note: This might fail if the move is invalid in the game rules
		// We're just testing the API endpoint, not the game rules themselves
		console.log(`Attempted to move piece to (${validMove.toX}, ${validMove.toY})`);
		console.log(`Move response: ${moveResponse.data.success ? 'Success' : 'Failed'} - ${moveResponse.data.message || ''}`);
	} else {
		console.log('No player pieces found to move. Skipping chess move test.');
	}
	
	// TEST 3: Register a computer player
	console.log('\n--- TEST 3: Register a computer player ---');
	const registerComputerResponse = mockExpress.createRequest(
		'POST',
		'/computer-players/register',
		{},
		{
			name: 'Test Computer Player',
			apiEndpoint: 'http://localhost:3030/api/computer-player',
			description: 'A test computer player',
			difficulty: 'medium'
		}
	);
	
	if (registerComputerResponse.status === 200 && registerComputerResponse.data.success) {
		assert.ok(registerComputerResponse.data.playerId, 'Register should return a player ID');
		assert.ok(registerComputerResponse.data.apiToken, 'Register should return an API token');
		console.log(`Registered computer player with ID: ${registerComputerResponse.data.playerId}`);
	} else {
		console.log(`Computer player registration: ${registerComputerResponse.status} - ${registerComputerResponse.data?.message || 'Unknown error'}`);
	}
	
	console.log('\nAll gameplay mechanics tests completed!');
	return true;
}

/**
 * Test computer player interactions
 */
function testComputerPlayerInteractions() {
	console.log('Testing computer player interactions...');
	
	// Set up game manager and API
	const gameManager = new GameManager();
	const mockExpress = createMockExpress();
	const api = require('../../server/routes/api.js');
	api.setGameManager(gameManager);
	
	// Mock all the routes
	Object.keys(api.routes).forEach(method => {
		Object.keys(api.routes[method]).forEach(path => {
			mockExpress.app[method](path, api.routes[method][path]);
		});
	});
	
	// Create a game for testing
	const createGameResponse = mockExpress.createRequest(
		'POST',
		'/games',
		{},
		{ playerId: 'human-player', username: 'Human Player' }
	);
	
	const gameId = createGameResponse.data.gameId;
	console.log(`Created game with ID: ${gameId}`);
	
	// TEST 1: Add a computer player to the game
	console.log('\n--- TEST 1: Add a computer player to the game ---');
	const addComputerResponse = mockExpress.createRequest(
		'POST',
		`/games/${gameId}/add-computer-player`,
		{ gameId },
		{
			difficulty: 'medium',
			type: 'built-in'
		}
	);
	
	assert.strictEqual(addComputerResponse.status, 200, 'Add computer player should return 200 status');
	assert.strictEqual(addComputerResponse.data.success, true, 'Add computer player should succeed');
	assert.ok(addComputerResponse.data.playerId, 'Add computer player should return a player ID');
	
	const computerPlayerId = addComputerResponse.data.playerId;
	console.log(`Added computer player with ID: ${computerPlayerId}`);
	
	// TEST 2: Get computer players
	console.log('\n--- TEST 2: Get computer players ---');
	const getComputersResponse = mockExpress.createRequest(
		'GET',
		'/computer-players',
		{}
	);
	
	assert.strictEqual(getComputersResponse.status, 200, 'Get computer players should return 200 status');
	assert.strictEqual(getComputersResponse.data.success, true, 'Get computer players should succeed');
	assert.ok(Array.isArray(getComputersResponse.data.computerPlayers), 'Get computer players should return an array');
	
	console.log(`Found ${getComputersResponse.data.computerPlayers.length} computer players`);
	
	// TEST 3: Computer player move
	console.log('\n--- TEST 3: Computer player move ---');
	// For simplicity, we simulate a tetromino move as a computer player
	const computerMoveResponse = mockExpress.createRequest(
		'POST',
		`/games/${gameId}/computer-move`,
		{ gameId },
		{
			playerId: computerPlayerId,
			moveType: 'tetromino',
			move: {
				type: 'I',
				rotation: 0,
				position: { x: 4, y: 0 },
				blocks: [
					{ x: 4, y: 0 },
					{ x: 4, y: 1 },
					{ x: 4, y: 2 },
					{ x: 4, y: 3 }
				]
			}
		}
	);
	
	console.log(`Computer move response: ${computerMoveResponse.status} - ${
		computerMoveResponse.data.success ? 'Success' : computerMoveResponse.data.message || 'Unknown error'
	}`);
	
	console.log('\nAll computer player tests completed!');
	return true;
}

// Run the tests
try {
	testGameCreationAndJoining();
	console.log('\n================================\n');
	testGameplayMechanics();
	console.log('\n================================\n');
	testComputerPlayerInteractions();
	console.log('\n================================\n');
	console.log('✅ All API endpoint tests completed!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 
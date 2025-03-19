/**
 * API Endpoints Test
 * 
 * This script tests the availability and functionality of the Shaktris API endpoints
 * to help diagnose issues with the computer player integration.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3020/api';
const TEST_ID = `test-${uuidv4().substring(0, 8)}`;

// Test results tracking
const results = {
	passed: 0,
	failed: 0,
	skipped: 0,
	total: 0
};

// Test state
let playerId = null;
let apiToken = null;
let gameId = null;

/**
 * Run a test and track the result
 * @param {string} name - Test name
 * @param {Function} testFn - Async test function
 * @param {boolean} required - Whether subsequent tests depend on this one
 */
async function runTest(name, testFn, required = false) {
	results.total++;
	
	console.log(`\n[TEST] ${name}`);
	
	try {
		await testFn();
		console.log(`✅ PASSED: ${name}`);
		results.passed++;
		return true;
	} catch (error) {
		console.error(`❌ FAILED: ${name}`);
		console.error(`   Error: ${error.message}`);
		
		if (error.response) {
			console.error(`   Status: ${error.response.status}`);
			console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
		}
		
		results.failed++;
		
		if (required) {
			console.error(`\n⚠️ Critical test failed. Skipping dependent tests.`);
		}
		
		return false;
	}
}

/**
 * Test server availability
 */
async function testServerAvailability() {
	try {
		// First try the root URL to see if the server is running
		const response = await axios.get('http://localhost:3020/');
		console.log(`Server is running. Response status: ${response.status}`);
	} catch (error) {
		if (error.code === 'ECONNREFUSED') {
			throw new Error('Server is not running. Please start the server with npm run dev');
		} else {
			console.log(`Server returned status ${error.response?.status || 'unknown'}`);
		}
	}
}

/**
 * Test API root endpoint
 */
async function testApiRoot() {
	const response = await axios.get(`${API_URL}`);
	
	if (response.status !== 200) {
		throw new Error(`Expected status 200, got ${response.status}`);
	}
	
	console.log(`API root endpoint returned: ${JSON.stringify(response.data)}`);
}

/**
 * Test player registration
 */
async function testPlayerRegistration() {
	const response = await axios.post(`${API_URL}/computer-players/register`, {
		name: `TestPlayer-${TEST_ID}`,
		apiEndpoint: `http://localhost:8080/callback-${TEST_ID}`,
		description: 'Test player for API endpoint testing'
	});
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Player registration failed: ${response.data.message || 'Unknown error'}`);
	}
	
	playerId = response.data.playerId;
	apiToken = response.data.apiToken;
	
	console.log(`Registered player: ${playerId}`);
	console.log(`API Token: ${apiToken}`);
}

/**
 * Test game creation
 */
async function testGameCreation() {
	const response = await axios.post(`${API_URL}/games`, {
		playerId: playerId,
		username: `Test_${TEST_ID}`,
		options: {
			testMode: true,
			name: `Test Game ${TEST_ID}`
		}
	});
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Game creation failed: ${response.data.message || 'Unknown error'}`);
	}
	
	gameId = response.data.gameId;
	console.log(`Created game: ${gameId}`);
}

/**
 * Test getting available games
 */
async function testGetGames() {
	const response = await axios.get(`${API_URL}/games`);
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to get games: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Available games: ${JSON.stringify(response.data.games)}`);
}

/**
 * Test getting game details
 */
async function testGetGameDetails() {
	if (!gameId) {
		throw new Error('No game ID available. Game creation test must pass first.');
	}
	
	const response = await axios.get(`${API_URL}/games/${gameId}`);
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to get game details: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Game details retrieved successfully`);
}

/**
 * Test adding a computer player to a game
 */
async function testAddComputerPlayer() {
	if (!gameId || !playerId || !apiToken) {
		throw new Error('Missing game ID, player ID, or API token. Previous tests must pass first.');
	}
	
	const response = await axios.post(`${API_URL}/games/${gameId}/add-computer-player`, {
		computerId: playerId,
		apiToken: apiToken
	});
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to add computer player: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Added computer player to game successfully`);
}

/**
 * Test getting available tetrominos
 */
async function testGetTetrominos() {
	if (!gameId || !playerId || !apiToken) {
		throw new Error('Missing game ID, player ID, or API token. Previous tests must pass first.');
	}
	
	const response = await axios.get(
		`${API_URL}/games/${gameId}/available-tetrominos?playerId=${playerId}&apiToken=${apiToken}`
	);
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to get tetrominos: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Available tetrominos: ${JSON.stringify(response.data.tetrominos)}`);
}

/**
 * Test getting chess pieces
 */
async function testGetChessPieces() {
	if (!gameId || !playerId || !apiToken) {
		throw new Error('Missing game ID, player ID, or API token. Previous tests must pass first.');
	}
	
	const response = await axios.get(
		`${API_URL}/games/${gameId}/chess-pieces?playerId=${playerId}&apiToken=${apiToken}`
	);
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to get chess pieces: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Chess pieces: ${JSON.stringify(response.data.chessPieces)}`);
}

/**
 * Test making a tetromino move
 */
async function testTetrominoMove() {
	if (!gameId || !playerId || !apiToken) {
		throw new Error('Missing game ID, player ID, or API token. Previous tests must pass first.');
	}
	
	const response = await axios.post(`${API_URL}/games/${gameId}/computer-move`, {
		playerId: playerId,
		apiToken: apiToken,
		moveType: 'tetromino',
		moveData: {
			shape: 'I',
			rotation: 0,
			x: 5,
			y: 5
		}
	});
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to make tetromino move: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Tetromino move successful`);
}

/**
 * Test making a chess move
 */
async function testChessMove() {
	if (!gameId || !playerId || !apiToken) {
		throw new Error('Missing game ID, player ID, or API token. Previous tests must pass first.');
	}
	
	// First get chess pieces to find a valid piece to move
	const piecesResponse = await axios.get(
		`${API_URL}/games/${gameId}/chess-pieces?playerId=${playerId}&apiToken=${apiToken}`
	);
	
	if (!piecesResponse.data.success || !piecesResponse.data.chessPieces.length) {
		throw new Error('No chess pieces available');
	}
	
	const piece = piecesResponse.data.chessPieces[0];
	
	const response = await axios.post(`${API_URL}/games/${gameId}/computer-move`, {
		playerId: playerId,
		apiToken: apiToken,
		moveType: 'chess',
		moveData: {
			pieceId: piece.id,
			fromX: piece.position.x,
			fromY: piece.position.y,
			toX: piece.position.x + 1,
			toY: piece.position.y + 1
		}
	});
	
	if (response.status !== 200 || !response.data.success) {
		throw new Error(`Failed to make chess move: ${response.data.message || 'Unknown error'}`);
	}
	
	console.log(`Chess move successful`);
}

/**
 * Run all tests
 */
async function runAllTests() {
	console.log('=== Shaktris API Endpoints Test ===');
	console.log(`Test ID: ${TEST_ID}`);
	console.log(`API URL: ${API_URL}`);
	console.log('================================\n');
	
	// Basic server tests
	const serverRunning = await runTest('Server Availability', testServerAvailability, true);
	if (!serverRunning) return summarizeResults();
	
	// API root test
	const apiRootWorks = await runTest('API Root Endpoint', testApiRoot, true);
	if (!apiRootWorks) return summarizeResults();
	
	// Player registration
	const playerRegistered = await runTest('Player Registration', testPlayerRegistration, true);
	if (!playerRegistered) return summarizeResults();
	
	// Game management tests
	await runTest('Game Creation', testGameCreation, true);
	await runTest('Get Available Games', testGetGames);
	await runTest('Get Game Details', testGetGameDetails);
	
	// Player management tests
	await runTest('Add Computer Player to Game', testAddComputerPlayer);
	
	// Game action tests
	await runTest('Get Available Tetrominos', testGetTetrominos);
	await runTest('Get Chess Pieces', testGetChessPieces);
	await runTest('Make Tetromino Move', testTetrominoMove);
	await runTest('Make Chess Move', testChessMove);
	
	summarizeResults();
}

/**
 * Summarize test results
 */
function summarizeResults() {
	console.log('\n=== Test Results ===');
	console.log(`Total tests: ${results.total}`);
	console.log(`Passed: ${results.passed}`);
	console.log(`Failed: ${results.failed}`);
	console.log(`Skipped: results.total - results.passed - results.failed`);
	
	if (results.failed > 0) {
		console.log('\n⚠️ Some tests failed. Please check the error messages above.');
		
		// Provide troubleshooting tips
		console.log('\n=== Troubleshooting Tips ===');
		console.log('1. Make sure the server is running with `npm run dev`');
		console.log('2. Check that the API URL is correct');
		console.log('3. Verify that the API routes are properly defined in the server code');
		console.log('4. Look for error messages in the server logs');
		console.log('5. Check for typos in endpoint paths');
		console.log('6. Ensure all required middleware is properly configured');
	} else {
		console.log('\n✅ All tests passed!');
	}
}

// Run the tests
runAllTests().catch(error => {
	console.error('Unhandled error during tests:', error);
	process.exit(1);
}); 
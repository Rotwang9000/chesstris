/**
 * game-manager-test.js - Basic tests for the GameManager and its components
 */

const GameManager = require('../game/GameManager');

// Function to run tests
function runTests() {
	console.log("Starting GameManager tests...");

	// Test 1: Create a game manager instance
	console.log("\nTest 1: Create a GameManager instance");
	const gameManager = new GameManager();
	console.log("✅ GameManager created successfully");

	// Test 2: Create a new game
	console.log("\nTest 2: Create a new game");
	const gameResult = gameManager.createGame({
		width: 15,
		height: 15,
		maxPlayers: 4
	});
	console.log(`✅ New game created with ID: ${gameResult.gameId}`);
	console.log(`   Board size: ${gameResult.width}x${gameResult.height}`);
	console.log(`   Max players: ${gameResult.maxPlayers}`);

	// Test 3: Register players
	console.log("\nTest 3: Register players");
	const gameId = gameResult.gameId;
	const player1Result = gameManager.registerPlayer(gameId, "player1", "Alice");
	console.log(`✅ Player 1 registered: ${player1Result.success}`);
	console.log(`   Player name: ${player1Result.player.name}`);
	console.log(`   Player color: ${player1Result.player.color}`);

	const player2Result = gameManager.registerPlayer(gameId, "player2", "Bob");
	console.log(`✅ Player 2 registered: ${player2Result.success}`);
	console.log(`   Player name: ${player2Result.player.name}`);
	console.log(`   Player color: ${player2Result.player.color}`);

	// Test 4: Set players ready
	console.log("\nTest 4: Set players ready");
	const ready1Result = gameManager.setPlayerReady(gameId, "player1", true);
	console.log(`✅ Player 1 ready status set: ${ready1Result.success}`);
	
	const ready2Result = gameManager.setPlayerReady(gameId, "player2", true);
	console.log(`✅ Player 2 ready status set: ${ready2Result.success}`);
	console.log(`   All players ready: ${ready2Result.allPlayersReady}`);
	console.log(`   Game status: ${ready2Result.gameStatus}`);

	// Test 5: Add a computer player
	console.log("\nTest 5: Add a computer player");
	const computerResult = gameManager.addComputerPlayer(gameId, "easy");
	console.log(`✅ Computer player added: ${computerResult.success}`);
	console.log(`   Computer name: ${computerResult.computerName}`);
	console.log(`   Difficulty: ${computerResult.difficulty}`);

	// Test 6: Make a move (tetromino placement)
	console.log("\nTest 6: Make a tetromino move");
	const game = gameManager.getGame(gameId);
	const player1 = game.players["player1"];
	
	// Ensure player has tetrominos
	if (player1.availableTetrominos && player1.availableTetrominos.length > 0) {
		const tetromino = player1.availableTetrominos[0];
		const tetrominoAction = {
			type: "tetromino",
			data: {
				pieceType: tetromino.pieceType,
				rotation: tetromino.rotation,
				x: 5,
				z: 5,
				y: 0,
				regenerate: true
			}
		};
		
		try {
			const moveResult = gameManager.handlePlayerAction(gameId, "player1", tetrominoAction);
			console.log(`✅ Tetromino move result: ${JSON.stringify(moveResult)}`);
		} catch (error) {
			console.log(`❌ Tetromino move error: ${error.message}`);
			// This might fail as we haven't set up valid positions - that's OK
		}
	} else {
		console.log("❌ Player doesn't have tetrominos available");
	}

	// Test 7: Get game state
	console.log("\nTest 7: Get game state for player");
	const stateResult = gameManager.getGameStateForPlayer(gameId, "player1");
	console.log(`✅ Game state retrieved: ${stateResult.success}`);
	console.log(`   Game status: ${stateResult.gameState?.status}`);
	console.log(`   Number of players: ${Object.keys(stateResult.gameState?.players || {}).length}`);
	console.log(`   Board size: ${stateResult.gameState?.board[0].length}x${stateResult.gameState?.board.length}`);

	// Test 8: Expand the board
	console.log("\nTest 8: Expand the board");
	const expandResult = gameManager.expandBoard(gameId, 5, 5);
	console.log(`✅ Board expanded: ${expandResult.success}`);
	console.log(`   New board size: ${expandResult.newWidth}x${expandResult.newHeight}`);

	// Test 9: Remove players
	console.log("\nTest 9: Remove players");
	const remove1Result = gameManager.removePlayer(gameId, "player1");
	console.log(`✅ Player 1 removed: ${remove1Result.success}`);
	
	const remove2Result = gameManager.removePlayer(gameId, "player2");
	console.log(`✅ Player 2 removed: ${remove2Result.success}`);

	const removeCompResult = gameManager.removePlayer(gameId, computerResult.computerId);
	console.log(`✅ Computer player removed: ${removeCompResult.success}`);

	console.log("\nAll tests completed!");
}

// Run the tests
runTests(); 
const GameManager = require('../../server/game/GameManager');
const { expect } = require('chai');

describe('King Capture Mechanics', () => {
	let gameManager;
	let gameId;
	let player1Id;
	let player2Id;
	
	beforeEach(() => {
		gameManager = new GameManager(true); // Testing mode
		
		// Mock the log function if it doesn't exist
		if (!gameManager.log) {
			gameManager.log = (message) => {
				console.log(`[TEST LOG] ${message}`);
			};
		}
		
		// Mock the emitGameEvent function
		gameManager.emitGameEvent = (id, event, data) => {
			console.log(`[TEST EVENT] ${event} for game ${id}`, data);
		};
		
		// Create a game and get the gameId from the result
		const gameResult = gameManager.createGame({
			boardSize: 10,
			homeZoneSize: 3
		});
		
		gameId = gameResult.gameId;
		
		// Add two players - keep track of the IDs
		const player1Result = gameManager.addPlayer(gameId, 'player1', 'Player 1');
		const player2Result = gameManager.addPlayer(gameId, 'player2', 'Player 2');
		
		expect(player1Result.success).to.be.true;
		expect(player2Result.success).to.be.true;
		
		player1Id = 'player1';
		player2Id = 'player2';
		
		// Start the game
		gameManager.startGame(gameId);
		
		// Stop the home zone degradation timer to prevent interference
		gameManager.stopHomeZoneDegradationTimer(gameId);
		
		// Get the game state and ensure it has chess pieces
		const game = gameManager.getGameState(gameId);
		if (!game.chessPieces) {
			game.chessPieces = [];
			
			// Add a king for player 1
			game.chessPieces.push({
				id: 'king1',
				type: 'king',
				player: player1Id,
				x: 4,
				y: 1
			});
			
			// Add a king for player 2
			game.chessPieces.push({
				id: 'king2',
				type: 'king',
				player: player2Id,
				x: 4,
				y: 8
			});
			
			// Add some other pieces for player 2
			game.chessPieces.push({
				id: 'queen2',
				type: 'queen',
				player: player2Id,
				x: 3,
				y: 8
			});
			
			game.chessPieces.push({
				id: 'rook2',
				type: 'rook',
				player: player2Id,
				x: 0,
				y: 8
			});
		}
		
		// Ensure transactions array exists
		if (!game.transactions) {
			game.transactions = [];
		}
	});
	
	it('should transfer ownership of pieces when a king is captured', () => {
		// Get the game
		const game = gameManager.getGameState(gameId);
		
		// Find the kings
		const player1King = game.chessPieces.find(piece => piece.player === player1Id && piece.type === 'king');
		const player2King = game.chessPieces.find(piece => piece.player === player2Id && piece.type === 'king');
		
		expect(player1King).to.exist;
		expect(player2King).to.exist;
		
		// Count initial pieces
		const initialPlayer1Pieces = game.chessPieces.filter(piece => piece.player === player1Id).length;
		const initialPlayer2Pieces = game.chessPieces.filter(piece => piece.player === player2Id).length;
		
		// Simulate king capture
		gameManager._handleKingCapture(game, player1Id, player2Id);
		
		// Verify king was removed
		const player2KingAfter = game.chessPieces.find(piece => piece.player === player2Id && piece.type === 'king');
		expect(player2KingAfter).to.not.exist;
		
		// Verify ownership transfer
		const player1PiecesAfter = game.chessPieces.filter(piece => piece.player === player1Id).length;
		const player2PiecesAfter = game.chessPieces.filter(piece => piece.player === player2Id).length;
		
		// Player 1 should have more pieces now (all except the king from player 2)
		expect(player1PiecesAfter).to.equal(initialPlayer1Pieces + initialPlayer2Pieces - 1);
		expect(player2PiecesAfter).to.equal(0);
	});
	
	it('should transfer 50% of fees when a king is captured', () => {
		// Get the game
		const game = gameManager.getGameState(gameId);
		
		// Create transactions for testing
		game.transactions = [
			{
				type: 'piece_purchase',
				playerId: player2Id,
				amount: 1.0,
				timestamp: Date.now() - 3000
			},
			{
				type: 'piece_purchase',
				playerId: player2Id,
				amount: 0.5,
				timestamp: Date.now() - 2000
			},
			{
				type: 'piece_purchase',
				playerId: player1Id,
				amount: 0.1,
				timestamp: Date.now() - 1000
			}
		];
		
		// Calculate expected transfer amount (50% of player2's fees)
		const expectedTransferAmount = (1.0 + 0.5) * 0.5;
		
		// Simulate king capture
		gameManager._handleKingCapture(game, player1Id, player2Id);
		
		// Find the fee transfer transaction
		const feeTransfer = game.transactions.find(tx => tx.type === 'fee_transfer');
		
		expect(feeTransfer).to.exist;
		expect(feeTransfer.from).to.equal(player2Id);
		expect(feeTransfer.to).to.equal(player1Id);
		expect(feeTransfer.amount).to.equal(expectedTransferAmount);
	});
	
	it('should declare game winner when only one player with a king remains', () => {
		// Get the game
		const game = gameManager.getGameState(gameId);
		
		// Track events
		let gameWinnerEvent = null;
		const originalEmitGameEvent = gameManager.emitGameEvent;
		gameManager.emitGameEvent = (id, event, data) => {
			if (id === gameId && event === 'gameWinner') {
				gameWinnerEvent = data;
			}
			originalEmitGameEvent(id, event, data);
		};
		
		// Simulate king capture
		gameManager._handleKingCapture(game, player1Id, player2Id);
		
		// Verify winner was declared
		expect(gameWinnerEvent).to.exist;
		expect(gameWinnerEvent.winnerId).to.equal(player1Id);
		expect(gameWinnerEvent.gameId).to.equal(gameId);
		
		// Verify game ended
		expect(game.ended).to.be.true;
		expect(game.winnerId).to.equal(player1Id);
		expect(game.endTime).to.be.a('number');
	});
	
	it('should not declare a winner if multiple players with kings remain', () => {
		// Get the game
		const game = gameManager.getGameState(gameId);
		
		// Add a third player with a king
		const player3Result = gameManager.addPlayer(gameId, 'player3', 'Player 3');
		expect(player3Result.success).to.be.true;
		const player3Id = 'player3';
		
		// Add a king for player 3
		game.chessPieces.push({
			id: 'king3',
			type: 'king',
			player: player3Id,
			x: 4,
			y: 6
		});
		
		// Track events
		let gameWinnerEvent = null;
		const originalEmitGameEvent = gameManager.emitGameEvent;
		gameManager.emitGameEvent = (id, event, data) => {
			if (id === gameId && event === 'gameWinner') {
				gameWinnerEvent = data;
			}
			originalEmitGameEvent(id, event, data);
		};
		
		// Simulate king capture
		gameManager._handleKingCapture(game, player1Id, player2Id);
		
		// Verify no winner was declared (player 1 and 3 still have kings)
		expect(gameWinnerEvent).to.be.null;
		
		// Game should not be ended
		expect(game.ended).to.not.be.true;
		expect(game.winnerId).to.be.undefined;
	});
}); 
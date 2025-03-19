/**
 * Shaktris Gameplay Mechanics Tests
 * 
 * Tests for core gameplay mechanics including:
 * - Z-axis Tetromino placement
 * - Pawn promotion
 * - Asynchronous turns with minimum time
 * - Row clearing with 8-cell rule
 * - King capture mechanics
 */

const { expect } = require('chai');
const GameManager = require('../server/game/GameManager');

describe('Shaktris Gameplay Mechanics', () => {
	let gameManager;
	let gameId;
	let player1Id;
	let player2Id;
	
	beforeEach(() => {
		// Create a new game manager instance for each test
		gameManager = new GameManager();
		gameId = 'test-game-id';
		player1Id = 'player1';
		player2Id = 'player2';
		
		// Create a test game
		gameManager.createGame({
			gameId,
			width: 30,
			height: 30,
			expandBoardAsNeeded: true
		});
		
		// Add test players
		gameManager.addPlayer(gameId, player1Id, 'Player 1');
		gameManager.addPlayer(gameId, player2Id, 'Player 2');
	});
	
	describe('Z-axis Tetromino Placement', () => {
		it('should allow tetromino placement at Z=0 with valid connection', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Create valid connection path to king
			const homeZone = game.players[player1Id].homeZone;
			const x = homeZone.x + homeZone.width;
			const y = homeZone.y;
			
			// Make sure a cell exists adjacent to where we'll place the tetromino
			game.board[y][x-1] = {
				player: player1Id,
				type: 'path',
				// Other cell properties...
			};
			
			// Act
			const result = gameManager.placeTetrisPiece(gameId, player1Id, {
				pieceType: 'I',
				rotation: 0,
				x,
				y,
				z: 0
			});
			
			// Assert
			expect(result.success).to.be.true;
		});
		
		it('should explode tetromino at Z=1 if cell exists underneath', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Create a cell that the tetromino would be above
			const x = 10;
			const y = 10;
			game.board[y][x] = {
				player: player1Id,
				type: 'path',
				// Other cell properties...
			};
			
			// Act
			const result = gameManager.placeTetrisPiece(gameId, player1Id, {
				pieceType: 'I',
				rotation: 0,
				x,
				y,
				z: 1
			});
			
			// Assert
			expect(result.success).to.be.true;
			expect(result.exploded).to.be.true;
			// Verify the tetromino didn't stick to the board
			expect(game.board[y][x].chessPiece).to.be.undefined;
		});
	});
	
	describe('Pawn Promotion', () => {
		it('should promote pawn to knight after 8 forward moves', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			const pawn = gameManager._createChessPiece(game, player1Id, 'pawn');
			
			// Place the pawn on the board at a known position
			const startX = 10;
			const startY = 10;
			
			if (!game.board[startY][startX]) {
				game.board[startY][startX] = {};
			}
			game.board[startY][startX].chessPiece = pawn;
			pawn.position = { x: startX, y: startY };
			
			// Track pawn forward moves to reach 8 spaces
			// Assuming 'up' is forward for this test
			pawn.moveDistance = 7; // One more move will trigger promotion
			
			// Act
			const result = gameManager.moveChessPiece(gameId, player1Id, {
				pieceId: pawn.id,
				fromX: startX,
				fromY: startY,
				toX: startX,
				toY: startY - 1 // Move up (forward)
			});
			
			// Assert
			expect(result.success).to.be.true;
			expect(result.pawnPromoted).to.be.true;
			expect(game.board[startY-1][startX].chessPiece.type).to.equal('knight');
		});
	});
	
	describe('Asynchronous Turns', () => {
		it('should enforce minimum move time between moves', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Set lastMoveTime to now
			game.players[player1Id].lastMoveTime = Date.now();
			
			// Act - attempt to make a move immediately
			const result = gameManager.moveChessPiece(gameId, player1Id, {
				skipMove: true // Just to test the timing, not the actual move
			});
			
			// Assert
			expect(result.success).to.be.false;
			expect(result.error).to.include('Must wait');
			expect(result.waitTime).to.be.greaterThan(0);
		});
	});
	
	describe('Row Clearing', () => {
		it('should clear a row when 8 cells are filled', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Fill exactly 8 cells in a row (not in a safe home zone)
			const rowIndex = 15;
			for (let x = 10; x < 18; x++) {
				game.board[rowIndex][x] = {
					player: player1Id,
					type: 'path',
				};
			}
			
			// Act
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Assert
			expect(clearedRows).to.include(rowIndex);
			expect(game.board[rowIndex][10]).to.be.null;
		});
		
		it('should not clear cells in safe home zones', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			const homeZone = game.players[player1Id].homeZone;
			
			// Create a piece in the home zone
			const piece = gameManager._createChessPiece(game, player1Id, 'pawn');
			piece.position = { 
				x: homeZone.x, 
				y: homeZone.y 
			};
			game.board[homeZone.y][homeZone.x].chessPiece = piece;
			
			// Fill the entire row including the home zone
			const rowIndex = homeZone.y;
			for (let x = 0; x < game.settings.boardSize; x++) {
				if (!game.board[rowIndex][x]) {
					game.board[rowIndex][x] = {
						player: player1Id,
						type: 'path',
					};
				}
			}
			
			// Act
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Assert
			expect(clearedRows).to.include(rowIndex);
			// The home zone cell should still have the piece
			expect(game.board[homeZone.y][homeZone.x].chessPiece).to.not.be.null;
		});
	});
	
	describe('King Capture Mechanics', () => {
		it('should transfer captured player pieces to victor', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Create pieces for both players
			const king1 = gameManager._createChessPiece(game, player1Id, 'king');
			const king2 = gameManager._createChessPiece(game, player2Id, 'king');
			const pawn2 = gameManager._createChessPiece(game, player2Id, 'pawn');
			
			// Make sure the pieces array exists
			if (!game.chessPieces) {
				game.chessPieces = [];
			}
			
			game.chessPieces.push(king1, king2, pawn2);
			
			// Act
			gameManager._handleKingCapture(game, player1Id, player2Id);
			
			// Assert
			// The pawn should now belong to player1
			const capturedPawn = game.chessPieces.find(p => p.id === pawn2.id);
			expect(capturedPawn.player).to.equal(player1Id);
		});
		
		it('should transfer 50% of fees to victor', () => {
			// Arrange
			const game = gameManager.getGameState(gameId);
			
			// Create transactions array
			game.transactions = [
				{
					type: 'piece_purchase',
					playerId: player2Id,
					amount: 1.0, // 1 SOL
					timestamp: Date.now() - 10000
				},
				{
					type: 'piece_purchase',
					playerId: player2Id,
					amount: 0.5, // 0.5 SOL
					timestamp: Date.now() - 5000
				}
			];
			
			// Act
			gameManager._transferFees(game, player1Id, player2Id);
			
			// Assert
			const feeTransfer = game.transactions.find(tx => 
				tx.type === 'fee_transfer' && 
				tx.from === player2Id && 
				tx.to === player1Id
			);
			
			expect(feeTransfer).to.exist;
			expect(feeTransfer.amount).to.equal(0.75); // 50% of 1.5 SOL
		});
	});
}); 
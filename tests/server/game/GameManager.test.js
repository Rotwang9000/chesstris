/**
 * Tests for the GameManager class
 * These tests ensure that game rules are properly enforced and cheating is prevented
 */

const GameManager = require('../../../server/game/GameManager');
const assert = require('assert');

describe('GameManager', () => {
	let gameManager;
	let gameId;
	
	beforeEach(() => {
		// Create a fresh GameManager for each test
		gameManager = new GameManager();
		
		// Create a game to test with
		gameId = gameManager.createGame();
	});
	
	describe('Game Creation', () => {
		it('should create a game with default settings', () => {
			const game = gameManager.getGameState(gameId);
			
			assert.strictEqual(typeof game.id, 'string');
			assert.strictEqual(game.settings.boardSize, 24);
			assert.strictEqual(game.settings.homeZoneWidth, 8);
			assert.strictEqual(game.settings.homeZoneHeight, 2);
			assert.strictEqual(Object.keys(game.players).length, 0);
		});
		
		it('should create a game with custom settings', () => {
			const customGameId = gameManager.createGame({
				boardSize: 32,
				homeZoneWidth: 10,
				homeZoneHeight: 3
			});
			
			const game = gameManager.getGameState(customGameId);
			
			assert.strictEqual(game.settings.boardSize, 32);
			assert.strictEqual(game.settings.homeZoneWidth, 10);
			assert.strictEqual(game.settings.homeZoneHeight, 3);
		});
	});
	
	describe('Player Management', () => {
		it('should add a player to a game', () => {
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			
			assert.strictEqual(player.id, 'player1');
			assert.strictEqual(player.name, 'TestPlayer');
			assert.ok(player.color);
			assert.ok(player.homeZone);
			
			// Check that the player was added to the game
			const game = gameManager.getGameState(gameId);
			assert.strictEqual(Object.keys(game.players).length, 1);
			assert.ok(game.players['player1']);
		});
		
		it('should reject adding a player to a non-existent game', () => {
			assert.throws(() => {
				gameManager.addPlayer('fake-game-id', 'player1', 'TestPlayer');
			}, /Game fake-game-id not found/);
		});
		
		it('should not add the same player twice', () => {
			gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			const playerAgain = gameManager.addPlayer(gameId, 'player1', 'DifferentName');
			
			// Should return the existing player
			assert.strictEqual(playerAgain.name, 'TestPlayer');
			
			// Check that there's still only one player
			const game = gameManager.getGameState(gameId);
			assert.strictEqual(Object.keys(game.players).length, 1);
		});
		
		it('should create a home zone for the player', () => {
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			const game = gameManager.getGameState(gameId);
			
			// Check that home zone cells were created
			const { x, z, width, height } = player.homeZone;
			
			// Check a few cells in the home zone
			assert.ok(game.board[z][x]); // Top-left
			assert.strictEqual(game.board[z][x].type, 'home_zone');
			assert.strictEqual(game.board[z][x].player, 'player1');
			
			assert.ok(game.board[z + 1][x + width - 1]); // Bottom-right
			assert.strictEqual(game.board[z + 1][x + width - 1].type, 'home_zone');
			assert.strictEqual(game.board[z + 1][x + width - 1].player, 'player1');
		});
		
		it('should create chess pieces for the player', () => {
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			const game = gameManager.getGameState(gameId);
			
			// Check that the player has the correct number of pieces
			assert.strictEqual(player.pieces.length, 16); // 8 pawns + 8 other pieces
			
			// Check that there's a king
			const king = player.pieces.find(p => p.type === 'king');
			assert.ok(king);
			assert.strictEqual(king.player, 'player1');
			
			// Check that there are 8 pawns
			const pawns = player.pieces.filter(p => p.type === 'pawn');
			assert.strictEqual(pawns.length, 8);
		});
	});
	
	describe('Chess Piece Movement', () => {
		let player1Id;
		
		beforeEach(() => {
			// Add a player with pieces
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			player1Id = player.id;
		});
		
		it('should move a piece to an empty space', () => {
			const game = gameManager.getGameState(gameId);
			const homeZone = game.players[player1Id].homeZone;
			
			// Find a pawn to move
			let pawnPos = null;
			for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
				if (game.board[homeZone.z][x]?.chessPiece?.type === 'pawn') {
					pawnPos = { x, y: homeZone.z };
					break;
				}
			}
			
			// Move the pawn forward one space
			const result = gameManager.moveChessPiece(gameId, player1Id, {
				fromX: pawnPos.x,
				fromY: pawnPos.y,
				toX: pawnPos.x,
				toY: pawnPos.y - 1 // Move up one square
			});
			
			// Check that the piece was moved
			assert.strictEqual(result.movedPiece.type, 'pawn');
			assert.strictEqual(game.board[pawnPos.y][pawnPos.x].chessPiece, null); // Old position is empty
			assert.strictEqual(game.board[pawnPos.y - 1][pawnPos.x].chessPiece.type, 'pawn'); // New position has the pawn
		});
		
		it('should reject invalid moves', () => {
			const game = gameManager.getGameState(gameId);
			const homeZone = game.players[player1Id].homeZone;
			
			// Find a pawn to move
			let pawnPos = null;
			for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
				if (game.board[homeZone.z][x]?.chessPiece?.type === 'pawn') {
					pawnPos = { x, y: homeZone.z };
					break;
				}
			}
			
			// Try to move the pawn diagonally
			assert.throws(() => {
				gameManager.moveChessPiece(gameId, player1Id, {
					fromX: pawnPos.x,
					fromY: pawnPos.y,
					toX: pawnPos.x + 1, // Diagonal move
					toY: pawnPos.y - 1
				});
			}, /Invalid move/);
		});
		
		it('should reject moving another player\'s piece', () => {
			// Add a second player
			gameManager.addPlayer(gameId, 'player2', 'OtherPlayer');
			
			const game = gameManager.getGameState(gameId);
			const homeZone = game.players[player1Id].homeZone;
			
			// Find a pawn to move
			let pawnPos = null;
			for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
				if (game.board[homeZone.z][x]?.chessPiece?.type === 'pawn') {
					pawnPos = { x, y: homeZone.z };
					break;
				}
			}
			
			// Try to move player1's pawn with player2
			assert.throws(() => {
				gameManager.moveChessPiece(gameId, 'player2', {
					fromX: pawnPos.x,
					fromY: pawnPos.y,
					toX: pawnPos.x,
					toY: pawnPos.y - 1
				});
			}, /The piece .* doesn't belong to player/);
		});
	});
	
	describe('Tetris Piece Placement', () => {
		let player1Id;
		
		beforeEach(() => {
			// Add a player with a home zone
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			player1Id = player.id;
		});
		
		it('should place a tetris piece adjacent to a player\'s cell', () => {
			const game = gameManager.getGameState(gameId);
			const homeZone = game.players[player1Id].homeZone;
			
			// Place a tetris piece adjacent to the home zone
			const result = gameManager.placeTetrisPiece(gameId, player1Id, {
				shape: 'I',
				rotation: 0,
				x: homeZone.x - 4, // Place to the left
				y: homeZone.z
			});
			
			// Check that the piece was placed
			assert.strictEqual(result.placedCells.length, 4); // I piece has 4 blocks
		});
		
		it('should reject placement with no adjacency', () => {
			// Try to place a piece far from any existing cells
			assert.throws(() => {
				gameManager.placeTetrisPiece(gameId, player1Id, {
					shape: 'O',
					rotation: 0,
					x: 0,
					y: 0 // Far from the home zone
				});
			}, /no connectivity/);
		});
		
		it('should reject placement outside the board', () => {
			const game = gameManager.getGameState(gameId);
			const boardSize = game.settings.boardSize;
			
			// Try to place a piece outside the board
			assert.throws(() => {
				gameManager.placeTetrisPiece(gameId, player1Id, {
					shape: 'T',
					rotation: 0,
					x: boardSize, // Outside the board
					y: 0
				});
			}, /no connectivity/);
		});
	});
	
	describe('Row Clearing', () => {
		it('should clear a full row and shift cells down', () => {
			// Add a player
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			const game = gameManager.getGameState(gameId);
			const boardSize = game.settings.boardSize;
			
			// Find a row that's not part of the home zone
			const testRow = 5;
			
			// Fill the row with cells
			for (let x = 0; x < boardSize; x++) {
				game.board[testRow][x] = {
					type: 'tetris',
					player: player.id,
					chessPiece: null
				};
			}
			
			// Add a cell in the row above
			game.board[testRow - 1][3] = {
				type: 'tetris',
				player: player.id,
				chessPiece: null
			};
			
			// Clear rows
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Check that the row was cleared
			assert.strictEqual(clearedRows.length, 1);
			assert.strictEqual(clearedRows[0], testRow);
			
			// Check that the cell from the row above was shifted down
			assert.ok(game.board[testRow][3]);
			assert.strictEqual(game.board[testRow][3].type, 'tetris');
			
			// Check that the original row above is now empty
			assert.strictEqual(game.board[testRow - 1][3], null);
		});
		
		it('should not clear cells in home zones', () => {
			// Add a player
			const player = gameManager.addPlayer(gameId, 'player1', 'TestPlayer');
			const game = gameManager.getGameState(gameId);
			const boardSize = game.settings.boardSize;
			const homeZone = player.homeZone;
			
			// Fill a row that includes the home zone
			const testRow = homeZone.z;
			
			// Fill the rest of the row with cells
			for (let x = 0; x < boardSize; x++) {
				if (x < homeZone.x || x >= homeZone.x + homeZone.width) {
					game.board[testRow][x] = {
						type: 'tetris',
						player: player.id,
						chessPiece: null
					};
				}
			}
			
			// Clear rows
			const clearedRows = gameManager._checkAndClearRows(game);
			
			// Check that no rows were cleared because of the home zone
			assert.strictEqual(clearedRows.length, 0);
			
			// Check that the home zone cells are still there
			assert.ok(game.board[homeZone.z][homeZone.x]);
			assert.strictEqual(game.board[homeZone.z][homeZone.x].type, 'home_zone');
		});
	});
	
	describe('King Capture', () => {
		it('should transfer pieces when a king is captured', () => {
			// Add two players
			const player1 = gameManager.addPlayer(gameId, 'player1', 'Player 1');
			const player2 = gameManager.addPlayer(gameId, 'player2', 'Player 2');
			
			const game = gameManager.getGameState(gameId);
			
			// Find player2's king
			let kingPos = null;
			for (let y = 0; y < game.board.length; y++) {
				for (let x = 0; x < game.board[y].length; x++) {
					if (game.board[y][x]?.chessPiece?.type === 'king' && 
						game.board[y][x]?.chessPiece?.player === 'player2') {
						kingPos = { x, y };
						break;
					}
				}
				if (kingPos) break;
			}
			
			// Put player1's queen next to the king
			const queenPos = { x: kingPos.x - 1, y: kingPos.y };
			if (!game.board[queenPos.y][queenPos.x]) {
				game.board[queenPos.y][queenPos.x] = {
					type: 'cell',
					player: 'player1',
					chessPiece: null
				};
			}
			
			game.board[queenPos.y][queenPos.x].chessPiece = {
				type: 'queen',
				player: 'player1',
				id: 'p1_queen_test'
			};
			
			// Capture the king
			gameManager.moveChessPiece(gameId, 'player1', {
				fromX: queenPos.x,
				fromY: queenPos.y,
				toX: kingPos.x,
				toY: kingPos.y
			});
			
			// Count pieces for each player
			const p1PieceCount = game.players['player1'].pieces.length;
			const p2PieceCount = game.players['player2'].pieces.length;
			
			// Player2 should have no pieces left
			assert.strictEqual(p2PieceCount, 0);
			
			// Player1 should have all their original pieces plus captured pieces
			assert.ok(p1PieceCount > 9); // Original piece (queen) plus at least 8 captured pieces
			
			// Check that the player2's other pieces now belong to player1
			let transferredPieceFound = false;
			for (let y = 0; y < game.board.length; y++) {
				for (let x = 0; x < game.board[y].length; x++) {
					const cell = game.board[y][x];
					if (cell?.chessPiece && cell.chessPiece.type !== 'king' && 
						cell.chessPiece.player === 'player1' && 
						game.players['player2'].homeZone.x <= x && 
						x < game.players['player2'].homeZone.x + game.players['player2'].homeZone.width &&
						game.players['player2'].homeZone.z <= y && 
						y < game.players['player2'].homeZone.z + game.players['player2'].homeZone.height) {
						transferredPieceFound = true;
						break;
					}
				}
				if (transferredPieceFound) break;
			}
			
			assert.ok(transferredPieceFound);
		});
	});
}); 
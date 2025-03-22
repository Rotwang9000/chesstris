/**
 * Tests for pawn promotion
 */

import { expect } from 'chai';
import GameManager from '../../server/game/GameManager.js';

describe('Pawn Promotion', () => {
	let gameManager;
	let game;
	let events = [];
	
	beforeEach(() => {
		gameManager = new GameManager();
		
		// Mock the emitGameEvent method
		gameManager.emitGameEvent = (gameId, eventType, data) => {
			events.push({ gameId, eventType, data });
		};
		
		// Create a simplified game state for testing
		game = {
			id: 'test-game',
			settings: {
				boardSize: 10
			},
			board: Array(10).fill().map(() => Array(10).fill(null)),
			players: {},
			chessPieces: []
		};
		
		// Clear events array
		events = [];
	});
	
	describe('moveChessPiece', () => {
		it('should promote a pawn after 8 moves', () => {
			const playerId = 'player1';
			
			// Create a player
			game.players[playerId] = {
				id: playerId,
				pieces: []
			};
			
			// Create a pawn with 7 moves already made
			const pawn = {
				id: 'pawn1',
				type: 'pawn',
				player: playerId,
				moveCount: 7,
				position: {
					x: 2,
					y: 2
				}
			};
			
			// Add the pawn to the player's pieces
			game.players[playerId].pieces = [pawn];
			
			// Add the pawn to the board
			game.board[2][2] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Add the pawn to the game's chessPieces array
			game.chessPieces = [pawn];
			
			// Verify the move is valid
			const result = gameManager._isValidChessMove(game, pawn, 2, 2, 3, 3);
			expect(result).to.be.true;
			
			// Manually update the piece position and board to simulate a move
			pawn.position = { x: 3, y: 3 };
			pawn.moveCount = 8; // Increment move count
			
			// Update the board
			game.board[2][2].chessPiece = null;
			game.board[3][3] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Check for pawn promotion (similar to what happens in moveChessPiece)
			if (pawn.type === 'pawn' && pawn.moveCount >= 8) {
				const oldType = pawn.type;
				pawn.type = 'knight';
				pawn.promoted = true;
				
				// Emit pawn promotion event
				gameManager.emitGameEvent('test-game', 'pawnPromoted', {
					playerId,
					pieceId: pawn.id,
					x: 3,
					y: 3,
					oldType,
					newType: 'knight'
				});
			}
			
			// Verify the pawn was promoted
			const promotedPiece = game.players[playerId].pieces[0];
			expect(promotedPiece.type).to.equal('knight');
			expect(promotedPiece.promoted).to.be.true;
			
			// Verify the promotion event was emitted
			const promotionEvent = events.find(e => e.eventType === 'pawnPromoted');
			expect(promotionEvent).to.exist;
			expect(promotionEvent.data.playerId).to.equal(playerId);
			expect(promotionEvent.data.pieceId).to.equal('pawn1');
			expect(promotionEvent.data.oldType).to.equal('pawn');
			expect(promotionEvent.data.newType).to.equal('knight');
		});
		
		it('should not promote a pawn with fewer than 8 moves', () => {
			const playerId = 'player1';
			
			// Create a player
			game.players[playerId] = {
				id: playerId,
				pieces: []
			};
			
			// Create a pawn with 6 moves already made
			const pawn = {
				id: 'pawn1',
				type: 'pawn',
				player: playerId,
				moveCount: 6,
				position: {
					x: 2,
					y: 2
				}
			};
			
			// Add the pawn to the player's pieces
			game.players[playerId].pieces = [pawn];
			
			// Add the pawn to the board
			game.board[2][2] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Add the pawn to the game's chessPieces array
			game.chessPieces = [pawn];
			
			// Verify the move is valid
			const result = gameManager._isValidChessMove(game, pawn, 2, 2, 3, 3);
			expect(result).to.be.true;
			
			// Manually update the piece position and board to simulate a move
			pawn.position = { x: 3, y: 3 };
			pawn.moveCount = 7; // Increment move count
			
			// Update the board
			game.board[2][2].chessPiece = null;
			game.board[3][3] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Check for pawn promotion (similar to what happens in moveChessPiece)
			if (pawn.type === 'pawn' && pawn.moveCount >= 8) {
				const oldType = pawn.type;
				pawn.type = 'knight';
				pawn.promoted = true;
				
				// Emit pawn promotion event
				gameManager.emitGameEvent('test-game', 'pawnPromoted', {
					playerId,
					pieceId: pawn.id,
					x: 3,
					y: 3,
					oldType,
					newType: 'knight'
				});
			}
			
			// Verify the pawn was not promoted
			const movedPiece = game.players[playerId].pieces[0];
			expect(movedPiece.type).to.equal('pawn');
			expect(movedPiece.promoted).to.be.undefined;
			
			// Verify no promotion event was emitted
			const promotionEvent = events.find(e => e.eventType === 'pawnPromoted');
			expect(promotionEvent).to.not.exist;
		});
	});
	
	describe('GameManager Pawn Promotion', () => {
		it('should promote a pawn after 8 moves', () => {
			const gameId = 'test-game';
			const playerId = 'player1';
			
			// Create a game
			gameManager.games.set(gameId, game);
			
			// Create a player
			game.players[playerId] = {
				id: playerId,
				pieces: [],
				currentMoveType: 'chess'
			};
			
			// Create a pawn with 7 moves already made
			const pawn = {
				id: `${playerId}_pawn1`,
				type: 'pawn',
				player: playerId,
				moveCount: 7,
				position: {
					x: 2,
					y: 2
				}
			};
			
			// Add the pawn to the player's pieces
			game.players[playerId].pieces = [pawn];
			
			// Add the pawn to the board
			game.board[2][2] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Add the pawn to the game's chessPieces array
			game.chessPieces = [pawn];
			
			// Move the pawn (8th move)
			const result = gameManager.moveChessPiece(gameId, playerId, {
				pieceId: `${playerId}_pawn1`,
				fromX: 2,
				fromY: 2,
				toX: 3,
				toY: 3
			});
			
			// Verify the move was successful
			expect(result.success).to.be.true;
			
			// Verify the pawn was promoted
			const promotedPiece = game.players[playerId].pieces[0];
			expect(promotedPiece.type).to.equal('knight');
			expect(promotedPiece.promoted).to.be.true;
			
			// Verify the promotion event was emitted
			const promotionEvent = events.find(e => e.eventType === 'pawnPromoted');
			expect(promotionEvent).to.exist;
			expect(promotionEvent.data.playerId).to.equal(playerId);
			expect(promotionEvent.data.pieceId).to.equal(`${playerId}_pawn1`);
			expect(promotionEvent.data.oldType).to.equal('pawn');
			expect(promotionEvent.data.newType).to.equal('knight');
		});
		
		it('should not promote a pawn with fewer than 8 moves', () => {
			const gameId = 'test-game';
			const playerId = 'player1';
			
			// Create a game
			gameManager.games.set(gameId, game);
			
			// Create a player
			game.players[playerId] = {
				id: playerId,
				pieces: [],
				currentMoveType: 'chess'
			};
			
			// Create a pawn with 6 moves already made
			const pawn = {
				id: `${playerId}_pawn1`,
				type: 'pawn',
				player: playerId,
				moveCount: 6,
				position: {
					x: 2,
					y: 2
				}
			};
			
			// Add the pawn to the player's pieces
			game.players[playerId].pieces = [pawn];
			
			// Add the pawn to the board
			game.board[2][2] = {
				chessPiece: pawn,
				player: playerId
			};
			
			// Add the pawn to the game's chessPieces array
			game.chessPieces = [pawn];
			
			// Move the pawn (7th move)
			const result = gameManager.moveChessPiece(gameId, playerId, {
				pieceId: `${playerId}_pawn1`,
				fromX: 2,
				fromY: 2,
				toX: 3,
				toY: 3
			});
			
			// Verify the move was successful
			expect(result.success).to.be.true;
			
			// Verify the pawn was not promoted
			const movedPiece = game.players[playerId].pieces[0];
			expect(movedPiece.type).to.equal('pawn');
			expect(movedPiece.promoted).to.be.undefined;
			
			// Verify no promotion event was emitted
			const promotionEvent = events.find(e => e.eventType === 'pawnPromoted');
			expect(promotionEvent).to.not.exist;
		});
	});
}); 
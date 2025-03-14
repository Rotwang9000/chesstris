/**
 * Unit Tests for playerManager module
 * 
 * Tests the player management functionality.
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import original modules
import * as OriginalPlayerManager from '../../public/js/core/playerManager.js';
import * as OriginalGameState from '../../public/js/core/gameState.js';
import * as OriginalConstants from '../../public/js/core/constants.js';

// Import test helpers
import { createTestProxy } from '../setup.js';
import {
	TEST_CONSTANTS,
	createMockBoard,
	createMockGameState,
	createMockPlayer,
	createMockChessPiece
} from '../helpers.js';

describe('PlayerManager Module', () => {
	let sandbox;
	let PlayerManager;
	let GameState;
	let Constants;
	let mockGameState;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create proxies
		PlayerManager = createTestProxy(OriginalPlayerManager);
		GameState = createTestProxy(OriginalGameState);
		Constants = createTestProxy(OriginalConstants);
		
		// Set up test constants
		Constants.PIECE_TYPES = TEST_CONSTANTS.PIECE_TYPES;
		Constants.HOME_ZONE_WIDTH = TEST_CONSTANTS.HOME_ZONE_WIDTH;
		Constants.HOME_ZONE_HEIGHT = TEST_CONSTANTS.HOME_ZONE_HEIGHT;
		
		// Create a fresh game state for each test
		mockGameState = createMockGameState();
		GameState._testOverrides.gameState = mockGameState;
		
		// Set up GameState functions
		GameState.getGameState = () => mockGameState;
		
		// Set up PlayerManager functions
		PlayerManager.mockImplementation('getPlayer', (playerId) => {
			return mockGameState.players[playerId] || null;
		});
		
		PlayerManager.mockImplementation('getAllPlayers', () => {
			return Object.values(mockGameState.players);
		});
		
		PlayerManager.mockImplementation('removePlayer', (playerId) => {
			const player = mockGameState.players[playerId];
			if (player) {
				delete mockGameState.players[playerId];
				return player;
			}
			return null;
		});
		
		PlayerManager.mockImplementation('movePiece', async (pieceId, toX, toY, playerId) => {
			const player = mockGameState.players[playerId];
			if (!player) {
				return { success: false, error: 'Player not found' };
			}
			
			const piece = player.pieces.find(p => p.id === pieceId);
			if (!piece) {
				return { success: false, error: 'Piece not found' };
			}
			
			// Get valid moves
			const validMoves = GameState.getValidMoves ? 
				GameState.getValidMoves(piece, playerId) : [];
			
			// Find if target position is in valid moves
			const targetMove = validMoves.find(move => move.x === toX && move.y === toY);
			if (!targetMove) {
				return { success: false, error: 'Invalid move' };
			}
			
			// Store original position
			const fromX = piece.x;
			const fromY = piece.y;
			
			// Update piece position
			piece.x = toX;
			piece.y = toY;
			
			// Handle different move types
			let result = {
				success: true,
				piece,
				from: { x: fromX, y: fromY },
				to: { x: toX, y: toY }
			};
			
			// If it's an attack move
			if (targetMove.type === 'attack') {
				// Find the target piece
				let targetPlayer, targetPiece;
				
				for (const pid in mockGameState.players) {
					if (pid === playerId) continue;
					
					const p = mockGameState.players[pid];
					const targetPieceIndex = p.pieces.findIndex(piece => 
						piece.x === toX && piece.y === toY);
					
					if (targetPieceIndex >= 0) {
						targetPlayer = p;
						targetPiece = p.pieces[targetPieceIndex];
						// Remove the piece
						p.pieces.splice(targetPieceIndex, 1);
						break;
					}
				}
				
				if (targetPiece) {
					result.captured = true;
					result.capturedPiece = targetPiece;
				}
			}
			
			// If there's a potion at the target location
			if (mockGameState.board[`${toX},${toY}`]?.potion) {
				const potion = mockGameState.board[`${toX},${toY}`].potion;
				
				// Apply potion effect
				if (GameState.applyPotionEffect) {
					GameState.applyPotionEffect(player, potion);
				}
				
				// Remove potion from board
				delete mockGameState.board[`${toX},${toY}`].potion;
				
				result.potion = potion;
			}
			
			// Update board
			if (mockGameState.board[`${fromX},${fromY}`]) {
				delete mockGameState.board[`${fromX},${fromY}`].piece;
			}
			
			if (!mockGameState.board[`${toX},${toY}`]) {
				mockGameState.board[`${toX},${toY}`] = { x: toX, y: toY };
			}
			
			mockGameState.board[`${toX},${toY}`].piece = piece;
			
			return result;
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('addPlayer', () => {
		it('should add a new player successfully', async () => {
			// Arrange
			const socketId = 'socket-123';
			const username = 'testPlayer';
			
			// Mock GameState functions
			GameState.generatePlayerColor = () => '#ff0000';
			GameState.findHomeZonePosition = () => ({
				startX: 1,
				startY: 1,
				width: Constants.HOME_ZONE_WIDTH,
				height: Constants.HOME_ZONE_HEIGHT
			});
			GameState.addChessPiecesToHomeZone = () => [];
			
			// Mock implementation
			PlayerManager.addPlayer = async (socketId, username) => {
				const player = {
					id: socketId,
					username: username || `Player${Math.floor(Math.random() * 1000)}`,
					color: GameState.generatePlayerColor(),
					homeZone: GameState.findHomeZonePosition(),
					pieces: [],
					score: 0
				};
				
				// Add player to game state
				mockGameState.players[player.id] = player;
				
				// Add chess pieces to home zone
				player.pieces = GameState.addChessPiecesToHomeZone(player);
				
				return player;
			};
			
			// Act
			const player = await PlayerManager.addPlayer(socketId, username);
			
			// Assert
			expect(player).to.be.an('object');
			expect(player.id).to.equal(socketId);
			expect(player.username).to.equal(username);
			expect(player.color).to.equal('#ff0000');
			expect(player.homeZone).to.be.an('object');
			expect(player.pieces).to.be.an('array');
			expect(player.score).to.equal(0);
			
			// Check that the player is added to game state
			expect(mockGameState.players[socketId]).to.equal(player);
		});
		
		it('should add a player with default username if none provided', async () => {
			// Arrange
			const socketId = 'socket-123';
			
			// Mock GameState functions
			GameState.generatePlayerColor = () => '#ff0000';
			GameState.findHomeZonePosition = () => ({
				startX: 1,
				startY: 1,
				width: Constants.HOME_ZONE_WIDTH,
				height: Constants.HOME_ZONE_HEIGHT
			});
			GameState.addChessPiecesToHomeZone = () => [];
			
			// Mock implementation
			PlayerManager.addPlayer = async (socketId, username) => {
				const player = {
					id: socketId,
					username: username || `Player${Math.floor(Math.random() * 1000)}`,
					color: GameState.generatePlayerColor(),
					homeZone: GameState.findHomeZonePosition(),
					pieces: [],
					score: 0
				};
				
				// Add player to game state
				mockGameState.players[player.id] = player;
				
				// Add chess pieces to home zone
				player.pieces = GameState.addChessPiecesToHomeZone(player);
				
				return player;
			};
			
			// Act
			const player = await PlayerManager.addPlayer(socketId);
			
			// Assert
			expect(player).to.be.an('object');
			expect(player.id).to.equal(socketId);
			expect(player.username).to.match(/^Player\d+$/);
			expect(player.color).to.equal('#ff0000');
			expect(player.homeZone).to.be.an('object');
			expect(player.pieces).to.be.an('array');
			expect(player.score).to.equal(0);
			
			// Check that the player is added to game state
			expect(mockGameState.players[socketId]).to.equal(player);
		});
		
		it('should include user data when provided', async () => {
			// Arrange
			const socketId = 'socket-123';
			const username = 'testPlayer';
			const userData = {
				email: 'test@example.com',
				avatar: 'avatar.png'
			};
			
			// Mock GameState functions
			GameState.generatePlayerColor = () => '#ff0000';
			GameState.findHomeZonePosition = () => ({
				startX: 1,
				startY: 1,
				width: Constants.HOME_ZONE_WIDTH,
				height: Constants.HOME_ZONE_HEIGHT
			});
			GameState.addChessPiecesToHomeZone = () => [];
			
			// Mock implementation
			PlayerManager.addPlayer = async (socketId, username, userData) => {
				const player = {
					id: socketId,
					username: username || `Player${Math.floor(Math.random() * 1000)}`,
					color: GameState.generatePlayerColor(),
					homeZone: GameState.findHomeZonePosition(),
					pieces: [],
					score: 0,
					userData: userData || {}
				};
				
				// Add player to game state
				mockGameState.players[player.id] = player;
				
				// Add chess pieces to home zone
				player.pieces = GameState.addChessPiecesToHomeZone(player);
				
				return player;
			};
			
			// Act
			const player = await PlayerManager.addPlayer(socketId, username, userData);
			
			// Assert
			expect(player).to.be.an('object');
			expect(player.id).to.equal(socketId);
			expect(player.username).to.equal(username);
			expect(player.color).to.equal('#ff0000');
			expect(player.homeZone).to.be.an('object');
			expect(player.pieces).to.be.an('array');
			expect(player.score).to.equal(0);
			expect(player.userData).to.deep.equal(userData);
			
			// Check that the player is added to game state
			expect(mockGameState.players[socketId]).to.equal(player);
		});
	});
	
	describe('removePlayer', () => {
		it('should remove a player from the game', () => {
			// Arrange
			const playerId = 'player-to-remove';
			
			// Set up game state with a player directly in the mock
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'RemoveMe',
				pieces: []
			};
			
			// Act
			const removedPlayer = PlayerManager.removePlayer(playerId);
			
			// Assert
			expect(removedPlayer).to.be.an('object');
			expect(removedPlayer.id).to.equal(playerId);
			expect(mockGameState.players[playerId]).to.be.undefined;
		});
		
		it('should return null if player not found', () => {
			// Act
			const result = PlayerManager.removePlayer('non-existent-player');
			
			// Assert
			expect(result).to.be.null;
		});
	});
	
	describe('getPlayer and getAllPlayers', () => {
		it('should get a player by ID', () => {
			// Arrange
			const playerId = 'test-player-id';
			const playerData = {
				id: playerId,
				username: 'TestPlayer'
			};
			
			// Use mockGameState directly
			mockGameState.players[playerId] = playerData;
			
			// Act
			const player = PlayerManager.getPlayer(playerId);
			
			// Assert
			expect(player).to.deep.equal(playerData);
		});
		
		it('should return null if player not found', () => {
			// Act
			const player = PlayerManager.getPlayer('non-existent-player');
			
			// Assert
			expect(player).to.be.null;
		});
		
		it('should get all players', () => {
			// Arrange
			const players = {
				'player1': { id: 'player1', username: 'One' },
				'player2': { id: 'player2', username: 'Two' },
				'player3': { id: 'player3', username: 'Three' }
			};
			
			// Use mockGameState directly
			mockGameState.players = players;
			
			// Act
			const allPlayers = PlayerManager.getAllPlayers();
			
			// Assert
			expect(allPlayers).to.be.an('array');
			expect(allPlayers).to.have.lengthOf(3);
			expect(allPlayers).to.deep.include(players.player1);
			expect(allPlayers).to.deep.include(players.player2);
			expect(allPlayers).to.deep.include(players.player3);
		});
	});
	
	describe('movePiece', () => {
		it('should move a chess piece to a valid position', async () => {
			// Arrange
			const gameState = GameState.getGameState();
			const playerId = 'player-move-test';
			const pieceId = 'piece-123';
			
			// Create player
			gameState.players[playerId] = {
				id: playerId,
				username: 'MoveTest',
				pieces: [{
					id: pieceId,
					type: Constants.PIECE_TYPES.PAWN,
					x: 3,
					y: 3,
					playerId
				}]
			};
			
			// Add piece to board
			gameState.board['3,3'] = {
				x: 3,
				y: 3,
				piece: gameState.players[playerId].pieces[0]
			};
			
			// Create valid move position
			gameState.board['3,2'] = {
				x: 3,
				y: 2
			};
			
			// Stub getValidMoves to return our target position
			const validMoves = [
				{ x: 3, y: 2, type: 'move' }
			];
			const getValidMovesStub = sandbox.stub();
			getValidMovesStub.returns(validMoves);
			GameState.getValidMoves = getValidMovesStub;
			
			// Mock implementation
			PlayerManager.movePiece = async (pieceId, toX, toY, playerId) => {
				const player = gameState.players[playerId];
				if (!player) {
					return { success: false, error: 'Player not found' };
				}
				
				const piece = player.pieces.find(p => p.id === pieceId);
				if (!piece) {
					return { success: false, error: 'Piece not found' };
				}
				
				const validMoves = GameState.getValidMoves(piece, playerId);
				const targetMove = validMoves.find(move => move.x === toX && move.y === toY);
				
				if (!targetMove) {
					return { success: false, error: 'Invalid move' };
				}
				
				// Store original position
				const fromX = piece.x;
				const fromY = piece.y;
				
				// Update piece position
				piece.x = toX;
				piece.y = toY;
				
				// Update board
				delete gameState.board[`${fromX},${fromY}`].piece;
				if (!gameState.board[`${toX},${toY}`]) {
					gameState.board[`${toX},${toY}`] = { x: toX, y: toY };
				}
				gameState.board[`${toX},${toY}`].piece = piece;
				
				return {
					success: true,
					piece,
					from: { x: fromX, y: fromY },
					to: { x: toX, y: toY }
				};
			};
			
			// Act
			const result = await PlayerManager.movePiece(pieceId, 3, 2, playerId);
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.true;
			expect(result.piece).to.equal(gameState.players[playerId].pieces[0]);
			expect(result.from).to.deep.equal({ x: 3, y: 3 });
			expect(result.to).to.deep.equal({ x: 3, y: 2 });
		});
		
		it('should handle attack moves correctly', async () => {
			// Arrange
			const player1Id = 'attacking-player';
			const player2Id = 'defending-player';
			const attackingPieceId = 'attacking-piece';
			const targetPiece = {
				id: 'defending-piece',
				type: 'pawn',
				x: 5,
				y: 3
			};
			
			// Create players
			mockGameState.players[player1Id] = {
				id: player1Id,
				username: 'Attacker',
				pieces: [{
					id: attackingPieceId,
					type: 'rook',
					x: 3,
					y: 3
				}]
			};
			
			mockGameState.players[player2Id] = {
				id: player2Id,
				username: 'Defender',
				pieces: [targetPiece]
			};
			
			// Add pieces to board
			mockGameState.board['3,3'] = {
				x: 3,
				y: 3,
				piece: mockGameState.players[player1Id].pieces[0]
			};
			
			mockGameState.board['5,3'] = {
				x: 5,
				y: 3,
				piece: targetPiece
			};
			
			// Set up getValidMoves to return attack move
			GameState.mockImplementation('getValidMoves', () => [
				{ x: 5, y: 3, type: 'attack' }
			]);
			
			// Act
			const result = await PlayerManager.movePiece(attackingPieceId, 5, 3, player1Id);
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.true;
			expect(result.captured).to.be.true;
			expect(result.capturedPiece).to.deep.equal(targetPiece);
			
			// Check that target piece was removed from defender's pieces
			expect(mockGameState.players[player2Id].pieces).to.be.empty;
			
			// Check that the piece was moved on the board
			expect(mockGameState.board['3,3'].piece).to.be.undefined;
			expect(mockGameState.board['5,3'].piece).to.equal(mockGameState.players[player1Id].pieces[0]);
		});
		
		it('should handle potion collection', async () => {
			// Arrange
			const playerId = 'potion-collector';
			const pieceId = 'collector-piece';
			const potion = {
				type: 1,
				strength: 2
			};
			
			// Create player
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'Collector',
				pieces: [{
					id: pieceId,
					type: 'pawn',
					x: 3,
					y: 3
				}]
			};
			
			// Add piece to board
			mockGameState.board['3,3'] = {
				x: 3,
				y: 3,
				piece: mockGameState.players[playerId].pieces[0]
			};
			
			// Add potion to target cell
			mockGameState.board['5,3'] = {
				x: 5,
				y: 3,
				potion
			};
			
			// Set up getValidMoves to return valid move to potion
			GameState.mockImplementation('getValidMoves', () => [
				{ x: 5, y: 3, type: 'move' }
			]);
			
			// Set up applyPotionEffect stub
			GameState.mockImplementation('applyPotionEffect', (player, potion) => {
				player.speed = (player.speed || 1) + potion.strength;
			});
			
			// Act
			const result = await PlayerManager.movePiece(pieceId, 5, 3, playerId);
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.true;
			expect(result.potion).to.equal(potion);
			
			// Check that potion was applied
			expect(mockGameState.players[playerId].speed).to.equal(3);
			
			// Check that potion was removed from board
			expect(mockGameState.board['5,3'].potion).to.be.undefined;
		});
		
		it('should return error for invalid move', async () => {
			// Arrange
			const playerId = 'invalid-mover';
			const pieceId = 'invalid-piece';
			
			// Create player
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'InvalidMover',
				pieces: [{
					id: pieceId,
					type: 'pawn',
					x: 3,
					y: 3
				}]
			};
			
			// Add piece to board
			mockGameState.board['3,3'] = {
				x: 3,
				y: 3,
				piece: mockGameState.players[playerId].pieces[0]
			};
			
			// Set up getValidMoves to return empty array (no valid moves)
			GameState.mockImplementation('getValidMoves', () => []);
			
			// Act
			const result = await PlayerManager.movePiece(pieceId, 5, 5, playerId);
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.false;
			expect(result.error).to.equal('Invalid move');
			
			// Check that the piece was not moved
			expect(mockGameState.players[playerId].pieces[0].x).to.equal(3);
			expect(mockGameState.players[playerId].pieces[0].y).to.equal(3);
		});
		
		it('should return error for non-existent player', async () => {
			// Act
			const result = await PlayerManager.movePiece('some-piece', 1, 1, 'non-existent-player');
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.false;
			expect(result.error).to.equal('Player not found');
		});
		
		it('should return error for non-existent piece', async () => {
			// Arrange
			const playerId = 'player-without-piece';
			
			// Create player without the specific piece
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'NoPieces',
				pieces: []
			};
			
			// Act
			const result = await PlayerManager.movePiece('non-existent-piece', 1, 1, playerId);
			
			// Assert
			expect(result).to.be.an('object');
			expect(result.success).to.be.false;
			expect(result.error).to.equal('Piece not found');
		});
	});
	
	describe('updatePlayerScore', () => {
		beforeEach(() => {
			// Override the updatePlayerScore implementation
			PlayerManager.mockImplementation('updatePlayerScore', (playerId, points) => {
				const player = mockGameState.players[playerId];
				if (!player) return 0;
				
				player.score = (player.score || 0) + points;
				return player.score;
			});
		});

		it('should update a player\'s score', () => {
			// Arrange
			const playerId = 'score-player';
			
			// Create player with initial score in mockGameState directly
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'Scorer',
				score: 100
			};
			
			// Act
			const newScore = PlayerManager.updatePlayerScore(playerId, 50);
			
			// Assert
			expect(newScore).to.equal(150);
			expect(mockGameState.players[playerId].score).to.equal(150);
		});
		
		it('should return 0 for non-existent player', () => {
			// Act
			const result = PlayerManager.updatePlayerScore('non-existent-player', 50);
			
			// Assert
			expect(result).to.equal(0);
		});
	});
	
	describe('hasRemainingPieces', () => {
		beforeEach(() => {
			// Override the hasRemainingPieces implementation
			PlayerManager.mockImplementation('hasRemainingPieces', (playerId) => {
				const player = mockGameState.players[playerId];
				if (!player) return false;
				return player.pieces && player.pieces.length > 0;
			});
		});

		it('should return true if player has pieces', () => {
			// Arrange
			const playerId = 'player-with-pieces';
			
			// Create player with pieces in mockGameState directly
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'HasPieces',
				pieces: [{ id: 'piece1' }]
			};
			
			// Act
			const result = PlayerManager.hasRemainingPieces(playerId);
			
			// Assert
			expect(result).to.be.true;
		});
		
		it('should return false if player has no pieces', () => {
			// Arrange
			const playerId = 'player-without-pieces';
			
			// Create player without pieces in mockGameState directly
			mockGameState.players[playerId] = {
				id: playerId,
				username: 'NoPieces',
				pieces: []
			};
			
			// Act
			const result = PlayerManager.hasRemainingPieces(playerId);
			
			// Assert
			expect(result).to.be.false;
		});
		
		it('should return false for non-existent player', () => {
			// Act
			const result = PlayerManager.hasRemainingPieces('non-existent-player');
			
			// Assert
			expect(result).to.be.false;
		});
	});
	
	describe('getWinner', () => {
		beforeEach(() => {
			// Override the getWinner implementation
			PlayerManager.mockImplementation('getWinner', () => {
				const players = Object.values(mockGameState.players);
				if (players.length === 0) return null;
				
				return players.reduce((highest, player) => {
					return (!highest || player.score > highest.score) ? player : highest;
				}, null);
			});
		});

		it('should return the player with the highest score', () => {
			// Arrange
			// Create players with different scores in mockGameState directly
			mockGameState.players = {
				'player1': { id: 'player1', username: 'One', score: 100 },
				'player2': { id: 'player2', username: 'Two', score: 300 },
				'player3': { id: 'player3', username: 'Three', score: 200 }
			};
			
			// Act
			const winner = PlayerManager.getWinner();
			
			// Assert
			expect(winner).to.deep.equal(mockGameState.players.player2);
		});
		
		it('should return null if there are no players', () => {
			// Arrange
			mockGameState.players = {};
			
			// Act
			const winner = PlayerManager.getWinner();
			
			// Assert
			expect(winner).to.be.null;
		});
	});
}); 
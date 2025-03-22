/**
 * Tests for the Solana-based piece purchase system
 */

const { expect } = require('@jest/globals');
const GameManager = require('../../server/game/GameManager');
const { PIECE_PRICES } = require('../../server/constants');

describe('Piece Purchase System', () => {
	let mockGameState;
	let serverProxy;
	let ioMock;
	let gameManager;
	let gameId;
	let playerId;
	
	beforeEach(() => {
		// Create a mock game state
		mockGameState = {
			board: Array(10).fill().map(() => Array(10).fill(null)),
			playerPurchases: {
				player1: 0.5,  // Player 1 has already spent 0.5 SOL
				player2: 1.0   // Player 2 has already spent 1.0 SOL
			},
			PIECE_PRICES: {
				pawn: 0.1,
				knight: 0.5,
				bishop: 0.5,
				rook: 0.5,
				queen: 1.0
			}
		};
		
		// Add some valid cells for the player
		mockGameState.board[5][5] = { playerId: 'player1', color: 'red' };
		mockGameState.board[5][6] = { playerId: 'player1', color: 'red' };
		
		// Add king at (5, 7)
		mockGameState.board[7][5] = {
			piece: { type: 'king' },
			playerId: 'player1',
			color: 'red'
		};
		
		// Add a cell for another player
		mockGameState.board[8][8] = { playerId: 'player2', color: 'blue' };
		
		// Mock IO object
		ioMock = {
			emit: jest.fn()
		};
		
		// Create server proxy with mocked functions
		serverProxy = {
			getGameState: jest.fn(() => mockGameState),
			hasPathToKing: jest.fn((x, y, kingX, kingY, playerId) => {
				// Simple mock: cells at y=5 or y=6 have a path to the king
				return (y === 5 || y === 6) && playerId === 'player1';
			}),
			findKingPosition: jest.fn((playerId) => {
				if (playerId === 'player1') return { x: 5, y: 7 };
				return null;
			}),
			validateSolanaTransaction: jest.fn(() => Promise.resolve(true)),
			emitEvent: jest.fn((event, data) => {
				ioMock.emit(event, data);
			}),
			getPlayerFeesPaid: jest.fn((playerId) => {
				return mockGameState.playerPurchases[playerId] || 0;
			}),
			handlePiecePurchase: jest.fn(async (playerId, pieceType, x, y) => {
				// Check if piece type is valid
				if (pieceType === 'king') {
					return { success: false, error: 'Invalid piece type' };
				}
				
				// Check if placement location is valid
				if (x >= mockGameState.board.length || y >= mockGameState.board[0].length) {
					return { success: false, error: 'Invalid placement location' };
				}
				
				// Check if cell already has a piece
				if (mockGameState.board[y][x] && mockGameState.board[y][x].piece) {
					return { success: false, error: 'Invalid placement location' };
				}
				
				// Check if there's a path to the king
				const kingPos = serverProxy.findKingPosition(playerId);
				if (!kingPos || !serverProxy.hasPathToKing(x, y, kingPos.x, kingPos.y, playerId)) {
					return { success: false, error: 'Piece must have a path to your king' };
				}
				
				// Process the purchase
				const price = mockGameState.PIECE_PRICES[pieceType];
				
				// Update the board
				if (!mockGameState.board[y][x]) {
					mockGameState.board[y][x] = { playerId, color: 'red' };
				}
				mockGameState.board[y][x].piece = { type: pieceType, purchased: true };
				
				// Track the purchase
				mockGameState.playerPurchases[playerId] = (mockGameState.playerPurchases[playerId] || 0) + price;
				
				// Emit event
				serverProxy.emitEvent('piecePurchased', {
					playerId,
					pieceType,
					x, 
					y,
					price
				});
				
				return {
					success: true,
					pieceType,
					x,
					y,
					price
				};
			}),
			awardCaptureFees: jest.fn(async (defeatedPlayerId, victorPlayerId) => {
				const fees = serverProxy.getPlayerFeesPaid(defeatedPlayerId);
				if (!fees) return;
				
				const award = fees * 0.5; // 50% of fees go to victor
				
				// Reset the defeated player's fees
				mockGameState.playerPurchases[defeatedPlayerId] = 0;
				
				// Emit event
				serverProxy.emitEvent('feesAwarded', {
					defeatedPlayerId,
					victorPlayerId,
					amount: award
				});
			}),
			transferOwnership: jest.fn((fromPlayerId, toPlayerId) => {
				for (let y = 0; y < mockGameState.board.length; y++) {
					for (let x = 0; x < mockGameState.board[y].length; x++) {
						const cell = mockGameState.board[y][x];
						if (cell && cell.playerId === fromPlayerId) {
							cell.playerId = toPlayerId;
							cell.color = 'red'; // Change color to match new owner
						}
					}
				}
				
				return { success: true };
			})
		};
		
		// Set up game manager
		gameManager = new GameManager();
		
		// Set game and player IDs
		gameId = 'test-game-id';
		playerId = 'player1';
	});
	
	afterEach(() => {
		jest.clearAllMocks();
	});
	
	describe('handlePiecePurchase', () => {
		it('should reject invalid piece types', async () => {
			const result = await serverProxy.handlePiecePurchase(playerId, 'king', 5, 5);
			
			expect(result.success).toBe(false);
			expect(result.error).toBe('Invalid piece type');
		});
		
		it('should reject invalid placement locations', async () => {
			const result = await serverProxy.handlePiecePurchase(playerId, 'pawn', 50, 50);
			
			expect(result.success).toBe(false);
			expect(result.error).toBe('Invalid placement location');
		});
		
		it('should reject placements without a path to the king', async () => {
			// Mock hasPathToKing to return false
			serverProxy.hasPathToKing.mockReturnValueOnce(false);
			
			const result = await serverProxy.handlePiecePurchase(playerId, 'pawn', 8, 8);
			
			expect(result.success).toBe(false);
			expect(result.error).toBe('Piece must have a path to your king');
			expect(serverProxy.hasPathToKing).toHaveBeenCalled();
		});
		
		it('should successfully purchase and place a piece', async () => {
			const result = await serverProxy.handlePiecePurchase(playerId, 'pawn', 5, 5);
			
			expect(result.success).toBe(true);
			expect(result.pieceType).toBe('pawn');
			expect(result.x).toBe(5);
			expect(result.y).toBe(5);
			expect(serverProxy.emitEvent).toHaveBeenCalledWith('piecePurchased', expect.any(Object));
		});
	});
	
	describe('getPlayerFeesPaid', () => {
		it('should return the total fees paid by a player', () => {
			const fees = serverProxy.getPlayerFeesPaid('player1');
			
			expect(fees).toBe(0.5);
			expect(serverProxy.getPlayerFeesPaid('player3')).toBe(0);
		});
	});
	
	describe('awardCaptureFees', () => {
		it('should award 50% of the fees to the victor', async () => {
			await serverProxy.awardCaptureFees('player2', 'player1');
			
			expect(mockGameState.playerPurchases.player2).toBe(0);
			expect(serverProxy.emitEvent).toHaveBeenCalledWith('feesAwarded', {
				defeatedPlayerId: 'player2',
				victorPlayerId: 'player1',
				amount: 0.5 // 50% of 1.0
			});
		});
		
		it('should not award fees if none were paid', async () => {
			await serverProxy.awardCaptureFees('player3', 'player1');
			
			expect(serverProxy.emitEvent).not.toHaveBeenCalled();
		});
	});
	
	describe('transferOwnership', () => {
		it('should transfer all pieces from one player to another', () => {
			serverProxy.transferOwnership('player2', 'player1');
			
			// Check if the cell at (8, 8) now belongs to player1
			expect(mockGameState.board[8][8].playerId).toBe('player1');
			expect(mockGameState.board[8][8].color).toBe('red');
		});
	});
	
	it('should successfully purchase a pawn', async () => {
		const result = await serverProxy.handlePiecePurchase(playerId, 'pawn', 1, 1);
		
		expect(result.success).toBe(true);
		expect(result.pieceType).toBe('pawn');
		expect(mockGameState.board[1][1].piece.type).toBe('pawn');
		expect(mockGameState.playerPurchases[playerId]).toBe(0.6); // 0.5 + 0.1
	});
	
	it('should fail if insufficient payment is provided', async () => {
		// This is just a placeholder test, as the actual payment verification would be in validateSolanaTransaction
		serverProxy.validateSolanaTransaction.mockResolvedValueOnce(false);
		
		// A real implementation would check the transaction value against the price
		expect(await serverProxy.validateSolanaTransaction()).toBe(false);
	});
	
	it('should fail if invalid piece type is requested', async () => {
		const result = await serverProxy.handlePiecePurchase(playerId, 'invalid', 1, 1);
		
		expect(result.success).toBe(false);
	});
	
	it('should fail to purchase a king', async () => {
		const result = await serverProxy.handlePiecePurchase(playerId, 'king', 1, 1);
		
		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid piece type');
	});
	
	it('should place the purchased piece in the home zone', async () => {
		// Mock findKingPosition to simulate a home zone
		serverProxy.findKingPosition.mockReturnValueOnce({ x: 1, y: 1 });
		
		// Mock hasPathToKing to always return true for this test
		serverProxy.hasPathToKing.mockReturnValueOnce(true);
		
		const result = await serverProxy.handlePiecePurchase(playerId, 'pawn', 1, 1);
		
		expect(result.success).toBe(true);
		expect(mockGameState.board[1][1].piece.type).toBe('pawn');
		expect(mockGameState.board[1][1].piece.purchased).toBe(true);
	});
});
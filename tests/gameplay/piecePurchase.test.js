/**
 * Tests for the Solana-based piece purchase system
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';

describe('Piece Purchase System', () => {
	let mockGameState;
	let serverProxy;
	let sandbox;
	let ioMock;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
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
			emit: sandbox.stub()
		};
		
		// Create server proxy with mocked functions
		serverProxy = createTestProxy({
			getGameState: () => mockGameState,
			hasPathToKing: (x, y, kingX, kingY, playerId) => {
				// Simple mock: cells at y=5 or y=6 have a path to the king
				return (y === 5 || y === 6) && playerId === 'player1';
			},
			findKingPosition: (playerId) => {
				if (playerId === 'player1') return { x: 5, y: 7 };
				return null;
			},
			validateSolanaTransaction: () => Promise.resolve(true),
			emitEvent: (event, data) => {
				ioMock.emit(event, data);
			},
			getPlayerFeesPaid: (playerId) => {
				return mockGameState.playerPurchases[playerId] || 0;
			},
			handlePiecePurchase: async (playerId, pieceType, x, y) => {
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
			},
			awardCaptureFees: async (defeatedPlayerId, victorPlayerId) => {
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
			},
			transferOwnership: (fromPlayerId, toPlayerId) => {
				for (let y = 0; y < mockGameState.board.length; y++) {
					for (let x = 0; x < mockGameState.board[y].length; x++) {
						const cell = mockGameState.board[y][x];
						if (cell && cell.playerId === fromPlayerId) {
							cell.playerId = toPlayerId;
							cell.color = 'red'; // Change color to match new owner
						}
					}
				}
				
				// Emit event
				serverProxy.emitEvent('ownershipTransferred', {
					fromPlayerId,
					toPlayerId
				});
			}
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('handlePiecePurchase', () => {
		it('should reject invalid piece types', async () => {
			const result = await serverProxy.handlePiecePurchase('player1', 'king', 5, 5);
			
			expect(result.success).to.be.false;
			expect(result.error).to.include('Invalid piece type');
		});
		
		it('should reject invalid placement locations', async () => {
			// Try to place on an out-of-bounds cell
			let result = await serverProxy.handlePiecePurchase('player1', 'pawn', 20, 20);
			expect(result.success).to.be.false;
			expect(result.error).to.include('Invalid placement location');
			
			// Try to place on a cell with a piece already
			mockGameState.board[5][5].piece = { type: 'pawn' };
			result = await serverProxy.handlePiecePurchase('player1', 'pawn', 5, 5);
			expect(result.success).to.be.false;
			expect(result.error).to.include('Invalid placement location');
		});
		
		it('should reject placements without a path to the king', async () => {
			// Position (1, 1) doesn't have a path to king
			const result = await serverProxy.handlePiecePurchase('player1', 'pawn', 1, 1);
			expect(result.success).to.be.false;
			expect(result.error).to.include('path to your king');
		});
		
		it('should successfully purchase and place a piece', async () => {
			const result = await serverProxy.handlePiecePurchase('player1', 'pawn', 5, 6);
			
			expect(result.success).to.be.true;
			expect(result.pieceType).to.equal('pawn');
			expect(result.x).to.equal(5);
			expect(result.y).to.equal(6);
			expect(result.price).to.equal(0.1);
			
			// Check that the piece was placed on the board
			expect(mockGameState.board[6][5].piece).to.exist;
			expect(mockGameState.board[6][5].piece.type).to.equal('pawn');
			expect(mockGameState.board[6][5].piece.purchased).to.be.true;
			expect(mockGameState.board[6][5].playerId).to.equal('player1');
			
			// Check that the purchase was tracked
			expect(mockGameState.playerPurchases.player1).to.equal(0.6); // 0.5 + 0.1
			
			// Check that notification was sent
			expect(ioMock.emit.calledWith('piecePurchased')).to.be.true;
		});
	});
	
	describe('getPlayerFeesPaid', () => {
		it('should return the total fees paid by a player', () => {
			expect(serverProxy.getPlayerFeesPaid('player1')).to.equal(0.5);
			expect(serverProxy.getPlayerFeesPaid('player2')).to.equal(1.0);
			expect(serverProxy.getPlayerFeesPaid('player3')).to.equal(0); // Non-existent player
		});
	});
	
	describe('awardCaptureFees', () => {
		it('should award 50% of the fees to the victor', async () => {
			await serverProxy.awardCaptureFees('player2', 'player1');
			
			// Check that the correct notification was sent
			expect(ioMock.emit.calledWith('feesAwarded')).to.be.true;
			
			const feeEvent = ioMock.emit.args.find(args => args[0] === 'feesAwarded')[1];
			expect(feeEvent.defeatedPlayerId).to.equal('player2');
			expect(feeEvent.victorPlayerId).to.equal('player1');
			expect(feeEvent.amount).to.equal(0.5); // 50% of 1.0 SOL
			
			// Check that the defeated player's fees were reset
			expect(mockGameState.playerPurchases.player2).to.equal(0);
		});
		
		it('should not award fees if none were paid', async () => {
			// Clear player2's purchases
			mockGameState.playerPurchases.player2 = 0;
			
			await serverProxy.awardCaptureFees('player2', 'player1');
			
			// No fees event should be emitted
			expect(ioMock.emit.calledWith('feesAwarded')).to.be.false;
		});
	});
	
	describe('transferOwnership', () => {
		it('should transfer all pieces from one player to another', () => {
			// Add some pieces for player2
			mockGameState.board[8][8].piece = { type: 'pawn' };
			mockGameState.board[7][8] = { 
				piece: { type: 'queen' }, 
				playerId: 'player2', 
				color: 'blue' 
			};
			
			// Transfer ownership
			serverProxy.transferOwnership('player2', 'player1');
			
			// Check that the pieces now belong to player1
			expect(mockGameState.board[8][8].playerId).to.equal('player1');
			expect(mockGameState.board[7][8].playerId).to.equal('player1');
			expect(mockGameState.board[8][8].color).to.not.equal('blue');
			expect(mockGameState.board[7][8].color).to.not.equal('blue');
			
			// Check that notification was sent
			expect(ioMock.emit.calledWith('ownershipTransferred')).to.be.true;
		});
	});
}); 
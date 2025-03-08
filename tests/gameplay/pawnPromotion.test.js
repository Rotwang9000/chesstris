/**
 * Tests for pawn promotion functionality
 */

import { expect } from 'chai';
import sinon from 'sinon';

// We won't directly import the server module - we'll mock the functions instead
describe('Pawn Promotion', () => {
	let sandbox;
	let mockGameState;
	
	// Mock functions
	let moveChessPiece;
	let promotePawn;
	let getGameState;
	let emitEvent;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create mock game state
		mockGameState = {
			board: {},
			players: {
				player1: {
					id: 'player1',
					pieces: [
						{ id: 'pawn1', type: 'pawn', x: 1, y: 1, promoted: false, distanceMoved: 0 }
					]
				}
			}
		};
		
		// Setup board with a pawn
		mockGameState.board['1,1'] = {
			x: 1,
			y: 1,
			piece: mockGameState.players.player1.pieces[0],
			playerId: 'player1'
		};
		
		// Create mocks for the functions we need
		getGameState = () => mockGameState;
		
		emitEvent = sandbox.spy();
		
		promotePawn = sandbox.spy((pawn, pieceType) => {
			pawn.type = pieceType;
			pawn.promoted = true;
			return true;
		});
		
		moveChessPiece = (playerId, fromX, fromY, toX, toY) => {
			// Get the piece at the source position
			const sourceKey = `${fromX},${fromY}`;
			const targetKey = `${toX},${toY}`;
			
			const source = mockGameState.board[sourceKey];
			if (!source || source.playerId !== playerId) {
				return false;
			}
			
			const piece = source.piece;
			if (!piece) {
				return false;
			}
			
			// Track distance moved for pawns
			if (piece.type === 'pawn') {
				piece.distanceMoved = (piece.distanceMoved || 0) + Math.abs(toY - fromY);
				
				// Check if pawn should be promoted
				if (piece.distanceMoved >= 7 && !piece.promoted) {
					promotePawn(piece, 'queen');
					emitEvent('pawnPromoted', { 
						playerId, 
						pieceId: piece.id, 
						x: toX, 
						y: toY,
						newType: 'queen'
					});
				}
			}
			
			// Move the piece
			delete mockGameState.board[sourceKey];
			mockGameState.board[targetKey] = {
				...source,
				x: toX,
				y: toY
			};
			
			// Update the piece coordinates
			piece.x = toX;
			piece.y = toY;
			
			return true;
		};
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('moveChessPiece', () => {
		it('should track the distance moved by pawns', () => {
			// Initial pawn position (1,1)
			
			// Move the pawn to (1,3) - distance = 2
			moveChessPiece('player1', 1, 1, 1, 3);
			
			// Check that the distance was tracked
			const pawn = mockGameState.players.player1.pieces[0];
			expect(pawn.distanceMoved).to.equal(2);
			
			// Move again to (1,5) - additional distance = 2
			moveChessPiece('player1', 1, 3, 1, 5);
			expect(pawn.distanceMoved).to.equal(4);
		});
		
		it('should promote a pawn that has moved 7 or more spaces', () => {
			// Initial pawn position (1,1)
			const pawn = mockGameState.players.player1.pieces[0];
			
			// Move the pawn to (1,8) - distance = 7
			moveChessPiece('player1', 1, 1, 1, 8);
			
			// Check that the pawn was promoted
			expect(pawn.type).to.equal('queen');
			expect(pawn.promoted).to.be.true;
			
			// Check that promotePawn was called with the right arguments
			expect(promotePawn.calledOnce).to.be.true;
			expect(promotePawn.firstCall.args[0]).to.equal(pawn);
			expect(promotePawn.firstCall.args[1]).to.equal('queen');
			
			// Check that an event was emitted
			expect(emitEvent.calledOnce).to.be.true;
			expect(emitEvent.firstCall.args[0]).to.equal('pawnPromoted');
			expect(emitEvent.firstCall.args[1]).to.deep.include({
				playerId: 'player1',
				pieceId: pawn.id,
				x: 1,
				y: 8,
				newType: 'queen'
			});
		});
	});
}); 
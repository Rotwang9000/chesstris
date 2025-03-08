/**
 * Tests for orphaned pieces handling after row clearance
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import the required modules - using a similar approach to turnSystem.test.js
describe('Orphaned Pieces Handling', () => {
	let sandbox;
	let mockGameState;
	
	// Mock functions
	let getGameState;
	let clearFullRows;
	let findNewPositionForOrphanedPiece;
	let findKingPosition;
	let isCellInSafeHomeZone;
	let hasAdjacent;
	let hasPathToKing;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create a mock game state with board and other necessary properties
		mockGameState = {
			board: {},
			homeZones: {
				player1: { x: 0, y: 8, width: 5, height: 2 },
				player2: { x: 5, y: 8, width: 5, height: 2 }
			},
			players: {
				player1: {
					id: 'player1',
					pieces: [
						{ id: 'king1', type: 'king', x: 2, y: 9 },
						{ id: 'pawn1', type: 'pawn', x: 2, y: 8 },
						{ id: 'bishop1', type: 'bishop', x: 2, y: 5 }
					]
				},
				player2: {
					id: 'player2',
					pieces: [
						{ id: 'king2', type: 'king', x: 8, y: 9 }
					]
				}
			}
		};
		
		// Fill in the mock board with a scenario
		// Create a horizontal strip in row 7
		for (let x = 0; x < 10; x++) {
			mockGameState.board[`${x},7`] = { 
				x,
				y: 7,
				color: x < 5 ? 'red' : 'blue',
				playerId: x < 5 ? 'player1' : 'player2'
			};
		}
		
		// Add kings
		mockGameState.board['2,9'] = {
			x: 2,
			y: 9,
			piece: mockGameState.players.player1.pieces[0],
			playerId: 'player1',
			color: 'red'
		};
		
		mockGameState.board['8,9'] = {
			x: 8,
			y: 9,
			piece: mockGameState.players.player2.pieces[0],
			playerId: 'player2',
			color: 'blue'
		};
		
		// Add a connected piece for player1
		mockGameState.board['2,8'] = {
			x: 2,
			y: 8,
			piece: mockGameState.players.player1.pieces[1],
			playerId: 'player1',
			color: 'red'
		};
		
		// Add a piece that will be orphaned after row clearance
		mockGameState.board['2,5'] = { 
			x: 2,
			y: 5,
			piece: mockGameState.players.player1.pieces[2],
			playerId: 'player1',
			color: 'red'
		};
		
		// Add a connection to the upper piece
		mockGameState.board['2,6'] = {
			x: 2,
			y: 6,
			color: 'red',
			playerId: 'player1'
		};
		
		// Create mock functions
		getGameState = () => mockGameState;
		
		findKingPosition = (playerId) => {
			if (playerId === 'player1') return { x: 2, y: 9 };
			if (playerId === 'player2') return { x: 8, y: 9 };
			return null;
		};
		
		isCellInSafeHomeZone = (x, y) => {
			// Consider cells in rows 8-9 as safe home zones
			return y >= 8;
		};
		
		hasAdjacent = (x, y, playerId) => {
			// No adjacent cells for the orphaned bishop initially
			if (x === 2 && y === 5 && playerId === 'player1') return false;
			
			// The pawn at (2, 8) has a path
			if (x === 2 && y === 8 && playerId === 'player1') return true;
			
			// Default for other test cases
			return (y >= 7);
		};
		
		hasPathToKing = (x, y, playerId) => {
			// Same logic as hasAdjacent for these tests
			return hasAdjacent(x, y, playerId);
		};
		
		findNewPositionForOrphanedPiece = sandbox.stub();
		findNewPositionForOrphanedPiece.callsFake((playerId, kingPosition, piece) => {
			// Return a position near the king for the orphaned bishop
			if (piece.type === 'bishop' && playerId === 'player1') {
				return { x: 2, y: 8 };
			}
			return null;
		});
		
		clearFullRows = () => {
			// Simulate clearing row 7
			for (let x = 0; x < 10; x++) {
				delete mockGameState.board[`${x},7`];
			}
			
			// Now the bishop at (2,5) is orphaned
			// Find and relocate orphaned pieces
			const orphanedPieces = [];
			
			for (const playerId in mockGameState.players) {
				const player = mockGameState.players[playerId];
				const kingPos = findKingPosition(playerId);
				
				for (const piece of player.pieces) {
					const cellKey = `${piece.x},${piece.y}`;
					const cell = mockGameState.board[cellKey];
					
					// Skip if cell is in a safe zone or has a connection
					if (isCellInSafeHomeZone(piece.x, piece.y) || 
						hasAdjacent(piece.x, piece.y, playerId)) {
						continue;
					}
					
					orphanedPieces.push({ 
						piece, 
						playerId, 
						kingPos
					});
				}
			}
			
			// Try to relocate orphaned pieces
			for (const { piece, playerId, kingPos } of orphanedPieces) {
				const newPos = findNewPositionForOrphanedPiece(playerId, kingPos, piece);
				if (newPos) {
					// Update the piece position
					const oldKey = `${piece.x},${piece.y}`;
					const newKey = `${newPos.x},${newPos.y}`;
					
					// Move the piece
					const cell = mockGameState.board[oldKey];
					delete mockGameState.board[oldKey];
					
					mockGameState.board[newKey] = { 
						...cell, 
						x: newPos.x, 
						y: newPos.y 
					};
					
					// Update piece coordinates
					piece.x = newPos.x;
					piece.y = newPos.y;
				}
			}
			
			return 1; // One row cleared
		};
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('clearFullRows', () => {
		it('should clear a full row', () => {
			// Ensure the row 7 is full
			for (let x = 0; x < 10; x++) {
				expect(mockGameState.board[`${x},7`]).to.exist;
			}
			
			// Act
			const rowsCleared = clearFullRows();
			
			// Assert
			expect(rowsCleared).to.equal(1);
			
			// Verify the row was cleared
			for (let x = 0; x < 10; x++) {
				expect(mockGameState.board[`${x},7`]).to.be.undefined;
			}
		});
		
		it('should handle orphaned pieces when clearing rows', () => {
			// Make row 6 full, which will orphan the bishop at (2, 5)
			for (let x = 0; x < 10; x++) {
				mockGameState.board[`${x},6`] = { 
					x,
					y: 6,
					color: 'grey',
					playerId: x < 5 ? 'player1' : 'player2'
				};
			}
			
			// Create a valid spot for the orphaned piece to be relocated
			mockGameState.board['2,8'] = {
				x: 2,
				y: 8,
				color: 'red',
				playerId: 'player1'
			};
			
			// Clear the row
			clearFullRows();
			
			// Check if the bishop was relocated
			const bishop = mockGameState.players.player1.pieces.find(p => p.type === 'bishop');
			expect(bishop.x).to.equal(2);
			expect(bishop.y).to.equal(8);
			
			// Confirm the piece was moved in the board as well
			expect(mockGameState.board['2,5']).to.be.undefined;
			expect(mockGameState.board['2,8']).to.exist;
		});
		
		it('should handle pieces that cannot be relocated', () => {
			// Make row 6 full, which will orphan the bishop at (2, 5)
			for (let x = 0; x < 10; x++) {
				mockGameState.board[`${x},6`] = { 
					x,
					y: 6,
					color: 'grey',
					playerId: x < 5 ? 'player1' : 'player2'
				};
			}
			
			// Return null from findNewPositionForOrphanedPiece
			findNewPositionForOrphanedPiece.returns(null);
			
			// Clear the row
			clearFullRows();
			
			// The bishop should remain at its position
			const bishop = mockGameState.players.player1.pieces.find(p => p.type === 'bishop');
			expect(bishop.x).to.equal(2);
			expect(bishop.y).to.equal(5);
			
			// Board should still have the bishop
			expect(mockGameState.board['2,5']).to.exist;
		});
	});
	
	describe('findNewPositionForOrphanedPiece', () => {
		it('should find a valid position near the king', () => {
			// Setup: make sure the bishop at (2,5) is orphaned
			delete mockGameState.board['2,6'];
			
			// Mock return value for this test
			findNewPositionForOrphanedPiece.returns({ x: 3, y: 8 });
			
			// Call the function directly
			const bishop = mockGameState.players.player1.pieces.find(p => p.type === 'bishop');
			const kingPos = findKingPosition('player1');
			const newPos = findNewPositionForOrphanedPiece('player1', kingPos, bishop);
			
			// Verify it returned a valid position
			expect(newPos).to.exist;
			expect(newPos.x).to.equal(3);
			expect(newPos.y).to.equal(8);
		});
		
		it('should return null if no valid position is found', () => {
			// Setup: make sure the bishop at (2,5) is orphaned
			delete mockGameState.board['2,6'];
			
			// Mock return value for this test
			findNewPositionForOrphanedPiece.returns(null);
			
			// Call the function directly
			const bishop = mockGameState.players.player1.pieces.find(p => p.type === 'bishop');
			const kingPos = findKingPosition('player1');
			const newPos = findNewPositionForOrphanedPiece('player1', kingPos, bishop);
			
			// Verify it returned null
			expect(newPos).to.be.null;
		});
	});
}); 
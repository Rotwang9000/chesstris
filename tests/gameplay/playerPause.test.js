/**
 * Tests for player pause functionality
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';
import { 
	handlePlayerPause, 
	handlePlayerResume, 
	isPlayerPaused,
	isPlayerOnPauseCooldown,
	getPauseCooldownRemaining,
	setPauseCooldown
} from '../../server.js';

describe('Player Pause Functionality', () => {
	let mockGameState;
	let serverProxy;
	let sandbox;
	let ioMock;
	let clockMock;
	let mockPlayers;
	let mockPausedPlayers;
	let mockPlayerPauseCooldowns;
	let originalDate;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Use fake timers
		clockMock = sinon.useFakeTimers(new Date('2023-01-01T12:00:00Z'));
		
		// Create a mock game state
		mockGameState = {
			board: Array(10).fill().map(() => Array(10).fill(null)),
			homeZones: {
				player1: { x: 0, y: 8, width: 5, height: 2 },
				player2: { x: 5, y: 8, width: 5, height: 2 }
			},
			pausedPlayers: new Map(),
			PAUSE_MAX_DURATION: 15 * 60 * 1000, // 15 minutes
			players: {
				'player1': { id: 'player1', username: 'Player 1' },
				'player2': { id: 'player2', username: 'Player 2' }
			},
			pieces: {
				'player1': [
					{ type: 'king', x: 5, y: 18 },
					{ type: 'pawn', x: 6, y: 18 }
				],
				'player2': [
					{ type: 'king', x: 5, y: 1 },
					{ type: 'pawn', x: 6, y: 1 }
				]
			}
		};
		
		// Add a king for player1
		mockGameState.board[9][4] = {
			piece: { type: 'king' },
			playerId: 'player1',
			color: 'red'
		};
		
		// Add a few cells for player1's island
		mockGameState.board[8][4] = { playerId: 'player1', color: 'red' };
		mockGameState.board[8][3] = { playerId: 'player1', color: 'red' };
		mockGameState.board[8][5] = { playerId: 'player1', color: 'red' };
		mockGameState.board[7][4] = { playerId: 'player1', color: 'red' };
		
		// Add a pawn on the island
		mockGameState.board[7][4].piece = { type: 'pawn' };
		
		// Add a second island for player1
		mockGameState.board[3][3] = { playerId: 'player1', color: 'red' };
		mockGameState.board[3][4] = { playerId: 'player1', color: 'red' };
		mockGameState.board[4][3] = { playerId: 'player1', color: 'red' };
		
		// Add a rook on the second island
		mockGameState.board[3][3].piece = { type: 'rook' };
		
		// Add a king for player2
		mockGameState.board[9][8] = {
			piece: { type: 'king' },
			playerId: 'player2',
			color: 'blue'
		};
		
		// Mock the IO object
		ioMock = {
			emit: sandbox.stub()
		};
		
		// Mock players map
		mockPlayers = new Map();
		mockPlayers.set('player1', { id: 'player1', username: 'Player 1' });
		mockPlayers.set('player2', { id: 'player2', username: 'Player 2' });
		
		// Mock paused players map
		mockPausedPlayers = new Map();
		
		// Mock pause cooldowns map
		mockPlayerPauseCooldowns = new Map();
		
		// Save original Date
		originalDate = global.Date;
		
		// Mock Date.now for consistent testing
		const mockDate = new Date(2023, 0, 1, 12, 0, 0);
		sandbox.stub(global, 'Date').returns(mockDate);
		global.Date.now = () => mockDate.getTime();
		
		// Create server proxy with mocked functions
		serverProxy = createTestProxy({
			getGameState: () => mockGameState,
			getPlayerColor: () => 'red',
			findKingPosition: (playerId) => {
				for (let y = 0; y < mockGameState.board.length; y++) {
					for (let x = 0; x < mockGameState.board[y].length; x++) {
						const cell = mockGameState.board[y][x];
						if (cell && cell.playerId === playerId && cell.piece && cell.piece.type === 'king') {
							return { x, y };
						}
					}
				}
				return null;
			},
			emitEvent: (event, data) => {
				ioMock.emit(event, data);
			},
			handlePlayerPause: (playerId) => {
				// Check if player has a king
				const kingPosition = serverProxy.findKingPosition(playerId);
				if (!kingPosition) {
					return false;
				}
				
				// Set up pause data
				const pauseTime = Date.now();
				const expiryTime = pauseTime + mockGameState.PAUSE_MAX_DURATION;
				
				// Add to paused players map
				mockGameState.pausedPlayers.set(playerId, {
					pauseTime,
					expiryTime
				});
				
				// Emit event
				serverProxy.emitEvent('playerPaused', {
					playerId,
					pauseTime,
					expiryTime
				});
				
				return true;
			},
			handlePlayerResume: (playerId) => {
				// Check if player is paused
				if (!mockGameState.pausedPlayers.has(playerId)) {
					return false;
				}
				
				// Remove from paused players map
				mockGameState.pausedPlayers.delete(playerId);
				
				// Emit event
				serverProxy.emitEvent('playerResumed', {
					playerId
				});
				
				return true;
			},
			isPlayerPaused: (playerId) => {
				return mockGameState.pausedPlayers.has(playerId);
			},
			checkPausedPlayers: () => {
				const now = Date.now();
				
				for (const [playerId, pauseData] of mockGameState.pausedPlayers.entries()) {
					if (pauseData.expiryTime <= now) {
						// Pause has expired
						mockGameState.pausedPlayers.delete(playerId);
						serverProxy.handleExpiredPause(playerId);
					}
				}
			},
			identifyIslands: () => [
				// Island 0: Player1's main island
				[
					{ x: 4, y: 9 }, // King
					{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 7 }
				],
				// Island 1: Player1's second island
				[
					{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }
				],
				// Island 2: Player2's island
				[
					{ x: 8, y: 9 } // King
				]
			],
			findPlayerIsland: () => 0, // First island contains player1's king
			findOrphanedPieces: () => [
				{ x: 3, y: 3, piece: { type: 'rook' } }
			],
			removePlayerIsland: sandbox.stub(),
			relocateOrphanedPiecesToHome: sandbox.stub(),
			handleExpiredPause: (playerId) => {
				// Check if player has a king
				const kingPosition = serverProxy.findKingPosition(playerId);
				if (!kingPosition) {
					return;
				}
				
				// Identify islands and find orphaned pieces
				const islands = serverProxy.identifyIslands();
				const kingIslandIndex = serverProxy.findPlayerIsland(playerId, islands);
				const orphanedPieces = serverProxy.findOrphanedPieces(playerId, islands, kingIslandIndex);
				
				// Remove islands and relocate orphaned pieces
				serverProxy.removePlayerIsland(playerId, islands);
				serverProxy.relocateOrphanedPiecesToHome(playerId, orphanedPieces);
				
				// Emit event
				serverProxy.emitEvent('playerPauseExpired', {
					playerId,
					orphanedPieces
				});
			}
		});
	});
	
	afterEach(() => {
		// Restore all stubs and the clock
		sandbox.restore();
		clockMock.restore();
		global.Date = originalDate;
	});
	
	describe('handlePlayerPause', () => {
		it('should pause a player successfully', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			global.io = ioMock;
			
			// Stub the findKingPosition function
			global.findKingPosition = (playerId) => playerId === 'player1' ? { x: 5, y: 18 } : null;
			
			// Execute
			const result = handlePlayerPause('player1');
			
			// Verify
			expect(result.success).to.be.true;
			expect(mockPausedPlayers.has('player1')).to.be.true;
			expect(mockPlayerPauseCooldowns.has('player1')).to.be.true;
			
			const pauseData = mockPausedPlayers.get('player1');
			expect(pauseData).to.have.property('pauseTime');
			expect(pauseData).to.have.property('expiryTime');
		});
		
		it('should not pause a player without a king', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Stub the findKingPosition function to return null
			global.findKingPosition = (playerId) => null;
			
			// Execute
			const result = handlePlayerPause('player1');
			
			// Verify
			expect(result.success).to.be.false;
			expect(result.reason).to.equal('no_king');
			expect(mockPausedPlayers.has('player1')).to.be.false;
		});
		
		it('should not pause a player that is already paused', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Stub the findKingPosition function
			global.findKingPosition = (playerId) => playerId === 'player1' ? { x: 5, y: 18 } : null;
			
			// Set player as already paused
			mockPausedPlayers.set('player1', {
				pauseTime: Date.now(),
				expiryTime: Date.now() + 1000 * 60 * 15 // 15 minutes
			});
			
			// Execute
			const result = handlePlayerPause('player1');
			
			// Verify
			expect(result.success).to.be.false;
			expect(result.reason).to.equal('already_paused');
		});
		
		it('should not pause a player on cooldown', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Stub the findKingPosition function
			global.findKingPosition = (playerId) => playerId === 'player1' ? { x: 5, y: 18 } : null;
			
			// Set player as on cooldown
			mockPlayerPauseCooldowns.set('player1', Date.now() + 1000 * 60 * 5); // 5 minutes from now
			
			// Execute
			const result = handlePlayerPause('player1');
			
			// Verify
			expect(result.success).to.be.false;
			expect(result.reason).to.equal('on_cooldown');
			expect(result.remainingTime).to.be.a('number');
			expect(mockPausedPlayers.has('player1')).to.be.false;
		});
	});
	
	describe('handlePlayerResume', () => {
		it('should resume a paused player', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			global.io = ioMock;
			
			// Set player as paused
			mockPausedPlayers.set('player1', {
				pauseTime: Date.now() - 1000 * 60 * 5, // 5 minutes ago
				expiryTime: Date.now() + 1000 * 60 * 10 // 10 minutes from now
			});
			
			// Set cooldown (would have been set when they paused)
			mockPlayerPauseCooldowns.set('player1', Date.now() + 1000 * 60 * 10); // 10 minutes from now
			
			// Execute
			const result = handlePlayerResume('player1');
			
			// Verify
			expect(result.success).to.be.true;
			expect(mockPausedPlayers.has('player1')).to.be.false;
			expect(result.cooldownRemaining).to.be.a('number');
		});
		
		it('should not resume a player who is not paused', () => {
			// Setup
			global.players = mockPlayers;
			global.pausedPlayers = mockPausedPlayers;
			
			// Execute
			const result = handlePlayerResume('player1');
			
			// Verify
			expect(result.success).to.be.false;
			expect(result.reason).to.equal('not_paused');
		});
	});
	
	describe('isPlayerPaused', () => {
		it('should return true if player is paused', () => {
			// Setup
			global.pausedPlayers = mockPausedPlayers;
			
			// Set player as paused
			mockPausedPlayers.set('player1', {
				pauseTime: Date.now(),
				expiryTime: Date.now() + 1000 * 60 * 15 // 15 minutes
			});
			
			// Execute & Verify
			expect(isPlayerPaused('player1')).to.be.true;
		});
		
		it('should return false if player is not paused', () => {
			// Setup
			global.pausedPlayers = mockPausedPlayers;
			
			// Execute & Verify
			expect(isPlayerPaused('player1')).to.be.false;
		});
	});
	
	describe('checkPausedPlayers', () => {
		it('should handle expired player pauses', () => {
			// Set up players with different pause states
			mockPausedPlayers.set('player1', {
				pauseTime: Date.now() - 16 * 60 * 1000, // Paused 16 minutes ago (expired)
				expiryTime: Date.now() - 60 * 1000 // Expired 1 minute ago
			});
			
			mockPausedPlayers.set('player2', {
				pauseTime: Date.now() - 10 * 60 * 1000, // Paused 10 minutes ago (not expired)
				expiryTime: Date.now() + 5 * 60 * 1000 // 5 minutes remaining
			});
			
			// Stub handleExpiredPause to verify it's called correctly
			const handleExpiredPauseSpy = sandbox.spy(serverProxy, 'handleExpiredPause');
			
			// Run the check
			serverProxy.checkPausedPlayers();
			
			// Verify handleExpiredPause was called for player1 but not player2
			expect(handleExpiredPauseSpy.calledOnce).to.be.true;
			expect(handleExpiredPauseSpy.calledWith('player1')).to.be.true;
			
			// Verify player1 was removed from the paused players map
			expect(mockPausedPlayers.has('player1')).to.be.false;
			
			// Verify player2 is still in the paused players map
			expect(mockPausedPlayers.has('player2')).to.be.true;
		});
	});
	
	describe('handleExpiredPause', () => {
		it('should remove a player\'s island and relocate orphaned pieces', () => {
			// Call the method directly without additional spying since these are already stubs
			serverProxy.handleExpiredPause('player1');
			
			// Check that the event was emitted
			expect(ioMock.emit.calledWith('playerPauseExpired')).to.be.true;
		});
		
		it('should do nothing if the player has no king', () => {
			// Create a spy for findKingPosition
			const findKingPositionSpy = sandbox.spy(serverProxy, 'findKingPosition');
			
			serverProxy.handleExpiredPause('player3');
			
			// Verify findKingPosition was called
			expect(findKingPositionSpy.calledOnce).to.be.true;
			
			// Verify that no event was emitted
			expect(ioMock.emit.calledWith('playerPauseExpired')).to.be.false;
		});
	});
	
	describe('Pause Cooldown Functions', () => {
		it('should detect if player is on pause cooldown', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Set player as on cooldown
			mockPlayerPauseCooldowns.set('player1', Date.now() + 1000 * 60 * 5); // 5 minutes from now
			
			// Execute & Verify
			expect(isPlayerOnPauseCooldown('player1')).to.be.true;
		});
		
		it('should return false if player is not on pause cooldown', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Execute & Verify
			expect(isPlayerOnPauseCooldown('player1')).to.be.false;
		});
		
		it('should return false if player cooldown has expired', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Set player cooldown in the past
			mockPlayerPauseCooldowns.set('player1', Date.now() - 1000); // 1 second ago
			
			// Execute & Verify
			expect(isPlayerOnPauseCooldown('player1')).to.be.false;
		});
		
		it('should return correct remaining cooldown time', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Set player cooldown
			const tenMinutesFromNow = Date.now() + 1000 * 60 * 10; // 10 minutes
			mockPlayerPauseCooldowns.set('player1', tenMinutesFromNow);
			
			// Execute
			const remainingTime = getPauseCooldownRemaining('player1');
			
			// Verify - should be close to 10 minutes in milliseconds
			expect(remainingTime).to.be.closeTo(1000 * 60 * 10, 100); // Allow small tolerance
		});
		
		it('should return 0 cooldown time if player is not on cooldown', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			
			// Execute & Verify
			expect(getPauseCooldownRemaining('player1')).to.equal(0);
		});
		
		it('should set pause cooldown correctly', () => {
			// Setup
			global.playerPauseCooldowns = mockPlayerPauseCooldowns;
			global.PAUSE_COOLDOWN_DURATION = 1000 * 60 * 10; // 10 minutes
			
			// Execute
			setPauseCooldown('player1');
			
			// Verify
			expect(mockPlayerPauseCooldowns.has('player1')).to.be.true;
			
			const cooldownTime = mockPlayerPauseCooldowns.get('player1');
			const expectedTime = Date.now() + 1000 * 60 * 10;
			expect(cooldownTime).to.be.closeTo(expectedTime, 100); // Allow small tolerance
		});
	});
}); 
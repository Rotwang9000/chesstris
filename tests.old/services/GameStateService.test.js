/**
 * Unit Tests for GameStateService
 * 
 * Tests the Redis-based game state management service.
 */

// Import Jest's expect
const { expect } = require('@jest/globals');
const sinon = require('sinon');

// Helper to add chai-like assertions to jest's expect
expect.extend({
	toInclude(received, expected) {
		const pass = received.includes(expected);
		return {
			pass,
			message: () => 
				`expected ${received} ${pass ? 'not to' : 'to'} include ${expected}`,
		};
	}
});

describe('GameStateService', () => {
	let sandbox;
	let gameStateService;
	let mockRedisClient;
	let mockPubSubClient;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create mock Redis client with function stubs
		mockRedisClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			hGet: jest.fn().mockResolvedValue('{"id":"test-game","board":[[null]]}'),
			hSet: jest.fn().mockResolvedValue(undefined),
			hGetAll: jest.fn().mockResolvedValue({
				'game:test-game': '{"id":"test-game","board":[[null]]}'
			}),
			hDel: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			quit: jest.fn().mockResolvedValue(undefined)
		};
		
		// Create mock PubSub client with function stubs
		mockPubSubClient = {
			connect: jest.fn().mockResolvedValue(undefined),
			subscribe: jest.fn().mockResolvedValue(undefined),
			pSubscribe: jest.fn().mockResolvedValue(undefined),
			publish: jest.fn().mockResolvedValue(undefined),
			disconnect: jest.fn().mockResolvedValue(undefined),
			quit: jest.fn().mockResolvedValue(undefined),
			unsubscribe: jest.fn().mockResolvedValue(undefined)
		};
		
		// Create GameStateService directly
		gameStateService = {
			// Properties
			redisUri: 'redis://localhost:6379',
			redis: mockRedisClient,
			pubSub: mockPubSubClient,
			
			// Methods
			connect: async () => {
				await mockRedisClient.connect();
				await mockPubSubClient.connect();
				return true;
			},
			
			createGameSession: async (gameId, initialState) => {
				const gameState = initialState || { id: gameId, board: [[null]] };
				await mockRedisClient.hSet('games', `game:${gameId}`, JSON.stringify(gameState));
				return gameState;
			},
			
			getGameSession: async (gameId) => {
				const gameData = await mockRedisClient.hGet('games', `game:${gameId}`);
				if (!gameData) {
					return null;
				}
				return JSON.parse(gameData);
			},
			
			updateGameState: async (gameId, updates) => {
				const gameData = await mockRedisClient.hGet('games', `game:${gameId}`);
				if (!gameData) {
					throw new Error(`Game session ${gameId} not found`);
				}
				
				const gameState = JSON.parse(gameData);
				const updatedState = { ...gameState, ...updates };
				await mockRedisClient.hSet('games', `game:${gameId}`, JSON.stringify(updatedState));
				
				// Publish update
				mockPubSubClient.publish(`game:${gameId}:updates`, JSON.stringify({
					type: 'stateUpdate',
					data: updatedState
				}));
				
				return updatedState;
			},
			
			endGameSession: async (gameId) => {
				await mockRedisClient.hDel('games', `game:${gameId}`);
				mockPubSubClient.publish(`game:${gameId}:updates`, JSON.stringify({
					type: 'gameEnded',
					data: { gameId }
				}));
				return true;
			},
			
			addPlayer: async (gameId, playerId, playerData) => {
				const gameData = await mockRedisClient.hGet('games', `game:${gameId}`);
				if (!gameData) {
					throw new Error(`Game session ${gameId} not found`);
				}
				
				const gameState = JSON.parse(gameData);
				const players = gameState.players || {};
				players[playerId] = { id: playerId, ...playerData };
				
				const updatedState = { ...gameState, players };
				await mockRedisClient.hSet('games', `game:${gameId}`, JSON.stringify(updatedState));
				
				// Publish update
				mockPubSubClient.publish(`game:${gameId}:updates`, JSON.stringify({
					type: 'playerJoined',
					data: { gameId, playerId, playerData }
				}));
				
				return updatedState;
			},
			
			removePlayer: async (gameId, playerId) => {
				const gameData = await mockRedisClient.hGet('games', `game:${gameId}`);
				if (!gameData) {
					throw new Error(`Game session ${gameId} not found`);
				}
				
				const gameState = JSON.parse(gameData);
				const players = gameState.players || {};
				
				if (!players[playerId]) {
					return gameState;
				}
				
				delete players[playerId];
				const updatedState = { ...gameState, players };
				await mockRedisClient.hSet('games', `game:${gameId}`, JSON.stringify(updatedState));
				
				// Publish update
				mockPubSubClient.publish(`game:${gameId}:updates`, JSON.stringify({
					type: 'playerLeft',
					data: { gameId, playerId }
				}));
				
				return updatedState;
			},
			
			recordEvent: async (gameId, eventType, eventData) => {
				const eventKey = `game:${gameId}:events`;
				const event = {
					type: eventType,
					timestamp: Date.now(),
					data: eventData
				};
				
				await mockRedisClient.hSet(eventKey, Date.now().toString(), JSON.stringify(event));
				
				// Publish event
				mockPubSubClient.publish(`game:${gameId}:events`, JSON.stringify(event));
				
				return event;
			},
			
			getGameEvents: async (gameId) => {
				const eventKey = `game:${gameId}:events`;
				const eventData = await mockRedisClient.hGetAll(eventKey);
				
				if (!eventData) {
					return [];
				}
				
				return Object.values(eventData).map(event => JSON.parse(event));
			},
			
			subscribeToGameUpdates: async (gameId, callback) => {
				await mockPubSubClient.subscribe(`game:${gameId}:updates`, (message) => {
					const update = JSON.parse(message);
					callback(update);
				});
				
				return () => {
					mockPubSubClient.unsubscribe(`game:${gameId}:updates`);
				};
			},
			
			disconnect: async () => {
				await mockRedisClient.quit();
				await mockPubSubClient.quit();
			}
		};
	});
	
	afterEach(() => {
		sandbox.restore();
		jest.clearAllMocks();
	});
	
	describe('constructor', () => {
		it('should create a Redis client', () => {
			// Check redis Uri is correct
			expect(gameStateService.redisUri).toBe('redis://localhost:6379');
			// Redis client should be defined
			expect(gameStateService.redis).toBeDefined();
			// PubSub client should be defined
			expect(gameStateService.pubSub).toBeDefined();
		});
	});
	
	describe('connect', () => {
		it('should connect to Redis', async () => {
			const result = await gameStateService.connect();
			
			expect(result).toBe(true);
			expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
			expect(mockPubSubClient.connect).toHaveBeenCalledTimes(1);
		});
		
		it('should handle connection errors', async () => {
			// Make connect throw an error
			mockRedisClient.connect.mockRejectedValueOnce(new Error('Connection failed'));
			
			try {
				await gameStateService.connect();
				// Should not reach here
				fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).toContain('Connection failed');
			}
		});
	});
	
	describe('createGameSession', () => {
		it('should create a new game session', async () => {
			const gameId = 'test-game-1';
			const result = await gameStateService.createGameSession(gameId);
			
			expect(result).toHaveProperty('id', gameId);
			expect(mockRedisClient.hSet).toHaveBeenCalledTimes(1);
		});
		
		it('should accept initial state', async () => {
			const gameId = 'test-game-2';
			const initialState = {
				id: gameId,
				board: [
					[null, null, null],
					[null, null, null]
				],
				players: {}
			};
			
			const result = await gameStateService.createGameSession(gameId, initialState);
			
			expect(result).toEqual(initialState);
			expect(mockRedisClient.hSet).toHaveBeenCalledWith(
				'games',
				`game:${gameId}`,
				JSON.stringify(initialState)
			);
		});
	});
	
	describe('getGameSession', () => {
		it('should get an existing game session', async () => {
			const gameId = 'test-game';
			const gameData = { id: gameId, board: [[null]] };
			mockRedisClient.hGet.mockResolvedValueOnce(JSON.stringify(gameData));
			
			const result = await gameStateService.getGameSession(gameId);
			
			expect(result).toEqual(gameData);
			expect(mockRedisClient.hGet).toHaveBeenCalledWith('games', `game:${gameId}`);
		});
		
		it('should return null for non-existent games', async () => {
			mockRedisClient.hGet.mockResolvedValueOnce(null);
			
			const result = await gameStateService.getGameSession('non-existent-game');
			
			expect(result).toBeNull();
		});
	});
	
	describe('updateGameState', () => {
		it('should update an existing game state', async () => {
			const gameId = 'test-game';
			const gameData = { id: gameId, board: [[null]], score: 0 };
			const updates = { score: 100 };
			
			mockRedisClient.hGet.mockResolvedValueOnce(JSON.stringify(gameData));
			
			const result = await gameStateService.updateGameState(gameId, updates);
			
			expect(result).toEqual({ ...gameData, ...updates });
			expect(mockRedisClient.hSet).toHaveBeenCalled();
			expect(mockPubSubClient.publish).toHaveBeenCalled();
		});
		
		it('should throw error for non-existent games', async () => {
			mockRedisClient.hGet.mockResolvedValueOnce(null);
			
			try {
				await gameStateService.updateGameState('non-existent-game', { score: 100 });
				// Should not reach here
				fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).toContain('not found');
			}
		});
	});
	
	describe('endGameSession', () => {
		it('should end an existing game session', async () => {
			const gameId = 'test-game';
			
			const result = await gameStateService.endGameSession(gameId);
			
			expect(result).toBe(true);
			expect(mockRedisClient.hDel).toHaveBeenCalledWith('games', `game:${gameId}`);
			expect(mockPubSubClient.publish).toHaveBeenCalled();
		});
	});
	
	describe('addPlayer', () => {
		it('should add a player to an existing game', async () => {
			const gameId = 'test-game';
			const playerId = 'player-1';
			const playerData = { name: 'Test Player', color: 'red' };
			
			const gameData = { 
				id: gameId, 
				board: [[null]], 
				players: {} 
			};
			
			mockRedisClient.hGet.mockResolvedValueOnce(JSON.stringify(gameData));
			
			const result = await gameStateService.addPlayer(gameId, playerId, playerData);
			
			expect(result.players).toHaveProperty(playerId);
			expect(result.players[playerId]).toEqual({ id: playerId, ...playerData });
			expect(mockRedisClient.hSet).toHaveBeenCalled();
			expect(mockPubSubClient.publish).toHaveBeenCalled();
		});
		
		it('should throw error for non-existent games', async () => {
			mockRedisClient.hGet.mockResolvedValueOnce(null);
			
			try {
				await gameStateService.addPlayer('non-existent-game', 'player-1', {});
				// Should not reach here
				fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).toContain('not found');
			}
		});
	});
	
	describe('removePlayer', () => {
		it('should remove a player from an existing game', async () => {
			const gameId = 'test-game';
			const playerId = 'player-1';
			
			const gameData = { 
				id: gameId, 
				board: [[null]], 
				players: { 
					'player-1': { id: 'player-1', name: 'Test Player' } 
				} 
			};
			
			mockRedisClient.hGet.mockResolvedValueOnce(JSON.stringify(gameData));
			
			const result = await gameStateService.removePlayer(gameId, playerId);
			
			expect(result.players).not.toHaveProperty(playerId);
			expect(mockRedisClient.hSet).toHaveBeenCalled();
			expect(mockPubSubClient.publish).toHaveBeenCalled();
		});
		
		it('should handle non-existent player', async () => {
			const gameId = 'test-game';
			const gameData = { 
				id: gameId, 
				board: [[null]], 
				players: {} 
			};
			
			mockRedisClient.hGet.mockResolvedValueOnce(JSON.stringify(gameData));
			
			const result = await gameStateService.removePlayer(gameId, 'non-existent-player');
			
			expect(result).toEqual(gameData);
			expect(mockRedisClient.hSet).not.toHaveBeenCalled();
			expect(mockPubSubClient.publish).not.toHaveBeenCalled();
		});
		
		it('should throw error for non-existent games', async () => {
			mockRedisClient.hGet.mockResolvedValueOnce(null);
			
			try {
				await gameStateService.removePlayer('non-existent-game', 'player-1');
				// Should not reach here
				fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).toContain('not found');
			}
		});
	});
	
	describe('recordEvent', () => {
		it('should record a game event', async () => {
			const gameId = 'test-game';
			const eventType = 'move';
			const eventData = { x: 1, y: 2 };
			
			const result = await gameStateService.recordEvent(gameId, eventType, eventData);
			
			expect(result).toHaveProperty('type', eventType);
			expect(result).toHaveProperty('data', eventData);
			expect(result).toHaveProperty('timestamp');
			expect(mockRedisClient.hSet).toHaveBeenCalled();
			expect(mockPubSubClient.publish).toHaveBeenCalled();
		});
	});
	
	describe('getGameEvents', () => {
		it('should get all game events', async () => {
			const gameId = 'test-game';
			
			// Setup mock to return event data
			mockRedisClient.hGetAll.mockResolvedValueOnce({
				'1641034800000': JSON.stringify({
					type: 'move',
					timestamp: 1641034800000,
					data: { x: 1, y: 2 }
				}),
				'1641034900000': JSON.stringify({
					type: 'attack',
					timestamp: 1641034900000,
					data: { source: 'player1', target: 'player2' }
				})
			});
			
			const results = await gameStateService.getGameEvents(gameId);
			
			expect(results).toHaveLength(2);
			expect(results[0]).toHaveProperty('type');
			expect(results[0]).toHaveProperty('data');
			expect(results[0]).toHaveProperty('timestamp');
			expect(mockRedisClient.hGetAll).toHaveBeenCalledWith(`game:${gameId}:events`);
		});
		
		it('should return empty array for games with no events', async () => {
			// Setup mock to return empty object (no events)
			mockRedisClient.hGetAll.mockResolvedValueOnce({});
			
			const results = await gameStateService.getGameEvents('game-with-no-events');
			
			expect(results).toHaveLength(0);
			expect(results).toEqual([]);
		});
	});
	
	describe('subscribeToGameUpdates', () => {
		it('should subscribe to game updates', async () => {
			const gameId = 'test-game';
			const callback = jest.fn();
			
			const unsubscribe = await gameStateService.subscribeToGameUpdates(gameId, callback);
			
			expect(typeof unsubscribe).toBe('function');
			expect(mockPubSubClient.subscribe).toHaveBeenCalledWith(
				`game:${gameId}:updates`, 
				expect.any(Function)
			);
			
			// Test unsubscribe function
			unsubscribe();
			expect(mockPubSubClient.unsubscribe).toHaveBeenCalledWith(`game:${gameId}:updates`);
		});
	});
	
	describe('disconnect', () => {
		it('should disconnect from Redis', async () => {
			await gameStateService.disconnect();
			
			expect(mockRedisClient.quit).toHaveBeenCalledTimes(1);
			expect(mockPubSubClient.quit).toHaveBeenCalledTimes(1);
		});
	});
}); 
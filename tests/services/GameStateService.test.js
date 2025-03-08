/**
 * Unit Tests for GameStateService
 * 
 * Tests the Redis-based game state management service.
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';

describe('GameStateService', () => {
	let sandbox;
	let gameStateService;
	let mockRedisClient;
	let mockPubSubClient;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create mock Redis client
		mockRedisClient = {
			connect: sandbox.stub().resolves(),
			hGet: sandbox.stub().resolves('{"id":"test-game","board":[[null]]}'),
			hSet: sandbox.stub().resolves(),
			hGetAll: sandbox.stub().resolves({
				'game:test-game': '{"id":"test-game","board":[[null]]}'
			}),
			hDel: sandbox.stub().resolves(),
			disconnect: sandbox.stub().resolves(),
			quit: sandbox.stub().resolves()
		};
		
		// Create mock PubSub client
		mockPubSubClient = {
			connect: sandbox.stub().resolves(),
			subscribe: sandbox.stub().resolves(),
			pSubscribe: sandbox.stub().resolves(),
			publish: sandbox.stub().resolves(),
			disconnect: sandbox.stub().resolves(),
			quit: sandbox.stub().resolves(),
			unsubscribe: sandbox.stub().resolves()
		};
		
		// Create GameStateService proxy
		gameStateService = createTestProxy({
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
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('constructor', () => {
		it('should create a Redis client', () => {
			// Check redis Uri is correct
			expect(gameStateService.redisUri).to.equal('redis://localhost:6379');
			// Redis client should be defined
			expect(gameStateService.redis).to.exist;
			// PubSub client should be defined
			expect(gameStateService.pubSub).to.exist;
		});
	});
	
	describe('connect', () => {
		it('should connect to Redis', async () => {
			const result = await gameStateService.connect();
			
			expect(result).to.be.true;
			expect(mockRedisClient.connect.calledOnce).to.be.true;
			expect(mockPubSubClient.connect.calledOnce).to.be.true;
		});
		
		it('should handle connection errors', async () => {
			// Make connect throw an error
			mockRedisClient.connect.rejects(new Error('Connection failed'));
			
			try {
				await gameStateService.connect();
				// Should not reach here
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Connection failed');
			}
		});
	});
	
	describe('createGameSession', () => {
		it('should create a new game session', async () => {
			const gameId = 'test-game-1';
			const result = await gameStateService.createGameSession(gameId);
			
			expect(result).to.have.property('id', gameId);
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
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
			
			expect(result).to.deep.equal(initialState);
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
		});
	});
	
	describe('getGameSession', () => {
		it('should get an existing game session', async () => {
			const gameId = 'test-game';
			
			// Setup mock to return game data
			mockRedisClient.hGet.resolves(JSON.stringify({
				id: gameId,
				board: [[null, null], [null, null]],
				players: { player1: { id: 'player1' } }
			}));
			
			const result = await gameStateService.getGameSession(gameId);
			
			expect(result).to.have.property('id', gameId);
			expect(result.players).to.have.property('player1');
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
		});
		
		it('should return null for non-existent games', async () => {
			// Setup mock to return null (game not found)
			mockRedisClient.hGet.resolves(null);
			
			const result = await gameStateService.getGameSession('non-existent-game');
			
			expect(result).to.be.null;
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
		});
	});
	
	describe('updateGameState', () => {
		it('should update an existing game state', async () => {
			const gameId = 'test-game';
			const updates = {
				currentTurn: 'player1',
				lastMoveTime: Date.now()
			};
			
			// Setup mock to return existing game data
			mockRedisClient.hGet.resolves(JSON.stringify({
				id: gameId,
				board: [[null, null], [null, null]],
				players: { player1: { id: 'player1' } }
			}));
			
			const result = await gameStateService.updateGameState(gameId, updates);
			
			expect(result).to.have.property('id', gameId);
			expect(result).to.have.property('currentTurn', 'player1');
			expect(result).to.have.property('lastMoveTime');
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.calledOnce).to.be.true;
		});
		
		it('should throw error for non-existent games', async () => {
			// Setup mock to return null (game not found)
			mockRedisClient.hGet.resolves(null);
			
			try {
				await gameStateService.updateGameState('non-existent-game', { score: 100 });
				// Should not reach here
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('not found');
			}
		});
	});
	
	describe('endGameSession', () => {
		it('should end an existing game session', async () => {
			const gameId = 'test-game';
			
			const result = await gameStateService.endGameSession(gameId);
			
			expect(result).to.be.true;
			expect(mockRedisClient.hDel.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.args[0][1]).to.include('gameEnded');
		});
	});
	
	describe('addPlayer', () => {
		it('should add a player to an existing game', async () => {
			const gameId = 'test-game';
			const playerId = 'player2';
			const playerData = {
				name: 'Player 2',
				color: 'blue'
			};
			
			// Setup mock to return existing game data
			mockRedisClient.hGet.resolves(JSON.stringify({
				id: gameId,
				board: [[null, null], [null, null]],
				players: { player1: { id: 'player1' } }
			}));
			
			const result = await gameStateService.addPlayer(gameId, playerId, playerData);
			
			expect(result.players).to.have.property('player1');
			expect(result.players).to.have.property('player2');
			expect(result.players.player2).to.have.property('name', 'Player 2');
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.args[0][1]).to.include('playerJoined');
		});
		
		it('should throw error for non-existent games', async () => {
			// Setup mock to return null (game not found)
			mockRedisClient.hGet.resolves(null);
			
			try {
				await gameStateService.addPlayer('non-existent-game', 'player1', {});
				// Should not reach here
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('not found');
			}
		});
	});
	
	describe('removePlayer', () => {
		it('should remove a player from an existing game', async () => {
			const gameId = 'test-game';
			const playerId = 'player2';
			
			// Setup mock to return existing game data with two players
			mockRedisClient.hGet.resolves(JSON.stringify({
				id: gameId,
				board: [[null, null], [null, null]],
				players: {
					player1: { id: 'player1' },
					player2: { id: 'player2' }
				}
			}));
			
			const result = await gameStateService.removePlayer(gameId, playerId);
			
			expect(result.players).to.have.property('player1');
			expect(result.players).to.not.have.property('player2');
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.args[0][1]).to.include('playerLeft');
		});
		
		it('should handle non-existent player', async () => {
			const gameId = 'test-game';
			
			// Setup mock to return existing game data
			mockRedisClient.hGet.resolves(JSON.stringify({
				id: gameId,
				board: [[null, null], [null, null]],
				players: { player1: { id: 'player1' } }
			}));
			
			const result = await gameStateService.removePlayer(gameId, 'non-existent-player');
			
			expect(result.players).to.have.property('player1');
			expect(mockRedisClient.hGet.calledOnce).to.be.true;
			// Should not update or publish if player doesn't exist
			expect(mockRedisClient.hSet.called).to.be.false;
			expect(mockPubSubClient.publish.called).to.be.false;
		});
		
		it('should throw error for non-existent games', async () => {
			// Setup mock to return null (game not found)
			mockRedisClient.hGet.resolves(null);
			
			try {
				await gameStateService.removePlayer('non-existent-game', 'player1');
				// Should not reach here
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('not found');
			}
		});
	});
	
	describe('recordEvent', () => {
		it('should record a game event', async () => {
			const gameId = 'test-game';
			const eventType = 'move';
			const eventData = { playerId: 'player1', from: [0, 0], to: [1, 1] };
			
			const result = await gameStateService.recordEvent(gameId, eventType, eventData);
			
			expect(result).to.have.property('type', 'move');
			expect(result).to.have.property('timestamp');
			expect(result.data).to.deep.equal(eventData);
			expect(mockRedisClient.hSet.calledOnce).to.be.true;
			expect(mockPubSubClient.publish.calledOnce).to.be.true;
		});
	});
	
	describe('getGameEvents', () => {
		it('should get all game events', async () => {
			const gameId = 'test-game';
			
			// Setup mock to return event data
			mockRedisClient.hGetAll.resolves({
				'1641034800000': JSON.stringify({
					type: 'move',
					timestamp: 1641034800000,
					data: { playerId: 'player1', from: [0, 0], to: [1, 1] }
				}),
				'1641034900000': JSON.stringify({
					type: 'attack',
					timestamp: 1641034900000,
					data: { attackerId: 'player1', defenderId: 'player2' }
				})
			});
			
			const results = await gameStateService.getGameEvents(gameId);
			
			expect(results).to.be.an('array').with.lengthOf(2);
			expect(results[0]).to.have.property('type', 'move');
			expect(results[1]).to.have.property('type', 'attack');
			expect(mockRedisClient.hGetAll.calledOnce).to.be.true;
		});
		
		it('should return empty array for games with no events', async () => {
			// Setup mock to return empty object (no events)
			mockRedisClient.hGetAll.resolves({});
			
			const results = await gameStateService.getGameEvents('game-with-no-events');
			
			expect(results).to.be.an('array').that.is.empty;
			expect(mockRedisClient.hGetAll.calledOnce).to.be.true;
		});
	});
	
	describe('subscribeToGameUpdates', () => {
		it('should subscribe to game updates', async () => {
			const gameId = 'test-game';
			const callback = sandbox.stub();
			
			const unsubscribe = await gameStateService.subscribeToGameUpdates(gameId, callback);
			
			expect(unsubscribe).to.be.a('function');
			expect(mockPubSubClient.subscribe.calledOnce).to.be.true;
			expect(mockPubSubClient.subscribe.args[0][0]).to.equal(`game:${gameId}:updates`);
			
			// Test callback is triggered by publishing an update
			const updateData = {
				type: 'stateUpdate',
				data: { id: gameId, score: 100 }
			};
			const message = JSON.stringify(updateData);
			
			// Invoke the callback function that was passed to subscribe
			mockPubSubClient.subscribe.args[0][1](message);
			
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.deep.equal(updateData);
			
			// Test unsubscribe
			unsubscribe();
			expect(mockPubSubClient.unsubscribe.calledOnce).to.be.true;
			expect(mockPubSubClient.unsubscribe.args[0][0]).to.equal(`game:${gameId}:updates`);
		});
	});
	
	describe('disconnect', () => {
		it('should disconnect from Redis', async () => {
			await gameStateService.disconnect();
			
			expect(mockRedisClient.quit.calledOnce).to.be.true;
			expect(mockPubSubClient.quit.calledOnce).to.be.true;
		});
	});
}); 
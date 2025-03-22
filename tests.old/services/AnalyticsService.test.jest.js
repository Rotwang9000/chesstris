/**
 * Unit Tests for AnalyticsService
 * 
 * Tests the MongoDB-based analytics service.
 */

const { expect } = require('@jest/globals');
// Sinon replaced with Jest

describe('AnalyticsService', () => {
// Add custom matcher if needed
	beforeAll(() => {
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
	});
}
	let sandbox;
	let analyticsService;
	let mockSessionModel;
	let mockEventModel;
	
	beforeEach(() => {
		sandbox = jest.fn();
		
		// Create mock Mongoose models
		mockSessionModel = {
			create: jest.fn(),
			findById: jest.fn(),
			find: jest.fn(),
			findOne: jest.fn(),
			updateOne: jest.fn(),
			aggregate: jest.fn()
		};
		
		// Setup default responses
		mockSessionModel.create.resolves({
			_id: 'session123',
			gameId: 'game123',
			startTime: new Date(),
			players: [],
			save: jest.fn().mockResolvedValue()
		});
		
		mockSessionModel.findById.resolves({
			_id: 'session123',
			gameId: 'game123',
			startTime: new Date(),
			players: [],
			endTime: null,
			save: jest.fn().mockResolvedValue()
		});
		
		mockSessionModel.find.resolves([
			{
				_id: 'session123',
				gameId: 'game123',
				startTime: new Date(),
				endTime: null
			}
		]);
		
		mockSessionModel.findOne.resolves({
			_id: 'session123',
			gameId: 'game123',
			save: jest.fn().mockResolvedValue()
		});
		
		mockSessionModel.updateOne.mockResolvedValue({ nModified: 1 });
		mockSessionModel.aggregate.mockResolvedValue([]);
		
		mockEventModel = {
			create: jest.fn(),
			find: jest.fn(),
			aggregate: jest.fn()
		};
		
		// Setup default responses
		mockEventModel.create.resolves({
			_id: 'event123',
			sessionId: 'session123',
			type: 'move',
			data: { x: 1, y: 2 },
			timestamp: new Date()
		});
		
		mockEventModel.find.resolves([
			{
				_id: 'event123',
				sessionId: 'session123',
				type: 'move',
				data: { x: 1, y: 2 },
				timestamp: new Date()
			}
		]);
		
		mockEventModel.aggregate.mockResolvedValue([]);
		
		// Create AnalyticsService directly
		analyticsService = {
			// Mock properties
			SessionModel: mockSessionModel,
			EventModel: mockEventModel,
			
			// Methods
			createSession: async function(gameId, playerIds = []) {
				try {
					const session = await this.SessionModel.create({
						gameId,
						startTime: new Date(),
						players: playerIds.map(id => ({ id })),
						endTime: null
					});
					
					return session;
				} catch (error) {
					throw new Error(`Failed to create analytics session: ${error.message}`);
				}
			},
			
			endSession: async function(sessionId) {
				try {
					const session = await this.SessionModel.findById(sessionId);
					
					if (!session) {
						throw new Error(`Session with ID ${sessionId} not found`);
					}
					
					session.endTime = new Date();
					await session.save();
					
					return session;
				} catch (error) {
					throw new Error(`Failed to end analytics session: ${error.message}`);
				}
			},
			
			recordEvent: async function(sessionId, eventType, eventData) {
				try {
					const event = await this.EventModel.create({
						sessionId,
						type: eventType,
						data: eventData,
						timestamp: new Date()
					});
					
					return event;
				} catch (error) {
					throw new Error(`Failed to record analytics event: ${error.message}`);
				}
			},
			
			getSessionEvents: async function(sessionId) {
				try {
					const events = await this.EventModel.find({ sessionId });
					return events;
				} catch (error) {
					throw new Error(`Failed to get session events: ${error.message}`);
				}
			},
			
			getActiveSessions: async function() {
				try {
					const sessions = await this.SessionModel.find({ endTime: null });
					return sessions;
				} catch (error) {
					throw new Error(`Failed to get active sessions: ${error.message}`);
				}
			},
			
			generateReport: async function(gameId) {
				try {
					// Aggregate session data
					const sessionStats = await this.SessionModel.aggregate([
						{ $match: { gameId } },
						{ $group: {
							_id: null,
							count: { $sum: 1 },
							averageDuration: { $avg: { $subtract: ['$endTime', '$startTime'] } }
						}}
					]);
					
					// Aggregate event data
					const eventStats = await this.EventModel.aggregate([
						{ 
							$lookup: {
								from: 'sessions',
								localField: 'sessionId',
								foreignField: '_id',
								as: 'session'
							}
						},
						{ $unwind: '$session' },
						{ $match: { 'session.gameId': gameId } },
						{ $group: {
							_id: '$type',
							count: { $sum: 1 }
						}}
					]);
					
					return {
						sessions: sessionStats[0] || { count: 0, averageDuration: 0 },
						events: eventStats
					};
				} catch (error) {
					throw new Error(`Failed to generate analytics report: ${error.message}`);
				}
			}
		};
	});
	
	afterEach(() => {
		jest.clearAllMocks();
	});
	
	describe('createSession', () => {
		it('should create a new analytics session', async () => {
			const gameId = 'game123';
			const players = [
				{ id: 'player1', name: 'Alice' },
				{ id: 'player2', name: 'Bob' }
			];
			
			const result = await analyticsService.createSession(gameId, players);
			
			expect(result).toHaveProperty('sessionId', 'session123');
			expect(result).toHaveProperty('gameId', gameId);
			expect(result).toHaveProperty('startTime');
			expect(mockSessionModel.create.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockSessionModel.create.args[0][0]).toHaveProperty('gameId', gameId);
			expect(mockSessionModel.create.args[0][0].players).toEqual(players);
		});
	});
	
	describe('endSession', () => {
		it('should end an existing session', async () => {
			const sessionId = 'session123';
			const stats = {
				score: 100,
				pieces: 25,
				duration: 300000
			};
			
			const result = await analyticsService.endSession(sessionId, stats);
			
			expect(result).toHaveProperty('sessionId', sessionId);
			expect(result).toHaveProperty('stats');
			expect(result.stats).toEqual(stats);
			expect(mockSessionModel.findById.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockSessionModel.findById.args[0][0]).toBe(sessionId);
		});
		
		it('should throw error for non-existent session', async () => {
			// Make findById return null
			mockSessionModel.findById.mockResolvedValue(null);
			
			try {
				await analyticsService.endSession('invalid-session');
				// Should not reach here
				expect(false).toBe(true, "Should have thrown an error");
			} catch (error) {
				expect(error.message).toContain('not found');
			}
		});
	});
	
	describe('recordEvent', () => {
		it('should record an analytics event', async () => {
			const sessionId = 'session123';
			const eventType = 'move';
			const eventData = { playerId: 'player1', x: 3, y: 4 };
			
			const result = await analyticsService.recordEvent(sessionId, eventType, eventData);
			
			expect(result).toHaveProperty('eventId', 'event123');
			expect(result).toHaveProperty('sessionId', sessionId);
			expect(result).toHaveProperty('type', eventType);
			expect(result).toHaveProperty('timestamp');
			expect(mockEventModel.create.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockEventModel.create.args[0][0]).toHaveProperty('sessionId', sessionId);
			expect(mockEventModel.create.args[0][0]).toHaveProperty('type', eventType);
			expect(mockEventModel.create.args[0][0].data).toEqual(eventData);
		});
	});
	
	describe('getSessionEvents', () => {
		it('should return all events for a session', async () => {
			const sessionId = 'session123';
			
			const results = await analyticsService.getSessionEvents(sessionId);
			
			expect(results).to.be.an('array').with.lengthOf(1);
			expect(results[0]).toHaveProperty('eventId', 'event123');
			expect(results[0]).toHaveProperty('sessionId', sessionId);
			expect(results[0]).toHaveProperty('type', 'move');
			expect(mockEventModel.find.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockEventModel.find.args[0][0]).toEqual({ sessionId });
		});
	});
	
	describe('getActiveSessions', () => {
		it('should return all active sessions', async () => {
			const results = await analyticsService.getActiveSessions();
			
			expect(results).to.be.an('array').with.lengthOf(1);
			expect(results[0]).toHaveProperty('sessionId', 'session123');
			expect(results[0]).toHaveProperty('gameId', 'game123');
			expect(mockSessionModel.find.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockSessionModel.find.args[0][0]).toEqual({ endTime: null });
		});
	});
	
	describe('generateReport', () => {
		it('should generate analytics report for a game', async () => {
			const gameId = 'game123';
			const startDate = new Date('2023-01-01');
			const endDate = new Date('2023-01-31');
			
			// Setup to return two sessions with different players
			mockSessionModel.find.resolves([
				{
					_id: 'session1',
					gameId,
					startTime: new Date('2023-01-05'),
					endTime: new Date('2023-01-05'),
					players: [{ id: 'player1' }, { id: 'player2' }]
				},
				{
					_id: 'session2',
					gameId,
					startTime: new Date('2023-01-10'),
					endTime: null,
					players: [{ id: 'player1' }, { id: 'player3' }]
				}
			]);
			
			const report = await analyticsService.generateReport(gameId, startDate, endDate);
			
			expect(report).toHaveProperty('gameId', gameId);
			expect(report.period.start).toBe(startDate);
			expect(report.period.end).toBe(endDate);
			expect(report.metrics).toHaveProperty('totalSessions', 2);
			expect(report.metrics).toHaveProperty('completedSessions', 1);
			expect(report.metrics).toHaveProperty('uniquePlayers', 3);
			expect(mockSessionModel.find.toHaveBeenCalledTimes(1)).toBe(true);
			expect(mockSessionModel.find.args[0][0]).toHaveProperty('gameId', gameId);
			expect(mockSessionModel.find.args[0][0].startTime).toEqual({ $gte: startDate });
		});
	});
});
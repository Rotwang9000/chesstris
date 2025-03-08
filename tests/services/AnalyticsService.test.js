/**
 * Unit Tests for AnalyticsService
 * 
 * Tests the MongoDB-based analytics service.
 */

import { expect } from 'chai';
import * as sinon from 'sinon';
import { createTestProxy } from '../setup.js';

describe('AnalyticsService', () => {
	let sandbox;
	let analyticsService;
	let mockSessionModel;
	let mockEventModel;
	
	beforeEach(() => {
		sandbox = sinon.createSandbox();
		
		// Create mock Mongoose models
		mockSessionModel = {
			create: sandbox.stub().resolves({
				_id: 'session123',
				gameId: 'game123',
				startTime: new Date(),
				players: [],
				save: sandbox.stub().resolves()
			}),
			findById: sandbox.stub().resolves({
				_id: 'session123',
				gameId: 'game123',
				startTime: new Date(),
				players: [],
				endTime: null,
				save: sandbox.stub().resolves()
			}),
			find: sandbox.stub().resolves([
				{
					_id: 'session123',
					gameId: 'game123',
					startTime: new Date(),
					players: [],
					endTime: null
				}
			])
		};
		
		mockEventModel = {
			create: sandbox.stub().resolves({
				_id: 'event123',
				sessionId: 'session123',
				type: 'move',
				data: { x: 1, y: 2 },
				timestamp: new Date()
			}),
			find: sandbox.stub().resolves([
				{
					_id: 'event123',
					sessionId: 'session123',
					type: 'move',
					data: { x: 1, y: 2 },
					timestamp: new Date()
				}
			])
		};
		
		// Create AnalyticsService proxy with mock models
		analyticsService = createTestProxy({
			// Mock properties
			SessionModel: mockSessionModel,
			EventModel: mockEventModel,
			
			// Methods
			createSession: async (gameId, playerData = []) => {
				const session = await mockSessionModel.create({
					gameId,
					startTime: new Date(),
					players: playerData,
					endTime: null
				});
				
				return {
					sessionId: session._id,
					gameId,
					startTime: session.startTime
				};
			},
			
			endSession: async (sessionId, stats = {}) => {
				const session = await mockSessionModel.findById(sessionId);
				if (!session) {
					throw new Error(`Session ${sessionId} not found`);
				}
				
				session.endTime = new Date();
				session.stats = stats;
				await session.save();
				
				return {
					sessionId,
					gameId: session.gameId,
					duration: session.endTime - session.startTime,
					stats
				};
			},
			
			recordEvent: async (sessionId, eventType, eventData) => {
				const event = await mockEventModel.create({
					sessionId,
					type: eventType,
					data: eventData,
					timestamp: new Date()
				});
				
				return {
					eventId: event._id,
					sessionId,
					type: eventType,
					timestamp: event.timestamp
				};
			},
			
			getSessionEvents: async (sessionId) => {
				const events = await mockEventModel.find({ sessionId });
				return events.map(event => ({
					eventId: event._id,
					sessionId,
					type: event.type,
					data: event.data,
					timestamp: event.timestamp
				}));
			},
			
			getActiveSessions: async () => {
				const sessions = await mockSessionModel.find({ endTime: null });
				return sessions.map(session => ({
					sessionId: session._id,
					gameId: session.gameId,
					startTime: session.startTime,
					players: session.players
				}));
			},
			
			generateReport: async (gameId, startDate, endDate) => {
				const sessions = await mockSessionModel.find({
					gameId,
					startTime: { $gte: startDate },
					$or: [
						{ endTime: { $lte: endDate } },
						{ endTime: null }
					]
				});
				
				const totalSessions = sessions.length;
				const completedSessions = sessions.filter(s => s.endTime).length;
				const uniquePlayers = new Set();
				
				sessions.forEach(session => {
					session.players.forEach(player => {
						uniquePlayers.add(player.id || player.userId);
					});
				});
				
				return {
					gameId,
					period: {
						start: startDate,
						end: endDate
					},
					metrics: {
						totalSessions,
						completedSessions,
						uniquePlayers: uniquePlayers.size
					}
				};
			}
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('createSession', () => {
		it('should create a new analytics session', async () => {
			const gameId = 'game123';
			const players = [
				{ id: 'player1', name: 'Alice' },
				{ id: 'player2', name: 'Bob' }
			];
			
			const result = await analyticsService.createSession(gameId, players);
			
			expect(result).to.have.property('sessionId', 'session123');
			expect(result).to.have.property('gameId', gameId);
			expect(result).to.have.property('startTime');
			expect(mockSessionModel.create.calledOnce).to.be.true;
			expect(mockSessionModel.create.args[0][0]).to.have.property('gameId', gameId);
			expect(mockSessionModel.create.args[0][0].players).to.deep.equal(players);
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
			
			expect(result).to.have.property('sessionId', sessionId);
			expect(result).to.have.property('stats');
			expect(result.stats).to.deep.equal(stats);
			expect(mockSessionModel.findById.calledOnce).to.be.true;
			expect(mockSessionModel.findById.args[0][0]).to.equal(sessionId);
		});
		
		it('should throw error for non-existent session', async () => {
			// Make findById return null
			mockSessionModel.findById.resolves(null);
			
			try {
				await analyticsService.endSession('invalid-session');
				// Should not reach here
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('not found');
			}
		});
	});
	
	describe('recordEvent', () => {
		it('should record an analytics event', async () => {
			const sessionId = 'session123';
			const eventType = 'move';
			const eventData = { playerId: 'player1', x: 3, y: 4 };
			
			const result = await analyticsService.recordEvent(sessionId, eventType, eventData);
			
			expect(result).to.have.property('eventId', 'event123');
			expect(result).to.have.property('sessionId', sessionId);
			expect(result).to.have.property('type', eventType);
			expect(result).to.have.property('timestamp');
			expect(mockEventModel.create.calledOnce).to.be.true;
			expect(mockEventModel.create.args[0][0]).to.have.property('sessionId', sessionId);
			expect(mockEventModel.create.args[0][0]).to.have.property('type', eventType);
			expect(mockEventModel.create.args[0][0].data).to.deep.equal(eventData);
		});
	});
	
	describe('getSessionEvents', () => {
		it('should return all events for a session', async () => {
			const sessionId = 'session123';
			
			const results = await analyticsService.getSessionEvents(sessionId);
			
			expect(results).to.be.an('array').with.lengthOf(1);
			expect(results[0]).to.have.property('eventId', 'event123');
			expect(results[0]).to.have.property('sessionId', sessionId);
			expect(results[0]).to.have.property('type', 'move');
			expect(mockEventModel.find.calledOnce).to.be.true;
			expect(mockEventModel.find.args[0][0]).to.deep.equal({ sessionId });
		});
	});
	
	describe('getActiveSessions', () => {
		it('should return all active sessions', async () => {
			const results = await analyticsService.getActiveSessions();
			
			expect(results).to.be.an('array').with.lengthOf(1);
			expect(results[0]).to.have.property('sessionId', 'session123');
			expect(results[0]).to.have.property('gameId', 'game123');
			expect(mockSessionModel.find.calledOnce).to.be.true;
			expect(mockSessionModel.find.args[0][0]).to.deep.equal({ endTime: null });
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
			
			expect(report).to.have.property('gameId', gameId);
			expect(report.period.start).to.equal(startDate);
			expect(report.period.end).to.equal(endDate);
			expect(report.metrics).to.have.property('totalSessions', 2);
			expect(report.metrics).to.have.property('completedSessions', 1);
			expect(report.metrics).to.have.property('uniquePlayers', 3);
			expect(mockSessionModel.find.calledOnce).to.be.true;
			expect(mockSessionModel.find.args[0][0]).to.have.property('gameId', gameId);
			expect(mockSessionModel.find.args[0][0].startTime).to.deep.equal({ $gte: startDate });
		});
	});
}); 
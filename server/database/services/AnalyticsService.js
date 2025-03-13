/**
 * Analytics Service
 * 
 * Manages game analytics data in MongoDB:
 * - Session tracking
 * - User behavior analysis
 * - Performance monitoring
 * - Reporting
 */

import Analytics from '../models/Analytics.js';
import { v4 as uuidv4 } from 'uuid';
import * as UAParserJS from 'ua-parser-js';

export class AnalyticsService {
	/**
	 * Create a new analytics session
	 * @param {Object} sessionData - Session data
	 * @returns {Promise<Object>} Created session
	 */
	async createSession(sessionData) {
		// Generate session ID if not provided
		if (!sessionData.sessionId) {
			sessionData.sessionId = uuidv4();
		}
		
		// Set start time if not provided
		if (!sessionData.startTime) {
			sessionData.startTime = new Date();
		}
		
		// Create session
		const session = new Analytics(sessionData);
		await session.save();
		
		return session;
	}
	
	/**
	 * End an analytics session
	 * @param {string} sessionId - Session ID
	 * @param {Object} finalMetrics - Final metrics to update
	 * @returns {Promise<Object>} Updated session
	 */
	async endSession(sessionId, finalMetrics = {}) {
		const session = await Analytics.findOne({ sessionId });
		
		if (!session) {
			throw new Error('Session not found');
		}
		
		// Set end time and calculate duration
		session.endTime = new Date();
		session.duration = Math.floor((session.endTime - session.startTime) / 1000);
		
		// Update metrics
		if (finalMetrics.gameMetrics) {
			Object.assign(session.gameMetrics, finalMetrics.gameMetrics);
		}
		
		if (finalMetrics.marketplaceMetrics) {
			Object.assign(session.marketplaceMetrics, finalMetrics.marketplaceMetrics);
		}
		
		if (finalMetrics.uiMetrics) {
			// Merge button clicks
			if (finalMetrics.uiMetrics.buttonClicks) {
				for (const [key, value] of Object.entries(finalMetrics.uiMetrics.buttonClicks)) {
					const currentValue = session.uiMetrics.buttonClicks.get(key) || 0;
					session.uiMetrics.buttonClicks.set(key, currentValue + value);
				}
			}
			
			// Merge page views
			if (finalMetrics.uiMetrics.pageViews) {
				for (const [key, value] of Object.entries(finalMetrics.uiMetrics.pageViews)) {
					const currentValue = session.uiMetrics.pageViews.get(key) || 0;
					session.uiMetrics.pageViews.set(key, currentValue + value);
				}
			}
			
			// Merge modal interactions
			if (finalMetrics.uiMetrics.modalInteractions) {
				for (const [key, value] of Object.entries(finalMetrics.uiMetrics.modalInteractions)) {
					const currentValue = session.uiMetrics.modalInteractions.get(key) || 0;
					session.uiMetrics.modalInteractions.set(key, currentValue + value);
				}
			}
			
			// Merge time spent per screen
			if (finalMetrics.uiMetrics.timeSpentPerScreen) {
				for (const [key, value] of Object.entries(finalMetrics.uiMetrics.timeSpentPerScreen)) {
					const currentValue = session.uiMetrics.timeSpentPerScreen.get(key) || 0;
					session.uiMetrics.timeSpentPerScreen.set(key, currentValue + value);
				}
			}
		}
		
		if (finalMetrics.performanceMetrics) {
			Object.assign(session.performanceMetrics, finalMetrics.performanceMetrics);
		}
		
		if (finalMetrics.metadata) {
			for (const [key, value] of Object.entries(finalMetrics.metadata)) {
				session.metadata.set(key, value);
			}
		}
		
		await session.save();
		
		return session;
	}
	
	/**
	 * Update session metrics
	 * @param {string} sessionId - Session ID
	 * @param {Object} metrics - Metrics to update
	 * @returns {Promise<Object>} Updated session
	 */
	async updateSessionMetrics(sessionId, metrics) {
		const session = await Analytics.findOne({ sessionId });
		
		if (!session) {
			throw new Error('Session not found');
		}
		
		// Update game metrics
		if (metrics.gameMetrics) {
			for (const [key, value] of Object.entries(metrics.gameMetrics)) {
				if (typeof value === 'number' && typeof session.gameMetrics[key] === 'number') {
					session.gameMetrics[key] += value;
				} else {
					session.gameMetrics[key] = value;
				}
			}
		}
		
		// Update marketplace metrics
		if (metrics.marketplaceMetrics) {
			for (const [key, value] of Object.entries(metrics.marketplaceMetrics)) {
				if (key === 'categoriesViewed' && Array.isArray(value)) {
					// Add unique categories
					const uniqueCategories = new Set([
						...(session.marketplaceMetrics.categoriesViewed || []),
						...value
					]);
					session.marketplaceMetrics.categoriesViewed = Array.from(uniqueCategories);
				} else if (typeof value === 'number' && typeof session.marketplaceMetrics[key] === 'number') {
					session.marketplaceMetrics[key] += value;
				} else {
					session.marketplaceMetrics[key] = value;
				}
			}
		}
		
		// Update UI metrics
		if (metrics.uiMetrics) {
			// Update button clicks
			if (metrics.uiMetrics.buttonClicks) {
				for (const [key, value] of Object.entries(metrics.uiMetrics.buttonClicks)) {
					const currentValue = session.uiMetrics.buttonClicks.get(key) || 0;
					session.uiMetrics.buttonClicks.set(key, currentValue + value);
				}
			}
			
			// Update page views
			if (metrics.uiMetrics.pageViews) {
				for (const [key, value] of Object.entries(metrics.uiMetrics.pageViews)) {
					const currentValue = session.uiMetrics.pageViews.get(key) || 0;
					session.uiMetrics.pageViews.set(key, currentValue + value);
				}
			}
			
			// Update modal interactions
			if (metrics.uiMetrics.modalInteractions) {
				for (const [key, value] of Object.entries(metrics.uiMetrics.modalInteractions)) {
					const currentValue = session.uiMetrics.modalInteractions.get(key) || 0;
					session.uiMetrics.modalInteractions.set(key, currentValue + value);
				}
			}
			
			// Update time spent per screen
			if (metrics.uiMetrics.timeSpentPerScreen) {
				for (const [key, value] of Object.entries(metrics.uiMetrics.timeSpentPerScreen)) {
					const currentValue = session.uiMetrics.timeSpentPerScreen.get(key) || 0;
					session.uiMetrics.timeSpentPerScreen.set(key, currentValue + value);
				}
			}
		}
		
		// Update performance metrics
		if (metrics.performanceMetrics) {
			// Add errors
			if (metrics.performanceMetrics.errors && Array.isArray(metrics.performanceMetrics.errors)) {
				session.performanceMetrics.errors.push(...metrics.performanceMetrics.errors);
			}
			
			// Update load times
			if (metrics.performanceMetrics.loadTimes) {
				for (const [key, value] of Object.entries(metrics.performanceMetrics.loadTimes)) {
					session.performanceMetrics.loadTimes.set(key, value);
				}
			}
			
			// Update average FPS
			if (metrics.performanceMetrics.averageFps) {
				// If we already have an FPS value, average them
				if (session.performanceMetrics.averageFps) {
					session.performanceMetrics.averageFps = 
						(session.performanceMetrics.averageFps + metrics.performanceMetrics.averageFps) / 2;
				} else {
					session.performanceMetrics.averageFps = metrics.performanceMetrics.averageFps;
				}
			}
		}
		
		// Update metadata
		if (metrics.metadata) {
			for (const [key, value] of Object.entries(metrics.metadata)) {
				session.metadata.set(key, value);
			}
		}
		
		await session.save();
		
		return session;
	}
	
	/**
	 * Log an error
	 * @param {string} sessionId - Session ID
	 * @param {string} errorType - Error type
	 * @param {string} message - Error message
	 * @param {Object} context - Error context
	 * @returns {Promise<Object>} Updated session
	 */
	async logError(sessionId, errorType, message, context = {}) {
		const session = await Analytics.findOne({ sessionId });
		
		if (!session) {
			throw new Error('Session not found');
		}
		
		// Add error to performance metrics
		if (!session.performanceMetrics.errors) {
			session.performanceMetrics.errors = [];
		}
		
		session.performanceMetrics.errors.push({
			errorType,
			message,
			timestamp: new Date(),
			context
		});
		
		await session.save();
		
		return session;
	}
	
	/**
	 * Parse user agent string to get device info
	 * @param {string} userAgent - User agent string
	 * @returns {Object} Device info
	 */
	parseUserAgent(userAgent) {
		const parser = new UAParserJS.UAParser(userAgent);
		const result = parser.getResult();
		
		return {
			browser: `${result.browser.name} ${result.browser.version}`,
			os: `${result.os.name} ${result.os.version}`,
			device: result.device.vendor ? `${result.device.vendor} ${result.device.model}` : 'Desktop',
			isMobile: result.device.type === 'mobile' || result.device.type === 'tablet'
		};
	}
	
	/**
	 * Get session by ID
	 * @param {string} sessionId - Session ID
	 * @returns {Promise<Object>} Session
	 */
	async getSession(sessionId) {
		const session = await Analytics.findOne({ sessionId });
		
		if (!session) {
			throw new Error('Session not found');
		}
		
		return session;
	}
	
	/**
	 * Get sessions for a user
	 * @param {string} userId - User ID
	 * @param {number} limit - Number of sessions to return
	 * @returns {Promise<Array>} Sessions
	 */
	async getUserSessions(userId, limit = 20) {
		return Analytics.findSessionsForUser(userId, limit);
	}
	
	/**
	 * Get sessions for a game
	 * @param {string} gameId - Game ID
	 * @returns {Promise<Array>} Sessions
	 */
	async getGameSessions(gameId) {
		return Analytics.findSessionsForGame(gameId);
	}
	
	/**
	 * Get aggregate metrics for a time period
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @param {string} groupBy - Group by (hour, day, week, month)
	 * @returns {Promise<Array>} Aggregate metrics
	 */
	async getAggregateMetrics(startDate, endDate, groupBy = 'day') {
		return Analytics.getAggregateMetrics(startDate, endDate, groupBy);
	}
	
	/**
	 * Get top performing features
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @param {number} limit - Number of features to return
	 * @returns {Promise<Array>} Top features
	 */
	async getTopFeatures(startDate, endDate, limit = 10) {
		const matchStage = {
			$match: {
				startTime: {
					$gte: startDate,
					$lte: endDate
				}
			}
		};
		
		const unwindStage = {
			$unwind: {
				path: '$uiMetrics.buttonClicks',
				preserveNullAndEmptyArrays: false
			}
		};
		
		const groupStage = {
			$group: {
				_id: '$uiMetrics.buttonClicks.k',
				totalClicks: { $sum: '$uiMetrics.buttonClicks.v' },
				uniqueUsers: { $addToSet: '$userId' }
			}
		};
		
		const projectStage = {
			$project: {
				_id: 0,
				feature: '$_id',
				totalClicks: 1,
				uniqueUserCount: { $size: '$uniqueUsers' }
			}
		};
		
		const sortStage = {
			$sort: { totalClicks: -1 }
		};
		
		const limitStage = {
			$limit: limit
		};
		
		return Analytics.aggregate([
			matchStage,
			unwindStage,
			groupStage,
			projectStage,
			sortStage,
			limitStage
		]);
	}
	
	/**
	 * Get user retention metrics
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @returns {Promise<Object>} Retention metrics
	 */
	async getUserRetention(startDate, endDate) {
		// Get all users who had a session in the period
		const users = await Analytics.aggregate([
			{
				$match: {
					startTime: {
						$gte: startDate,
						$lte: endDate
					},
					userId: { $ne: null }
				}
			},
			{
				$group: {
					_id: '$userId',
					firstSession: { $min: '$startTime' },
					lastSession: { $max: '$startTime' },
					sessionCount: { $sum: 1 }
				}
			}
		]);
		
		// Calculate retention metrics
		const totalUsers = users.length;
		let returning = 0;
		let oneDay = 0;
		let sevenDay = 0;
		let thirtyDay = 0;
		
		const now = new Date();
		
		users.forEach(user => {
			const daysSinceFirst = Math.floor((now - user.firstSession) / (1000 * 60 * 60 * 24));
			const daysBetweenSessions = Math.floor((user.lastSession - user.firstSession) / (1000 * 60 * 60 * 24));
			
			// Users with more than one session
			if (user.sessionCount > 1) {
				returning++;
				
				// Users who returned after 1+ days
				if (daysBetweenSessions >= 1) {
					oneDay++;
				}
				
				// Users who returned after 7+ days
				if (daysBetweenSessions >= 7) {
					sevenDay++;
				}
				
				// Users who returned after 30+ days
				if (daysBetweenSessions >= 30) {
					thirtyDay++;
				}
			}
		});
		
		return {
			totalUsers,
			returningUsers: returning,
			returningPercentage: totalUsers > 0 ? (returning / totalUsers) * 100 : 0,
			oneDayRetention: totalUsers > 0 ? (oneDay / totalUsers) * 100 : 0,
			sevenDayRetention: totalUsers > 0 ? (sevenDay / totalUsers) * 100 : 0,
			thirtyDayRetention: totalUsers > 0 ? (thirtyDay / totalUsers) * 100 : 0
		};
	}
}

export default AnalyticsService; 
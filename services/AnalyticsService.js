/**
 * Analytics Service
 * 
 * Provides analytics functionality for the Chesstris game.
 */

const AnalyticsServiceImpl = require('../server/database/services/AnalyticsService');

class AnalyticsService {
	constructor() {
		this.service = new AnalyticsServiceImpl();
	}
	
	/**
	 * Create a new analytics session
	 * @param {Object} sessionData - Session data
	 * @returns {Promise<Object>} Created session
	 */
	async createSession(sessionData) {
		return this.service.createSession(sessionData);
	}
	
	/**
	 * End an analytics session
	 * @param {string} sessionId - Session ID
	 * @param {Object} finalMetrics - Final metrics to update
	 * @returns {Promise<Object>} Updated session
	 */
	async endSession(sessionId, finalMetrics = {}) {
		return this.service.endSession(sessionId, finalMetrics);
	}
	
	/**
	 * Update session metrics
	 * @param {string} sessionId - Session ID
	 * @param {Object} metrics - Metrics to update
	 * @returns {Promise<Object>} Updated session
	 */
	async updateSessionMetrics(sessionId, metrics) {
		return this.service.updateSessionMetrics(sessionId, metrics);
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
		return this.service.logError(sessionId, errorType, message, context);
	}
	
	/**
	 * Parse user agent string to get device info
	 * @param {string} userAgent - User agent string
	 * @returns {Object} Device info
	 */
	parseUserAgent(userAgent) {
		return this.service.parseUserAgent(userAgent);
	}
	
	/**
	 * Get session by ID
	 * @param {string} sessionId - Session ID
	 * @returns {Promise<Object>} Session
	 */
	async getSession(sessionId) {
		return this.service.getSession(sessionId);
	}
	
	/**
	 * Get sessions for a user
	 * @param {string} userId - User ID
	 * @param {number} limit - Number of sessions to return
	 * @returns {Promise<Array>} Sessions
	 */
	async getUserSessions(userId, limit = 20) {
		return this.service.getUserSessions(userId, limit);
	}
	
	/**
	 * Get sessions for a game
	 * @param {string} gameId - Game ID
	 * @returns {Promise<Array>} Sessions
	 */
	async getGameSessions(gameId) {
		return this.service.getGameSessions(gameId);
	}
	
	/**
	 * Get aggregate metrics for a time period
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @param {string} groupBy - Group by (hour, day, week, month)
	 * @returns {Promise<Array>} Aggregate metrics
	 */
	async getAggregateMetrics(startDate, endDate, groupBy = 'day') {
		return this.service.getAggregateMetrics(startDate, endDate, groupBy);
	}
	
	/**
	 * Get top performing features
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @param {number} limit - Number of features to return
	 * @returns {Promise<Array>} Top features
	 */
	async getTopFeatures(startDate, endDate, limit = 10) {
		return this.service.getTopFeatures(startDate, endDate, limit);
	}
	
	/**
	 * Get user retention metrics
	 * @param {Date} startDate - Start date
	 * @param {Date} endDate - End date
	 * @returns {Promise<Object>} Retention metrics
	 */
	async getUserRetention(startDate, endDate) {
		return this.service.getUserRetention(startDate, endDate);
	}
}

module.exports = { AnalyticsService }; 
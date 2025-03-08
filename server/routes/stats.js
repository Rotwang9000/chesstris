/**
 * Stats Routes
 * 
 * API endpoints for game statistics:
 * - Player stats
 * - Game stats
 * - Leaderboards
 */

import express from 'express';
import auth from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

/**
 * @route GET /api/stats/player/:playerId
 * @desc Get player statistics
 * @access Public
 */
router.get('/player/:playerId', async (req, res) => {
	try {
		const { playerId } = req.params;
		
		// Get player stats
		const stats = await req.services.analytics.getPlayerStats(playerId);
		
		if (!stats) {
			return res.status(404).json({ message: 'Player stats not found' });
		}
		
		res.json(stats);
	} catch (error) {
		console.error('Error getting player stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/stats/leaderboard
 * @desc Get global leaderboard
 * @access Public
 */
router.get('/leaderboard', async (req, res) => {
	try {
		// Get leaderboard
		const leaderboard = await req.services.analytics.getLeaderboard();
		
		res.json(leaderboard);
	} catch (error) {
		console.error('Error getting leaderboard:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/stats/game/:gameId
 * @desc Get game statistics
 * @access Public
 */
router.get('/game/:gameId', async (req, res) => {
	try {
		const { gameId } = req.params;
		
		// Get game stats
		const stats = await req.services.analytics.getGameStats(gameId);
		
		if (!stats) {
			return res.status(404).json({ message: 'Game stats not found' });
		}
		
		res.json(stats);
	} catch (error) {
		console.error('Error getting game stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/stats/global
 * @desc Get global game statistics
 * @access Public
 */
router.get('/global', async (req, res) => {
	try {
		// Get global stats
		const stats = await req.services.analytics.getGlobalStats();
		
		res.json(stats);
	} catch (error) {
		console.error('Error getting global stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/stats/active-players
 * @desc Get active player count
 * @access Public
 */
router.get('/active-players', async (req, res) => {
	try {
		// Get active player count
		const count = await req.services.analytics.getActivePlayerCount();
		
		res.json({ count });
	} catch (error) {
		console.error('Error getting active player count:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/stats/dashboard
 * @desc Get admin dashboard statistics
 * @access Admin
 */
router.get('/dashboard', adminAuth, async (req, res) => {
	try {
		// Get dashboard stats
		const stats = await req.services.analytics.getDashboardStats();
		
		res.json(stats);
	} catch (error) {
		console.error('Error getting dashboard stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

export default router; 
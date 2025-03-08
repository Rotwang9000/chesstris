/**
 * Game Routes
 * 
 * API endpoints for game management:
 * - Game creation
 * - Game state
 * - Game settings
 */

import express from 'express';
import auth from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

/**
 * @route POST /api/game/create
 * @desc Create a new game
 * @access Private
 */
router.post('/create', auth, async (req, res) => {
	try {
		const { name, maxPlayers, difficulty } = req.body;
		
		// Create game
		const game = await req.services.gameState.createGame({
			name: name || 'Chess-tris Game',
			maxPlayers: maxPlayers || 8,
			difficulty: difficulty || 'normal',
			createdBy: req.user.id
		});
		
		res.status(201).json({
			gameId: game.gameId,
			name: game.name,
			difficulty: game.difficulty
		});
	} catch (error) {
		console.error('Error creating game:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/game/list
 * @desc Get list of active games
 * @access Public
 */
router.get('/list', async (req, res) => {
	try {
		// Get active games
		const games = await req.services.gameState.getActiveGames();
		
		// Format response
		const gameList = games.map(game => ({
			gameId: game.gameId,
			name: game.name,
			playerCount: game.players.length,
			maxPlayers: game.maxPlayers,
			difficulty: game.difficulty,
			createdAt: game.createdAt
		}));
		
		res.json(gameList);
	} catch (error) {
		console.error('Error getting game list:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/game/:gameId
 * @desc Get game state
 * @access Public
 */
router.get('/:gameId', async (req, res) => {
	try {
		const { gameId } = req.params;
		
		// Get game
		const game = await req.services.gameState.getGame(gameId);
		if (!game) {
			return res.status(404).json({ message: 'Game not found' });
		}
		
		res.json({
			gameId: game.gameId,
			name: game.name,
			boardState: game.boardState,
			players: game.players.map(player => ({
				id: player.id,
				username: player.username,
				color: player.color,
				score: player.score
			})),
			fallingPiece: game.fallingPiece,
			gameStatus: game.gameStatus,
			difficulty: game.difficulty
		});
	} catch (error) {
		console.error('Error getting game:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route PUT /api/game/:gameId/difficulty
 * @desc Update game difficulty
 * @access Admin
 */
router.put('/:gameId/difficulty', adminAuth, async (req, res) => {
	try {
		const { gameId } = req.params;
		const { difficulty } = req.body;
		
		// Validate input
		if (!difficulty || !['easy', 'normal', 'hard'].includes(difficulty)) {
			return res.status(400).json({ message: 'Invalid difficulty' });
		}
		
		// Update difficulty
		await req.services.gameState.updateGameSettings(gameId, { difficulty });
		
		res.json({ message: 'Game difficulty updated successfully' });
	} catch (error) {
		console.error('Error updating game difficulty:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/game/:gameId/join
 * @desc Join a game
 * @access Private
 */
router.post('/:gameId/join', auth, async (req, res) => {
	try {
		const { gameId } = req.params;
		
		// Join game
		const result = await req.services.gameState.joinGame(gameId, {
			playerId: req.user.id,
			username: req.user.username
		});
		
		if (!result.success) {
			return res.status(400).json({ message: result.message });
		}
		
		res.json({
			message: 'Joined game successfully',
			playerData: result.playerData
		});
	} catch (error) {
		console.error('Error joining game:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/game/:gameId/leave
 * @desc Leave a game
 * @access Private
 */
router.post('/:gameId/leave', auth, async (req, res) => {
	try {
		const { gameId } = req.params;
		
		// Leave game
		await req.services.gameState.leaveGame(gameId, req.user.id);
		
		res.json({ message: 'Left game successfully' });
	} catch (error) {
		console.error('Error leaving game:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

export default router; 
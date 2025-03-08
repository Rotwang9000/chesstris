/**
 * Game State Service
 * 
 * Manages real-time game state in Redis:
 * - Board state
 * - Player positions
 * - Active pieces
 * 
 * Redis is used for real-time data that needs fast access,
 * while MongoDB is used for persistent data and analytics.
 */

import { v4 as uuidv4 } from 'uuid';
import Game from '../models/Game.js';

export class GameStateService {
	constructor(redisClient) {
		this.redis = redisClient;
		this.keyPrefix = 'chesstris:';
	}
	
	/**
	 * Create a new game session
	 * @param {Object} config - Game configuration
	 * @returns {Promise<string>} Game ID
	 */
	async createGame(config = {}) {
		const gameId = uuidv4();
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		
		// Default configuration
		const defaultConfig = {
			boardWidth: 24,
			boardHeight: 24,
			homeZoneWidth: 8,
			homeZoneHeight: 2,
			tetrominoSpawnRate: 5000,
			rowClearThreshold: 8,
			sponsorChance: 0.2,
			potionChance: 0.1,
			homeZoneDegradationInterval: 300000
		};
		
		// Merge with provided config
		const gameConfig = { ...defaultConfig, ...config };
		
		// Initialize empty board
		const board = {};
		
		// Store initial game state in Redis
		await this.redis.hset(gameKey, {
			id: gameId,
			status: 'pending',
			createdAt: Date.now(),
			config: JSON.stringify(gameConfig),
			board: JSON.stringify(board),
			players: JSON.stringify({}),
			homeZones: JSON.stringify({}),
			fallingPiece: 'null'
		});
		
		// Set expiration for pending games (1 hour)
		await this.redis.expire(gameKey, 3600);
		
		// Create MongoDB record for persistence
		const game = new Game({
			gameId,
			status: 'pending',
			config: gameConfig
		});
		
		await game.save();
		
		return gameId;
	}
	
	/**
	 * Get game state
	 * @param {string} gameId - Game ID
	 * @returns {Promise<Object>} Game state
	 */
	async getGameState(gameId) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		const gameData = await this.redis.hgetall(gameKey);
		
		if (!gameData || Object.keys(gameData).length === 0) {
			return null;
		}
		
		// Parse JSON fields
		return {
			id: gameData.id,
			status: gameData.status,
			createdAt: parseInt(gameData.createdAt),
			startedAt: gameData.startedAt ? parseInt(gameData.startedAt) : null,
			config: JSON.parse(gameData.config),
			board: JSON.parse(gameData.board),
			players: JSON.parse(gameData.players),
			homeZones: JSON.parse(gameData.homeZones),
			fallingPiece: gameData.fallingPiece !== 'null' ? JSON.parse(gameData.fallingPiece) : null
		};
	}
	
	/**
	 * Update game board
	 * @param {string} gameId - Game ID
	 * @param {Object} board - Board state
	 * @returns {Promise<boolean>} Success
	 */
	async updateBoard(gameId, board) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		await this.redis.hset(gameKey, 'board', JSON.stringify(board));
		return true;
	}
	
	/**
	 * Update falling piece
	 * @param {string} gameId - Game ID
	 * @param {Object} piece - Falling piece
	 * @returns {Promise<boolean>} Success
	 */
	async updateFallingPiece(gameId, piece) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		await this.redis.hset(gameKey, 'fallingPiece', piece ? JSON.stringify(piece) : 'null');
		return true;
	}
	
	/**
	 * Add player to game
	 * @param {string} gameId - Game ID
	 * @param {Object} player - Player data
	 * @returns {Promise<boolean>} Success
	 */
	async addPlayer(gameId, player) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		
		// Get current players
		const playersJson = await this.redis.hget(gameKey, 'players');
		const players = JSON.parse(playersJson || '{}');
		
		// Add new player
		players[player.id] = player;
		
		// Update Redis
		await this.redis.hset(gameKey, 'players', JSON.stringify(players));
		
		// If this is the first player, start the game
		if (Object.keys(players).length === 1) {
			await this.redis.hset(gameKey, 'status', 'active');
			await this.redis.hset(gameKey, 'startedAt', Date.now().toString());
			
			// Remove expiration for active games
			await this.redis.persist(gameKey);
			
			// Update MongoDB record
			await Game.findOneAndUpdate(
				{ gameId },
				{
					$set: {
						status: 'active',
						startedAt: new Date()
					}
				}
			);
		}
		
		// Update MongoDB record
		await Game.findOneAndUpdate(
			{ gameId },
			{
				$push: {
					players: {
						socketId: player.id,
						username: player.username,
						color: player.color,
						homeZone: player.homeZone,
						pieces: player.pieces.map(p => ({
							id: p.id,
							type: p.type,
							x: p.x,
							y: p.y
						}))
					}
				}
			}
		);
		
		return true;
	}
	
	/**
	 * Remove player from game
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player ID
	 * @returns {Promise<boolean>} Success
	 */
	async removePlayer(gameId, playerId) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		
		// Get current players
		const playersJson = await this.redis.hget(gameKey, 'players');
		const players = JSON.parse(playersJson || '{}');
		
		// Remove player
		delete players[playerId];
		
		// Update Redis
		await this.redis.hset(gameKey, 'players', JSON.stringify(players));
		
		// If no players left, end the game
		if (Object.keys(players).length === 0) {
			await this.redis.hset(gameKey, 'status', 'abandoned');
			await this.redis.hset(gameKey, 'endedAt', Date.now().toString());
			
			// Set expiration for abandoned games (1 day)
			await this.redis.expire(gameKey, 86400);
			
			// Update MongoDB record
			await Game.findOneAndUpdate(
				{ gameId },
				{
					$set: {
						status: 'abandoned',
						endedAt: new Date()
					}
				}
			);
		}
		
		// Update MongoDB record
		await Game.findOneAndUpdate(
			{ gameId, 'players.socketId': playerId },
			{
				$set: {
					'players.$.isActive': false,
					'players.$.left': new Date()
				}
			}
		);
		
		return true;
	}
	
	/**
	 * Update home zones
	 * @param {string} gameId - Game ID
	 * @param {Object} homeZones - Home zones
	 * @returns {Promise<boolean>} Success
	 */
	async updateHomeZones(gameId, homeZones) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		await this.redis.hset(gameKey, 'homeZones', JSON.stringify(homeZones));
		return true;
	}
	
	/**
	 * Create a snapshot of the current game state in MongoDB
	 * @param {string} gameId - Game ID
	 * @returns {Promise<boolean>} Success
	 */
	async createSnapshot(gameId) {
		// Get current state from Redis
		const state = await this.getGameState(gameId);
		if (!state) return false;
		
		// Find game in MongoDB
		const game = await Game.findOne({ gameId });
		if (!game) return false;
		
		// Create snapshot
		await game.createSnapshot(state.board, state.fallingPiece, state.players);
		return true;
	}
	
	/**
	 * Record a game event
	 * @param {string} gameId - Game ID
	 * @param {Object} eventData - Event data
	 * @returns {Promise<boolean>} Success
	 */
	async recordEvent(gameId, eventData) {
		// Find game in MongoDB
		const game = await Game.findOne({ gameId });
		if (!game) return false;
		
		// Record event
		await game.recordEvent(eventData);
		return true;
	}
	
	/**
	 * End a game
	 * @param {string} gameId - Game ID
	 * @param {Array} winners - List of winners
	 * @returns {Promise<boolean>} Success
	 */
	async endGame(gameId, winners = []) {
		const gameKey = `${this.keyPrefix}game:${gameId}`;
		
		// Update Redis
		await this.redis.hset(gameKey, 'status', 'completed');
		await this.redis.hset(gameKey, 'endedAt', Date.now().toString());
		await this.redis.hset(gameKey, 'winners', JSON.stringify(winners));
		
		// Set expiration for completed games (1 day)
		await this.redis.expire(gameKey, 86400);
		
		// Create final snapshot
		await this.createSnapshot(gameId);
		
		// Update MongoDB record
		await Game.findOneAndUpdate(
			{ gameId },
			{
				$set: {
					status: 'completed',
					endedAt: new Date(),
					winners: winners
				}
			}
		);
		
		return true;
	}
	
	/**
	 * List active games
	 * @returns {Promise<Array>} List of active games
	 */
	async listActiveGames() {
		const keys = await this.redis.keys(`${this.keyPrefix}game:*`);
		const games = [];
		
		for (const key of keys) {
			const gameData = await this.redis.hgetall(key);
			if (gameData.status === 'active') {
				games.push({
					id: gameData.id,
					createdAt: parseInt(gameData.createdAt),
					startedAt: gameData.startedAt ? parseInt(gameData.startedAt) : null,
					playerCount: Object.keys(JSON.parse(gameData.players || '{}')).length,
					config: JSON.parse(gameData.config)
				});
			}
		}
		
		return games;
	}
}

export default GameStateService; 
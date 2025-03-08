/**
 * User Service
 * 
 * Manages user data in MongoDB:
 * - User accounts
 * - Authentication
 * - Token balances
 * - Game statistics
 */

import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export class UserService {
	constructor() {
		this.JWT_SECRET = process.env.JWT_SECRET || 'chesstris-secret-key';
		this.TOKEN_EXPIRY = '7d';
	}
	
	/**
	 * Register a new user
	 * @param {Object} userData - User registration data
	 * @returns {Promise<Object>} User object
	 */
	async registerUser(userData) {
		// Check if user already exists
		const existingUser = await User.findOne({ 
			$or: [
				{ email: userData.email },
				{ username: userData.username }
			]
		});
		
		if (existingUser) {
			if (existingUser.email === userData.email) {
				throw new Error('Email already in use');
			} else {
				throw new Error('Username already taken');
			}
		}
		
		// Create new user
		const user = new User({
			username: userData.username,
			email: userData.email,
			password: userData.password,
			walletAddresses: userData.walletAddress ? [userData.walletAddress] : []
		});
		
		await user.save();
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Login user
	 * @param {string} email - User email
	 * @param {string} password - User password
	 * @returns {Promise<Object>} Auth token and user data
	 */
	async loginUser(email, password) {
		// Find user
		const user = await User.findOne({ email });
		if (!user) {
			throw new Error('Invalid credentials');
		}
		
		// Check password
		const isMatch = await user.comparePassword(password);
		if (!isMatch) {
			throw new Error('Invalid credentials');
		}
		
		// Generate JWT token
		const token = jwt.sign(
			{ id: user._id, email: user.email, username: user.username },
			this.JWT_SECRET,
			{ expiresIn: this.TOKEN_EXPIRY }
		);
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return {
			token,
			user: userObject
		};
	}
	
	/**
	 * Get user by ID
	 * @param {string} userId - User ID
	 * @returns {Promise<Object>} User object
	 */
	async getUserById(userId) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Get user by wallet address
	 * @param {string} walletAddress - Wallet address
	 * @returns {Promise<Object>} User object
	 */
	async getUserByWalletAddress(walletAddress) {
		const user = await User.findByWalletAddress(walletAddress);
		if (!user) {
			return null;
		}
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Update user profile
	 * @param {string} userId - User ID
	 * @param {Object} updateData - Data to update
	 * @returns {Promise<Object>} Updated user object
	 */
	async updateUserProfile(userId, updateData) {
		// Prevent updating sensitive fields
		delete updateData.password;
		delete updateData.email;
		delete updateData.tokenBalance;
		
		const user = await User.findByIdAndUpdate(
			userId,
			{ $set: updateData },
			{ new: true }
		);
		
		if (!user) {
			throw new Error('User not found');
		}
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Change user password
	 * @param {string} userId - User ID
	 * @param {string} currentPassword - Current password
	 * @param {string} newPassword - New password
	 * @returns {Promise<boolean>} Success
	 */
	async changePassword(userId, currentPassword, newPassword) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		// Verify current password
		const isMatch = await user.comparePassword(currentPassword);
		if (!isMatch) {
			throw new Error('Current password is incorrect');
		}
		
		// Update password
		user.password = newPassword;
		await user.save();
		
		return true;
	}
	
	/**
	 * Add wallet address to user
	 * @param {string} userId - User ID
	 * @param {string} walletAddress - Wallet address
	 * @returns {Promise<Object>} Updated user object
	 */
	async addWalletAddress(userId, walletAddress) {
		// Check if wallet is already linked to another user
		const existingUser = await User.findByWalletAddress(walletAddress);
		if (existingUser && existingUser._id.toString() !== userId) {
			throw new Error('Wallet address already linked to another account');
		}
		
		const user = await User.findByIdAndUpdate(
			userId,
			{ $addToSet: { walletAddresses: walletAddress } },
			{ new: true }
		);
		
		if (!user) {
			throw new Error('User not found');
		}
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Remove wallet address from user
	 * @param {string} userId - User ID
	 * @param {string} walletAddress - Wallet address
	 * @returns {Promise<Object>} Updated user object
	 */
	async removeWalletAddress(userId, walletAddress) {
		const user = await User.findByIdAndUpdate(
			userId,
			{ $pull: { walletAddresses: walletAddress } },
			{ new: true }
		);
		
		if (!user) {
			throw new Error('User not found');
		}
		
		// Return user without sensitive data
		const userObject = user.toObject();
		delete userObject.password;
		
		return userObject;
	}
	
	/**
	 * Get user token balance
	 * @param {string} userId - User ID
	 * @returns {Promise<number>} Token balance
	 */
	async getTokenBalance(userId) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		return user.tokenBalance;
	}
	
	/**
	 * Add tokens to user
	 * @param {string} userId - User ID
	 * @param {number} amount - Amount to add
	 * @param {string} source - Source of tokens
	 * @returns {Promise<number>} New token balance
	 */
	async addTokens(userId, amount, source) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		await user.addTokens(amount, source);
		return user.tokenBalance;
	}
	
	/**
	 * Use tokens from user
	 * @param {string} userId - User ID
	 * @param {number} amount - Amount to use
	 * @param {string} purpose - Purpose of token usage
	 * @returns {Promise<number>} New token balance
	 */
	async useTokens(userId, amount, purpose) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		await user.useTokens(amount, purpose);
		return user.tokenBalance;
	}
	
	/**
	 * Update user game stats
	 * @param {string} userId - User ID
	 * @param {Object} gameStats - Game stats to update
	 * @returns {Promise<Object>} Updated game stats
	 */
	async updateGameStats(userId, gameStats) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		// Update game stats
		user.gameStats.gamesPlayed = (user.gameStats.gamesPlayed || 0) + 1;
		
		if (gameStats.won) {
			user.gameStats.gamesWon = (user.gameStats.gamesWon || 0) + 1;
		}
		
		if (gameStats.piecesPlaced) {
			user.gameStats.totalPiecesPlaced = (user.gameStats.totalPiecesPlaced || 0) + gameStats.piecesPlaced;
		}
		
		if (gameStats.rowsCleared) {
			user.gameStats.totalRowsCleared = (user.gameStats.totalRowsCleared || 0) + gameStats.rowsCleared;
		}
		
		if (gameStats.capturedPieces) {
			user.gameStats.totalPiecesCaptured = (user.gameStats.totalPiecesCaptured || 0) + gameStats.capturedPieces;
		}
		
		if (gameStats.playTime) {
			user.gameStats.totalPlayTime = (user.gameStats.totalPlayTime || 0) + gameStats.playTime;
		}
		
		await user.save();
		
		return user.gameStats;
	}
	
	/**
	 * Get user game stats
	 * @param {string} userId - User ID
	 * @returns {Promise<Object>} Game stats
	 */
	async getGameStats(userId) {
		const user = await User.findById(userId);
		if (!user) {
			throw new Error('User not found');
		}
		
		return user.gameStats;
	}
	
	/**
	 * Get leaderboard
	 * @param {string} sortBy - Field to sort by
	 * @param {number} limit - Number of results
	 * @returns {Promise<Array>} Leaderboard
	 */
	async getLeaderboard(sortBy = 'gamesWon', limit = 10) {
		const sortField = `gameStats.${sortBy}`;
		
		const leaderboard = await User.find(
			{ [`gameStats.${sortBy}`]: { $exists: true, $gt: 0 } },
			{
				username: 1,
				gameStats: 1,
				_id: 0
			}
		)
		.sort({ [sortField]: -1 })
		.limit(limit);
		
		return leaderboard;
	}
}

export default UserService; 
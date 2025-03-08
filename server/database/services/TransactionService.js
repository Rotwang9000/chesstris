/**
 * Transaction Service
 * 
 * Manages payment transactions in MongoDB:
 * - Payment intents
 * - Transaction verification
 * - Transaction history
 */

import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';

export class TransactionService {
	constructor() {
		this.PAYMENT_INTENT_EXPIRY = 30 * 60 * 1000; // 30 minutes
	}
	
	/**
	 * Create a payment intent
	 * @param {string} userId - User ID
	 * @param {string} paymentMethod - Payment method (solana, etc.)
	 * @param {number} amount - Amount in currency
	 * @param {number} tokenAmount - Amount of tokens
	 * @param {Object} metadata - Additional metadata
	 * @returns {Promise<Object>} Payment intent
	 */
	async createPaymentIntent(userId, paymentMethod, amount, tokenAmount, metadata = {}) {
		// Generate unique reference ID
		const referenceId = uuidv4();
		
		// Create transaction record
		const transaction = new Transaction({
			referenceId,
			userId,
			transactionType: 'purchase',
			status: 'pending',
			paymentMethod,
			amount,
			tokenAmount,
			metadata,
			expiresAt: new Date(Date.now() + this.PAYMENT_INTENT_EXPIRY)
		});
		
		await transaction.save();
		
		return {
			referenceId,
			amount,
			tokenAmount,
			paymentMethod,
			expiresAt: transaction.expiresAt
		};
	}
	
	/**
	 * Verify a transaction
	 * @param {string} referenceId - Reference ID
	 * @param {string} transactionId - Blockchain transaction ID
	 * @param {Object} verificationData - Additional verification data
	 * @returns {Promise<Object>} Verified transaction
	 */
	async verifyTransaction(referenceId, transactionId, verificationData = {}) {
		// Find pending transaction
		const transaction = await Transaction.findOne({
			referenceId,
			status: 'pending',
			expiresAt: { $gt: new Date() }
		});
		
		if (!transaction) {
			throw new Error('Invalid or expired payment intent');
		}
		
		// Update transaction with blockchain data
		transaction.transactionId = transactionId;
		transaction.blockchainData = verificationData;
		transaction.status = 'completed';
		transaction.completedAt = new Date();
		
		await transaction.save();
		
		// Add tokens to user
		const user = await User.findById(transaction.userId);
		if (user) {
			await user.addTokens(
				transaction.tokenAmount,
				`Purchase via ${transaction.paymentMethod}`
			);
		}
		
		return {
			referenceId: transaction.referenceId,
			status: transaction.status,
			tokenAmount: transaction.tokenAmount,
			completedAt: transaction.completedAt
		};
	}
	
	/**
	 * Mark transaction as failed
	 * @param {string} referenceId - Reference ID
	 * @param {string} reason - Failure reason
	 * @returns {Promise<Object>} Failed transaction
	 */
	async markTransactionFailed(referenceId, reason) {
		const transaction = await Transaction.findOne({
			referenceId,
			status: 'pending'
		});
		
		if (!transaction) {
			throw new Error('Transaction not found');
		}
		
		transaction.status = 'failed';
		transaction.failureReason = reason;
		transaction.updatedAt = new Date();
		
		await transaction.save();
		
		return {
			referenceId: transaction.referenceId,
			status: transaction.status,
			failureReason: transaction.failureReason
		};
	}
	
	/**
	 * Get transaction by reference ID
	 * @param {string} referenceId - Reference ID
	 * @returns {Promise<Object>} Transaction
	 */
	async getTransactionByReferenceId(referenceId) {
		const transaction = await Transaction.findOne({ referenceId });
		if (!transaction) {
			throw new Error('Transaction not found');
		}
		
		return transaction;
	}
	
	/**
	 * Get transaction by blockchain transaction ID
	 * @param {string} transactionId - Blockchain transaction ID
	 * @returns {Promise<Object>} Transaction
	 */
	async getTransactionByTransactionId(transactionId) {
		const transaction = await Transaction.findOne({ transactionId });
		if (!transaction) {
			return null;
		}
		
		return transaction;
	}
	
	/**
	 * Get user transaction history
	 * @param {string} userId - User ID
	 * @param {Object} filters - Filters (status, type, etc.)
	 * @param {number} limit - Number of results
	 * @param {number} skip - Number of results to skip
	 * @returns {Promise<Array>} Transaction history
	 */
	async getUserTransactionHistory(userId, filters = {}, limit = 10, skip = 0) {
		const query = { userId, ...filters };
		
		const transactions = await Transaction.find(query)
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(skip);
		
		return transactions;
	}
	
	/**
	 * Record token usage
	 * @param {string} userId - User ID
	 * @param {number} tokenAmount - Amount of tokens
	 * @param {string} purpose - Purpose of token usage
	 * @param {Object} metadata - Additional metadata
	 * @returns {Promise<Object>} Transaction
	 */
	async recordTokenUsage(userId, tokenAmount, purpose, metadata = {}) {
		// Create transaction record
		const transaction = new Transaction({
			referenceId: uuidv4(),
			userId,
			transactionType: 'usage',
			status: 'completed',
			paymentMethod: 'tokens',
			tokenAmount: -tokenAmount,
			metadata: {
				purpose,
				...metadata
			},
			completedAt: new Date()
		});
		
		await transaction.save();
		
		// Deduct tokens from user
		const user = await User.findById(userId);
		if (user) {
			await user.useTokens(tokenAmount, purpose);
		}
		
		return transaction;
	}
	
	/**
	 * Calculate token amount for purchase
	 * @param {number} amount - Amount in currency
	 * @param {string} currency - Currency code
	 * @returns {Promise<number>} Token amount
	 */
	async calculateTokenAmount(amount, currency = 'USD') {
		// Standard packages
		const packages = {
			'5': 500,    // $5 = 500 tokens
			'10': 1100,  // $10 = 1100 tokens (10% bonus)
			'20': 2400,  // $20 = 2400 tokens (20% bonus)
			'50': 6500,  // $50 = 6500 tokens (30% bonus)
			'100': 15000 // $100 = 15000 tokens (50% bonus)
		};
		
		// Check if amount matches a standard package
		if (packages[amount.toString()]) {
			return packages[amount.toString()];
		}
		
		// Custom amount calculation (base rate: 100 tokens per $1)
		let tokenAmount = amount * 100;
		
		// Apply bonus tiers
		if (amount >= 100) {
			tokenAmount *= 1.5; // 50% bonus
		} else if (amount >= 50) {
			tokenAmount *= 1.3; // 30% bonus
		} else if (amount >= 20) {
			tokenAmount *= 1.2; // 20% bonus
		} else if (amount >= 10) {
			tokenAmount *= 1.1; // 10% bonus
		}
		
		return Math.floor(tokenAmount);
	}
	
	/**
	 * Clean up expired payment intents
	 * @returns {Promise<number>} Number of expired intents
	 */
	async cleanupExpiredIntents() {
		const result = await Transaction.updateMany(
			{
				status: 'pending',
				expiresAt: { $lt: new Date() }
			},
			{
				$set: {
					status: 'expired',
					updatedAt: new Date()
				}
			}
		);
		
		return result.nModified || 0;
	}
}

export default TransactionService; 
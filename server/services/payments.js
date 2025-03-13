/**
 * Payments Service
 * 
 * Server-side handling for Solana payments:
 * - Transaction verification
 * - User token balance management
 * - Transaction history
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';

// Payment configuration
const paymentConfig = {
	solana: {
		rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
		receivingAddress: process.env.SOLANA_WALLET_ADDRESS || 'GsbwXfJraMohNnrpGCwvGqNGNQxD1w3w6EQ5AdHxXsv9',
		minConfirmations: 1, // Minimum confirmations required for transaction
		tokenRatios: {
			// USD to token conversion rates with bonuses for larger purchases
			10: 100, // $10 = 1000 tokens (100 tokens per $)
			25: 110, // $25 = 2750 tokens (110 tokens per $)
			50: 120  // $50 = 6000 tokens (120 tokens per $)
		},
		// Mapping from USD to SOL for package amounts (updated periodically)
		exchangeRates: {
			10: 0.1,  // $10 = 0.1 SOL
			25: 0.25, // $25 = 0.25 SOL
			50: 0.5   // $50 = 0.5 SOL
		}
	},
	// Add other payment methods in the future
};

// Transaction database (would use a real database in production)
const transactionDb = {
	pending: new Map(),
	completed: new Map(),
	failed: new Map()
};

// User token balances (would be in a real database in production)
const userTokens = new Map();

// Initialize Solana connection
const solanaConnection = new Connection(paymentConfig.solana.rpcUrl, 'confirmed');

/**
 * Create a payment intent for Solana
 * @param {string} userId - User making the payment
 * @param {number} amount - Amount in USD
 * @param {string} packageType - Package type (e.g., 'Starter', 'Popular', 'Pro')
 * @returns {Promise<Object>} Payment intent details
 */
export async function createSolanaPaymentIntent(userId, amount, packageType) {
	try {
		// Validate amount is one of the supported package amounts
		if (!paymentConfig.solana.tokenRatios[amount]) {
			throw new Error(`Invalid amount: ${amount}. Supported amounts are: ${Object.keys(paymentConfig.solana.tokenRatios).join(', ')}`);
		}
		
		// Generate a unique reference ID for this payment
		const referenceId = `shaktris-${uuidv4().slice(0, 8)}`;
		
		// Calculate tokens based on amount
		const tokensPerDollar = paymentConfig.solana.tokenRatios[amount];
		const tokenAmount = amount * tokensPerDollar;
		
		// Calculate SOL amount from USD
		const solAmount = paymentConfig.solana.exchangeRates[amount] || 
			(amount * 0.01); // Fallback: $1 = 0.01 SOL
		
		// Create payment intent
		const paymentIntent = {
			id: referenceId,
			userId,
			amount,
			solAmount,
			tokens: tokenAmount,
			packageType,
			status: 'pending',
			createdAt: new Date().toISOString(),
			expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
			currency: 'USD',
			paymentMethod: 'SOL',
			receivingAddress: paymentConfig.solana.receivingAddress
		};
		
		// Store in pending transactions
		transactionDb.pending.set(referenceId, paymentIntent);
		
		return {
			success: true,
			paymentIntent
		};
	} catch (error) {
		console.error('Error creating Solana payment intent:', error);
		return {
			success: false,
			error: error.message
		};
	}
}

/**
 * Verify a Solana transaction
 * @param {string} transactionId - Solana transaction signature
 * @param {string} referenceId - Reference ID from payment intent
 * @returns {Promise<Object>} Verification result
 */
export async function verifySolanaTransaction(transactionId, referenceId) {
	try {
		// Check if we have a pending payment with this reference ID
		if (!transactionDb.pending.has(referenceId)) {
			throw new Error(`No pending payment found with reference ID: ${referenceId}`);
		}
		
		const paymentIntent = transactionDb.pending.get(referenceId);
		
		// Check if transaction exists on Solana blockchain
		try {
			const transaction = await solanaConnection.getTransaction(transactionId, {
				commitment: 'confirmed'
			});
			
			if (!transaction) {
				throw new Error('Transaction not found on blockchain');
			}
			
			// Verify transaction details
			const { meta } = transaction;
			if (!meta) {
				throw new Error('Transaction metadata not available');
			}
			
			// Extract pre and post balances for the receiving address
			const receivingPubkey = new PublicKey(paymentConfig.solana.receivingAddress);
			
			// Find the receiving address in the accounts
			let receiverIndex = -1;
			for (let i = 0; i < transaction.transaction.message.accountKeys.length; i++) {
				if (transaction.transaction.message.accountKeys[i].equals(receivingPubkey)) {
					receiverIndex = i;
					break;
				}
			}
			
			if (receiverIndex === -1) {
				throw new Error('Receiving address not found in transaction');
			}
			
			// Calculate the net change in lamports for receiver
			const preBalance = meta.preBalances[receiverIndex];
			const postBalance = meta.postBalances[receiverIndex];
			const amountReceived = (postBalance - preBalance) / LAMPORTS_PER_SOL;
			
			// Validate amount (with some tolerance for fees)
			const expectedAmount = paymentIntent.solAmount;
			const tolerance = 0.0001; // Small tolerance for rounding
			
			if (Math.abs(amountReceived - expectedAmount) > tolerance) {
				throw new Error(`Amount mismatch: expected ${expectedAmount} SOL, received ${amountReceived} SOL`);
			}
			
			// Transaction is valid, update payment intent
			const completedPayment = {
				...paymentIntent,
				status: 'completed',
				completedAt: new Date().toISOString(),
				transactionId,
				amountReceived
			};
			
			// Move to completed transactions
			transactionDb.pending.delete(referenceId);
			transactionDb.completed.set(referenceId, completedPayment);
			
			// Add tokens to user's balance
			addUserTokens(paymentIntent.userId, paymentIntent.tokens);
			
			// Return success with completed payment details
			return {
				success: true,
				payment: completedPayment
			};
		} catch (error) {
			console.error('Error verifying transaction on blockchain:', error);
			
			// Move to failed transactions
			const failedPayment = {
				...paymentIntent,
				status: 'failed',
				failedAt: new Date().toISOString(),
				transactionId,
				error: error.message
			};
			
			transactionDb.pending.delete(referenceId);
			transactionDb.failed.set(referenceId, failedPayment);
			
			throw error;
		}
	} catch (error) {
		console.error('Error verifying Solana transaction:', error);
		return {
			success: false,
			error: error.message
		};
	}
}

/**
 * Add tokens to a user's balance
 * @param {string} userId - User ID
 * @param {number} amount - Token amount to add
 * @returns {number} New token balance
 */
export function addUserTokens(userId, amount) {
	const currentBalance = userTokens.get(userId) || 0;
	const newBalance = currentBalance + amount;
	userTokens.set(userId, newBalance);
	return newBalance;
}

/**
 * Get a user's token balance
 * @param {string} userId - User ID
 * @returns {number} Token balance
 */
export function getUserTokenBalance(userId) {
	return userTokens.get(userId) || 0;
}

/**
 * Get transaction history for a user
 * @param {string} userId - User ID
 * @param {string} status - Optional filter by status ('pending', 'completed', 'failed')
 * @returns {Array} Transaction history
 */
export function getUserTransactionHistory(userId, status = null) {
	const history = [];
	
	// Helper to filter and add transactions
	const addTransactions = (transactions, status) => {
		for (const [_, transaction] of transactions) {
			if (transaction.userId === userId) {
				history.push({ ...transaction, status });
			}
		}
	};
	
	// Add transactions based on status filter
	if (!status || status === 'pending') {
		addTransactions(transactionDb.pending, 'pending');
	}
	
	if (!status || status === 'completed') {
		addTransactions(transactionDb.completed, 'completed');
	}
	
	if (!status || status === 'failed') {
		addTransactions(transactionDb.failed, 'failed');
	}
	
	// Sort by date (newest first)
	return history.sort((a, b) => {
		const dateA = new Date(a.createdAt);
		const dateB = new Date(b.createdAt);
		return dateB - dateA;
	});
}

/**
 * Calculate token amount for a given USD amount
 * @param {number} usdAmount - Amount in USD
 * @returns {number} Token amount
 */
export function calculateTokenAmount(usdAmount) {
	// Find the closest package amount (exact match or lower)
	const packageAmounts = Object.keys(paymentConfig.solana.tokenRatios)
		.map(Number)
		.sort((a, b) => a - b);
	
	// Find the appropriate package rate to use
	let packageAmount;
	
	// If the amount is greater than the largest package, use the largest package rate
	if (usdAmount >= packageAmounts[packageAmounts.length - 1]) {
		packageAmount = packageAmounts[packageAmounts.length - 1];
	} 
	// If the amount is less than the smallest package, use the smallest package rate
	else if (usdAmount <= packageAmounts[0]) {
		packageAmount = packageAmounts[0];
	} 
	// Otherwise, find the closest package without going over
	else {
		// Find the largest package that's smaller than or equal to the amount
		for (let i = packageAmounts.length - 1; i >= 0; i--) {
			if (packageAmounts[i] <= usdAmount) {
				packageAmount = packageAmounts[i];
				break;
			}
		}
		
		// If we're between packages (e.g., $20 is between $10 and $25),
		// check if we should use the next higher package rate
		const nextPackageIndex = packageAmounts.findIndex(amount => amount > usdAmount);
		if (nextPackageIndex !== -1) {
			const nextPackage = packageAmounts[nextPackageIndex];
			// If we're closer to the next package, use its rate
			if (nextPackage - usdAmount < usdAmount - packageAmount) {
				packageAmount = nextPackage;
			}
		}
	}
	
	// For amounts between standard packages, use the next higher package rate
	// This ensures better value for customers
	if (!packageAmounts.includes(usdAmount)) {
		// Find the next higher package
		const nextHigherPackage = packageAmounts.find(amount => amount > usdAmount);
		if (nextHigherPackage && usdAmount > 10) {
			// For amounts over $10, use the next higher package rate
			packageAmount = nextHigherPackage;
		}
	}
	
	const tokensPerDollar = paymentConfig.solana.tokenRatios[packageAmount];
	return usdAmount * tokensPerDollar;
} 
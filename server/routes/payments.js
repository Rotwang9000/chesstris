/**
 * Payment API Routes
 * 
 * API endpoints for handling payment operations:
 * - Creating payment intents
 * - Verifying transactions
 * - Getting transaction history
 * - Getting token balances
 */

const express = require('express');
const router = express.Router();
const paymentService = require('../services/payments');

// Authentication middleware (simple version for demo)
function authenticate(req, res, next) {
	// In a real app, you would validate a JWT or session
	const userId = req.headers['user-id'];
	
	if (!userId) {
		return res.status(401).json({
			success: false,
			error: 'Authentication required'
		});
	}
	
	// Add userId to request object
	req.userId = userId;
	next();
}

/**
 * Create a payment intent
 * 
 * POST /api/payments/intent
 * 
 * Request body:
 * {
 *   amount: number,      // Amount in USD
 *   packageType: string, // Package type (e.g., 'Starter', 'Popular', 'Pro')
 *   currency: string     // 'USD' (default) or other currency code
 * }
 */
router.post('/intent', authenticate, async (req, res) => {
	try {
		const { amount, packageType = 'Custom', currency = 'USD' } = req.body;
		
		if (!amount || isNaN(parseFloat(amount))) {
			return res.status(400).json({
				success: false,
				error: 'Valid amount is required'
			});
		}
		
		// Currently only supporting SOL payments
		const result = await paymentService.createSolanaPaymentIntent(
			req.userId,
			parseFloat(amount),
			packageType
		);
		
		if (!result.success) {
			return res.status(400).json(result);
		}
		
		res.status(200).json(result);
	} catch (error) {
		console.error('Error creating payment intent:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

/**
 * Verify a transaction
 * 
 * POST /api/payments/verify
 * 
 * Request body:
 * {
 *   transactionId: string, // Solana transaction signature
 *   referenceId: string    // Reference ID from payment intent
 * }
 */
router.post('/verify', authenticate, async (req, res) => {
	try {
		const { transactionId, referenceId } = req.body;
		
		if (!transactionId || !referenceId) {
			return res.status(400).json({
				success: false,
				error: 'Transaction ID and reference ID are required'
			});
		}
		
		const result = await paymentService.verifySolanaTransaction(
			transactionId,
			referenceId
		);
		
		res.status(result.success ? 200 : 400).json(result);
	} catch (error) {
		console.error('Error verifying transaction:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

/**
 * Get token balance
 * 
 * GET /api/payments/balance
 */
router.get('/balance', authenticate, (req, res) => {
	try {
		const balance = paymentService.getUserTokenBalance(req.userId);
		
		res.status(200).json({
			success: true,
			balance: balance
		});
	} catch (error) {
		console.error('Error getting token balance:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

/**
 * Get transaction history
 * 
 * GET /api/payments/history
 * 
 * Query parameters:
 * - status: optional filter by status ('pending', 'completed', 'failed')
 */
router.get('/history', authenticate, (req, res) => {
	try {
		const { status } = req.query;
		const history = paymentService.getUserTransactionHistory(req.userId, status);
		
		res.status(200).json({
			success: true,
			transactions: history
		});
	} catch (error) {
		console.error('Error getting transaction history:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

/**
 * Calculate token amount for a given USD amount
 * 
 * GET /api/payments/calculate-tokens
 * 
 * Query parameters:
 * - amount: USD amount
 */
router.get('/calculate-tokens', (req, res) => {
	try {
		const { amount } = req.query;
		
		if (!amount || isNaN(parseFloat(amount))) {
			return res.status(400).json({
				success: false,
				error: 'Valid amount is required'
			});
		}
		
		const tokens = paymentService.calculateTokenAmount(parseFloat(amount));
		
		res.status(200).json({
			success: true,
			amount: parseFloat(amount),
			tokens: tokens
		});
	} catch (error) {
		console.error('Error calculating tokens:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

module.exports = router; 
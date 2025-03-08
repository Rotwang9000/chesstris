/**
 * Transaction Routes
 * 
 * API endpoints for payment transactions:
 * - Payment intents
 * - Transaction verification
 * - Transaction history
 */

import express from 'express';
import auth from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();

/**
 * @route POST /api/transactions/create-payment-intent
 * @desc Create a payment intent
 * @access Private
 */
router.post('/create-payment-intent', auth, async (req, res) => {
	try {
		const { paymentMethod, amount, tokenAmount, metadata } = req.body;
		
		// Validate input
		if (!paymentMethod || !amount || !tokenAmount) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Create payment intent
		const paymentIntent = await req.services.transaction.createPaymentIntent(
			req.user.id,
			paymentMethod,
			parseFloat(amount),
			parseInt(tokenAmount),
			metadata
		);
		
		res.json(paymentIntent);
	} catch (error) {
		console.error('Error creating payment intent:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/transactions/verify-payment
 * @desc Verify a payment
 * @access Private
 */
router.post('/verify-payment', auth, async (req, res) => {
	try {
		const { referenceId, transactionId, signature } = req.body;
		
		// Validate input
		if (!referenceId || !transactionId) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Verify payment
		const result = await req.services.transaction.verifyPayment(
			referenceId,
			transactionId,
			signature
		);
		
		if (!result.success) {
			return res.status(400).json({ message: result.message });
		}
		
		res.json({ 
			success: true, 
			transaction: result.transaction,
			tokenAmount: result.tokenAmount
		});
	} catch (error) {
		console.error('Error verifying payment:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/transactions/history
 * @desc Get transaction history for a user
 * @access Private
 */
router.get('/history', auth, async (req, res) => {
	try {
		// Get transaction history
		const transactions = await req.services.transaction.getUserTransactions(req.user.id);
		
		res.json(transactions);
	} catch (error) {
		console.error('Error getting transaction history:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/transactions/:transactionId
 * @desc Get a transaction by ID
 * @access Private
 */
router.get('/:transactionId', auth, async (req, res) => {
	try {
		const { transactionId } = req.params;
		
		// Get transaction
		const transaction = await req.services.transaction.getTransaction(transactionId);
		
		if (!transaction) {
			return res.status(404).json({ message: 'Transaction not found' });
		}
		
		// Check if user is authorized to view this transaction
		if (req.user.role !== 'admin' && transaction.userId !== req.user.id) {
			return res.status(403).json({ message: 'Not authorized' });
		}
		
		res.json(transaction);
	} catch (error) {
		console.error('Error getting transaction:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route POST /api/transactions/solana/validate
 * @desc Validate a Solana transaction
 * @access Private
 */
router.post('/solana/validate', auth, async (req, res) => {
	try {
		const { signature, amount, purpose } = req.body;
		
		// Validate input
		if (!signature || !amount) {
			return res.status(400).json({ message: 'All fields are required' });
		}
		
		// Validate transaction
		const result = await req.services.transaction.validateSolanaTransaction(
			signature,
			parseFloat(amount),
			purpose
		);
		
		if (!result.success) {
			return res.status(400).json({ message: result.message });
		}
		
		res.json({ 
			success: true,
			transaction: result.transaction
		});
	} catch (error) {
		console.error('Error validating Solana transaction:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

/**
 * @route GET /api/transactions/stats
 * @desc Get transaction statistics
 * @access Admin
 */
router.get('/stats', adminAuth, async (req, res) => {
	try {
		// Get transaction stats
		const stats = await req.services.transaction.getTransactionStats();
		
		res.json(stats);
	} catch (error) {
		console.error('Error getting transaction stats:', error);
		res.status(500).json({ message: 'Server error' });
	}
});

export default router; 
/**
 * Transaction Model
 * 
 * Represents a payment transaction in the Chess-tris game:
 * - Purchase of tokens
 * - Item purchases
 * - Withdrawals
 */

import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
	referenceId: {
		type: String,
		required: true,
		unique: true
	},
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	transactionType: {
		type: String,
		enum: ['purchase', 'withdrawal', 'item_purchase', 'adjustment'],
		required: true
	},
	status: {
		type: String,
		enum: ['pending', 'completed', 'failed', 'refunded'],
		default: 'pending'
	},
	paymentMethod: {
		type: String,
		enum: ['SOL', 'BASE', 'STRIPE', 'ADMIN', 'SYSTEM'],
		required: true
	},
	amount: {
		type: Number,
		required: true
	},
	amountCurrency: {
		type: String,
		default: 'USD'
	},
	cryptoAmount: {
		type: Number
	},
	cryptoCurrency: {
		type: String
	},
	tokens: {
		type: Number
	},
	fee: {
		type: Number
	},
	transactionId: {
		type: String
	},
	blockchainDetails: {
		fromAddress: String,
		toAddress: String,
		confirmations: Number,
		blockNumber: Number,
		blockHash: String,
		transactionHash: String
	},
	item: {
		itemId: String,
		itemType: String,
		itemName: String
	},
	metadata: {
		type: Map,
		of: mongoose.Schema.Types.Mixed
	},
	notes: String,
	errorDetails: String,
	expiresAt: Date,
	completedAt: Date,
	failedAt: Date,
	refundedAt: Date,
	createdAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true
});

// Create indexes
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ transactionId: 1 }, { sparse: true });
TransactionSchema.index({ 'blockchainDetails.transactionHash': 1 }, { sparse: true });

// Static method to find pending transactions for a user
TransactionSchema.statics.findPendingForUser = function(userId) {
	return this.find({
		userId: userId,
		status: 'pending'
	}).sort({ createdAt: -1 });
};

// Static method to get transaction history for a user
TransactionSchema.statics.getHistory = function(userId, status = null, limit = 20) {
	const query = { userId: userId };
	
	if (status) {
		query.status = status;
	}
	
	return this.find(query)
		.sort({ createdAt: -1 })
		.limit(limit);
};

// Static method to complete a transaction
TransactionSchema.statics.completeTransaction = async function(referenceId, transactionId, details = {}) {
	return this.findOneAndUpdate(
		{ referenceId: referenceId },
		{
			$set: {
				status: 'completed',
				completedAt: new Date(),
				transactionId: transactionId,
				...details
			}
		},
		{ new: true }
	);
};

// Create and export model
const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction; 
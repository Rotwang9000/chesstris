/**
 * Advertiser Model
 * 
 * Stores information about advertisers and their bids:
 * - Advertiser details
 * - Bid information
 * - Ad content
 */

import mongoose from 'mongoose';
const { Schema } = mongoose;

const AdvertiserSchema = new Schema({
	// Advertiser information
	name: {
		type: String,
		required: true,
		trim: true
	},
	email: {
		type: String,
		required: true,
		trim: true,
		lowercase: true
	},
	walletAddress: {
		type: String,
		required: true,
		trim: true
	},
	
	// Ad content
	adImage: {
		type: String, // URL to the image
		required: true
	},
	adLink: {
		type: String,
		required: true,
		trim: true
	},
	adText: {
		type: String,
		required: true,
		trim: true,
		maxlength: 64
	},
	
	// Bid information
	bidAmount: {
		type: Number, // Amount in SOL
		required: true,
		min: 0.01
	},
	cellCount: {
		type: Number, // Number of cells they want to sponsor
		required: true,
		min: 1
	},
	bidStatus: {
		type: String,
		enum: ['active', 'paused', 'expired', 'rejected'],
		default: 'active'
	},
	
	// Tracking
	impressions: {
		type: Number,
		default: 0
	},
	clicks: {
		type: Number,
		default: 0
	},
	cellsSponsored: {
		type: Number,
		default: 0
	},
	
	// Timestamps
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	},
	expiresAt: {
		type: Date
	}
});

// Calculate cost per cell
AdvertiserSchema.virtual('costPerCell').get(function() {
	return this.bidAmount / this.cellCount;
});

// Update timestamp on save
AdvertiserSchema.pre('save', function(next) {
	this.updatedAt = Date.now();
	next();
});

const Advertiser = mongoose.model('Advertiser', AdvertiserSchema);

export default Advertiser; 
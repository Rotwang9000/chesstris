/**
 * User Model
 * 
 * Represents a player in the Chess-tris game:
 * - Authentication information
 * - Game statistics
 * - Token balance and purchase history
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
	username: {
		type: String,
		required: true,
		trim: true,
		minlength: 3,
		maxlength: 20,
		match: /^[a-zA-Z0-9_-]+$/,
		unique: true
	},
	email: {
		type: String,
		trim: true,
		lowercase: true,
		validate: {
			validator: function(v) {
				return /^\S+@\S+\.\S+$/.test(v);
			},
			message: props => `${props.value} is not a valid email address!`
		},
		sparse: true // Allows null/undefined values
	},
	password: {
		type: String,
		minlength: 8
	},
	walletAddresses: {
		solana: String,
		ethereum: String
	},
	tokenBalance: {
		type: Number,
		default: 0,
		min: 0
	},
	gameStats: {
		gamesPlayed: { type: Number, default: 0 },
		wins: { type: Number, default: 0 },
		losses: { type: Number, default: 0 },
		piecesPlaced: { type: Number, default: 0 },
		piecesCaptured: { type: Number, default: 0 },
		rowsCleared: { type: Number, default: 0 }
	},
	lastLogin: Date,
	isActive: {
		type: Boolean,
		default: true
	},
	roles: {
		type: [String],
		enum: ['user', 'admin', 'moderator'],
		default: ['user']
	},
	currentGameSession: {
		type: String,
		default: null
	},
	purchasedItems: [{
		itemId: String,
		itemType: {
			type: String,
			enum: ['theme', 'piece', 'effect', 'board']
		},
		purchaseDate: {
			type: Date,
			default: Date.now
		},
		price: Number
	}],
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: {
		type: Date,
		default: Date.now
	}
}, {
	timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
	if (!this.isModified('password')) return next();
	
	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

// Method to check password
UserSchema.methods.comparePassword = async function(password) {
	return bcrypt.compare(password, this.password);
};

// Method to add tokens to balance
UserSchema.methods.addTokens = function(amount) {
	this.tokenBalance += amount;
	return this.save();
};

// Method to use tokens (returns false if insufficient)
UserSchema.methods.useTokens = function(amount) {
	if (this.tokenBalance < amount) return false;
	
	this.tokenBalance -= amount;
	return this.save();
};

// Static method to find by wallet address
UserSchema.statics.findByWalletAddress = function(chain, address) {
	const query = {};
	query[`walletAddresses.${chain}`] = address;
	return this.findOne(query);
};

// Create and export model
const User = mongoose.model('User', UserSchema);
export default User; 
/**
 * Game Model
 * 
 * Represents a game session in Chess-tris:
 * - Game configuration
 * - Player information
 * - Game state snapshots
 */

import mongoose from 'mongoose';

const GameSchema = new mongoose.Schema({
	gameId: {
		type: String,
		required: true,
		unique: true
	},
	status: {
		type: String,
		enum: ['pending', 'active', 'completed', 'abandoned'],
		default: 'pending'
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	startedAt: Date,
	endedAt: Date,
	players: [{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User'
		},
		socketId: String,
		username: String,
		color: String,
		homeZone: {
			x: Number,
			y: Number,
			width: Number,
			height: Number
		},
		joined: {
			type: Date,
			default: Date.now
		},
		left: Date,
		isActive: {
			type: Boolean,
			default: true
		},
		score: {
			type: Number,
			default: 0
		},
		pieces: [{
			id: String,
			type: String,
			x: Number,
			y: Number,
			captured: {
				type: Boolean,
				default: false
			},
			capturedAt: Date,
			capturedBy: String
		}]
	}],
	config: {
		boardWidth: {
			type: Number,
			default: 24
		},
		boardHeight: {
			type: Number,
			default: 24
		},
		homeZoneWidth: {
			type: Number,
			default: 8
		},
		homeZoneHeight: {
			type: Number,
			default: 2
		},
		tetrominoSpawnRate: {
			type: Number,
			default: 5000 // ms
		},
		rowClearThreshold: {
			type: Number,
			default: 8
		},
		sponsorChance: {
			type: Number,
			default: 0.2
		},
		potionChance: {
			type: Number,
			default: 0.1
		},
		homeZoneDegradationInterval: {
			type: Number,
			default: 300000 // 5 minutes
		}
	},
	snapshots: [{
		timestamp: {
			type: Date,
			default: Date.now
		},
		boardState: mongoose.Schema.Types.Mixed,
		fallingPiece: mongoose.Schema.Types.Mixed,
		players: mongoose.Schema.Types.Mixed
	}],
	events: [{
		eventType: {
			type: String,
			enum: [
				'player_join',
				'player_leave',
				'move_piece',
				'capture_piece',
				'tetromino_lock',
				'home_zone_degrade',
				'row_clear',
				'potion_used'
			]
		},
		timestamp: {
			type: Date,
			default: Date.now
		},
		player: String,
		x: Number,
		y: Number,
		pieceId: String,
		details: mongoose.Schema.Types.Mixed
	}],
	winners: [{
		userId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User'
		},
		username: String,
		score: Number
	}],
	metadata: {
		type: Map,
		of: mongoose.Schema.Types.Mixed
	}
}, {
	timestamps: true
});

// Create indexes
GameSchema.index({ status: 1 });
GameSchema.index({ createdAt: -1 });
GameSchema.index({ 'players.userId': 1 });

// Static method to find active games
GameSchema.statics.findActiveGames = function() {
	return this.find({ status: 'active' });
};

// Static method to find recent games for a user
GameSchema.statics.findRecentForUser = function(userId, limit = 10) {
	return this.find({
		'players.userId': userId
	})
	.sort({ createdAt: -1 })
	.limit(limit);
};

// Static method to create a snapshot of the current game state
GameSchema.methods.createSnapshot = async function(boardState, fallingPiece, players) {
	const snapshot = {
		timestamp: new Date(),
		boardState,
		fallingPiece,
		players
	};
	
	this.snapshots.push(snapshot);
	
	// Limit number of snapshots to avoid document size issues
	if (this.snapshots.length > 50) {
		this.snapshots.shift();
	}
	
	return this.save();
};

// Static method to record a game event
GameSchema.methods.recordEvent = function(eventData) {
	this.events.push({
		...eventData,
		timestamp: new Date()
	});
	
	// Limit number of events to avoid document size issues
	if (this.events.length > 500) {
		this.events.shift();
	}
	
	return this.save();
};

// Create and export model
const Game = mongoose.model('Game', GameSchema);
export default Game; 
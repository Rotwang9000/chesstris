/**
 * Analytics Model
 * 
 * Tracks game statistics and player behavior for analytics:
 * - Game session metrics
 * - Player engagement
 * - Feature usage
 * - Performance metrics
 */

import mongoose from 'mongoose';

const AnalyticsSchema = new mongoose.Schema({
	// Session information
	sessionId: {
		type: String,
		required: true,
		unique: true
	},
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		sparse: true // Allow null for anonymous users
	},
	sessionType: {
		type: String,
		enum: ['game', 'marketplace', 'profile', 'tutorial'],
		required: true
	},
	
	// Time tracking
	startTime: {
		type: Date,
		default: Date.now
	},
	endTime: Date,
	duration: Number, // in seconds
	
	// Game metrics (for game sessions)
	gameId: {
		type: String,
		sparse: true
	},
	gameMetrics: {
		piecesPlaced: {
			type: Number,
			default: 0
		},
		piecesCaptured: {
			type: Number,
			default: 0
		},
		tetrominosPlaced: {
			type: Number,
			default: 0
		},
		rowsCleared: {
			type: Number,
			default: 0
		},
		potionsUsed: {
			type: Number,
			default: 0
		},
		score: {
			type: Number,
			default: 0
		},
		result: {
			type: String,
			enum: ['win', 'loss', 'draw', 'abandoned'],
			sparse: true
		}
	},
	
	// Marketplace metrics
	marketplaceMetrics: {
		itemsViewed: {
			type: Number,
			default: 0
		},
		categoriesViewed: [String],
		itemsAddedToCart: {
			type: Number,
			default: 0
		},
		purchaseAttempts: {
			type: Number,
			default: 0
		},
		purchasesCompleted: {
			type: Number,
			default: 0
		},
		totalSpent: {
			type: Number,
			default: 0
		}
	},
	
	// User interface metrics
	uiMetrics: {
		buttonClicks: {
			type: Map,
			of: Number,
			default: {}
		},
		pageViews: {
			type: Map,
			of: Number,
			default: {}
		},
		modalInteractions: {
			type: Map,
			of: Number,
			default: {}
		},
		timeSpentPerScreen: {
			type: Map,
			of: Number,
			default: {}
		}
	},
	
	// Performance metrics
	performanceMetrics: {
		averageFps: Number,
		loadTimes: {
			type: Map,
			of: Number,
			default: {}
		},
		errors: [{
			errorType: String,
			message: String,
			timestamp: Date,
			context: mongoose.Schema.Types.Mixed
		}]
	},
	
	// Device information
	deviceInfo: {
		browser: String,
		os: String,
		device: String,
		screenResolution: String,
		isMobile: Boolean
	},
	
	// Location data (if permitted)
	locationInfo: {
		country: String,
		region: String,
		timezone: String
	},
	
	// Additional metadata
	metadata: {
		type: Map,
		of: mongoose.Schema.Types.Mixed,
		default: {}
	},
	
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

// Create indexes
AnalyticsSchema.index({ userId: 1, startTime: -1 });
AnalyticsSchema.index({ sessionType: 1 });
AnalyticsSchema.index({ gameId: 1 }, { sparse: true });
AnalyticsSchema.index({ startTime: -1 });

// Static method to find sessions for a user
AnalyticsSchema.statics.findSessionsForUser = function(userId, limit = 20) {
	return this.find({ userId })
		.sort({ startTime: -1 })
		.limit(limit);
};

// Static method to find sessions for a game
AnalyticsSchema.statics.findSessionsForGame = function(gameId) {
	return this.find({ gameId })
		.sort({ startTime: -1 });
};

// Static method to get aggregate metrics for a time period
AnalyticsSchema.statics.getAggregateMetrics = async function(startDate, endDate, groupBy = 'day') {
	const matchStage = {
		$match: {
			startTime: {
				$gte: startDate,
				$lte: endDate
			}
		}
	};
	
	let groupByFormat;
	switch(groupBy) {
		case 'hour':
			groupByFormat = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$startTime' } };
			break;
		case 'day':
			groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } };
			break;
		case 'week':
			groupByFormat = { $dateToString: { format: '%Y-%U', date: '$startTime' } };
			break;
		case 'month':
			groupByFormat = { $dateToString: { format: '%Y-%m', date: '$startTime' } };
			break;
		default:
			groupByFormat = { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } };
	}
	
	const groupStage = {
		$group: {
			_id: groupByFormat,
			sessionCount: { $sum: 1 },
			uniqueUsers: { $addToSet: '$userId' },
			avgDuration: { $avg: '$duration' },
			totalGameSessions: {
				$sum: {
					$cond: [{ $eq: ['$sessionType', 'game'] }, 1, 0]
				}
			},
			totalMarketplaceSessions: {
				$sum: {
					$cond: [{ $eq: ['$sessionType', 'marketplace'] }, 1, 0]
				}
			},
			avgScore: {
				$avg: {
					$cond: [
						{ $eq: ['$sessionType', 'game'] },
						'$gameMetrics.score',
						null
					]
				}
			},
			totalPiecesPlaced: { $sum: '$gameMetrics.piecesPlaced' },
			totalPiecesCaptured: { $sum: '$gameMetrics.piecesCaptured' },
			totalRowsCleared: { $sum: '$gameMetrics.rowsCleared' }
		}
	};
	
	const projectStage = {
		$project: {
			_id: 0,
			period: '$_id',
			sessionCount: 1,
			uniqueUserCount: { $size: '$uniqueUsers' },
			avgDuration: 1,
			totalGameSessions: 1,
			totalMarketplaceSessions: 1,
			avgScore: 1,
			totalPiecesPlaced: 1,
			totalPiecesCaptured: 1,
			totalRowsCleared: 1
		}
	};
	
	const sortStage = {
		$sort: { period: 1 }
	};
	
	return this.aggregate([
		matchStage,
		groupStage,
		projectStage,
		sortStage
	]);
};

// Create and export model
const Analytics = mongoose.model('Analytics', AnalyticsSchema);
export default Analytics; 
/**
 * Database Services Index
 * 
 * This file exports all database services for easier importing.
 */

import { GameStateService } from '../server/database/services/GameStateService.js';
import { UserService } from '../server/database/services/UserService.js';
import { TransactionService } from '../server/database/services/TransactionService.js';
import { AnalyticsService } from '../server/database/services/AnalyticsService.js';
import { AdvertiserService } from '../server/database/services/AdvertiserService.js';
import * as redis from 'redis';

// Configuration
const config = {
	mongoUri: process.env.NODE_ENV === 'test' 
		? process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/chesstris_test'
		: process.env.MONGO_URI || 'mongodb://localhost:27017/chesstris',
	redisUri: process.env.NODE_ENV === 'test'
		? process.env.TEST_REDIS_URI || 'redis://localhost:6379/1'
		: process.env.REDIS_URI || 'redis://localhost:6379/0',
	stripeSecretKey: process.env.STRIPE_SECRET_KEY,
	stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET
};

// Create Redis client
const createRedisClient = (uri) => {
	return redis.createClient({ url: uri });
};

// Service instances
const services = {
	gameState: new GameStateService(createRedisClient(config.redisUri)),
	user: new UserService(config.mongoUri),
	transaction: new TransactionService({
		mongoUri: config.mongoUri,
		stripeSecretKey: config.stripeSecretKey,
		stripeWebhookSecret: config.stripeWebhookSecret
	}),
	analytics: new AnalyticsService(),
	advertiser: new AdvertiserService(createRedisClient(config.redisUri))
};

/**
 * Initialize all database services
 * @returns {Promise<Object>} The initialized services
 */
async function initServices() {
	try {
		// Connect to Redis (explicit connection needed)
		await services.gameState.redis.connect();
		console.log('Connected to Redis successfully');
		
		// MongoDB connection is handled internally by Mongoose
		console.log('MongoDB connection initialized');
		
		return services;
	} catch (error) {
		console.error('Failed to initialize database services:', error);
		throw error;
	}
}

/**
 * Gracefully close database connections
 * @returns {Promise<void>}
 */
async function closeConnections() {
	try {
		// Check if Redis client exists and is connected before trying to quit
		if (services.gameState && 
		    services.gameState.redis && 
		    services.gameState.redis.isOpen) {
			await services.gameState.redis.quit();
			console.log('Redis connection closed');
		}
		// MongoDB connection will be handled by the process
		console.log('Database connections closed');
	} catch (error) {
		console.error('Error closing database connections:', error);
		throw error;
	}
}

// Export services and initialization function
export {
	services,
	initServices,
	closeConnections,
	GameStateService,
	UserService,
	TransactionService,
	AnalyticsService,
	AdvertiserService
}; 
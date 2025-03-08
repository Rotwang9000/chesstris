/**
 * Database Configuration
 * 
 * Sets up MongoDB and Redis for persistent storage:
 * - MongoDB for players, accounts, transactions
 * - Redis for real-time game state
 */

const mongoose = require('mongoose');
const Redis = require('ioredis');
const { promisify } = require('util');

// Configuration (would use environment variables in production)
const config = {
	mongodb: {
		uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chesstris',
		options: {
			useNewUrlParser: true,
			useUnifiedTopology: true
		}
	},
	redis: {
		host: process.env.REDIS_HOST || 'localhost',
		port: process.env.REDIS_PORT || 6379,
		password: process.env.REDIS_PASSWORD || null
	}
};

// MongoDB Connection
let mongoConnection = null;

async function connectMongo() {
	try {
		mongoConnection = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
		console.log('MongoDB connected successfully');
		return mongoConnection;
	} catch (error) {
		console.error('MongoDB connection error:', error);
		
		// Use in-memory fallback in development
		if (process.env.NODE_ENV !== 'production') {
			console.warn('Using in-memory fallback for MongoDB in development');
			return null;
		}
		
		throw error;
	}
}

// Redis Connection
let redisClient = null;

async function connectRedis() {
	try {
		redisClient = new Redis(config.redis);
		
		// Test connection
		await redisClient.ping();
		console.log('Redis connected successfully');
		
		return redisClient;
	} catch (error) {
		console.error('Redis connection error:', error);
		
		// Use in-memory fallback in development
		if (process.env.NODE_ENV !== 'production') {
			console.warn('Using in-memory fallback for Redis in development');
			return createRedisMemoryFallback();
		}
		
		throw error;
	}
}

// In-memory fallback for Redis in development
function createRedisMemoryFallback() {
	const store = new Map();
	
	return {
		get: async (key) => {
			return store.get(key);
		},
		set: async (key, value, mode, duration) => {
			store.set(key, value);
			return 'OK';
		},
		hget: async (hash, key) => {
			const hashStore = store.get(hash) || new Map();
			return hashStore.get(key);
		},
		hset: async (hash, key, value) => {
			let hashStore = store.get(hash);
			if (!hashStore) {
				hashStore = new Map();
				store.set(hash, hashStore);
			}
			hashStore.set(key, value);
			return 1;
		},
		hgetall: async (hash) => {
			const hashStore = store.get(hash) || new Map();
			const result = {};
			for (const [key, value] of hashStore.entries()) {
				result[key] = value;
			}
			return result;
		},
		hdel: async (hash, key) => {
			const hashStore = store.get(hash);
			if (!hashStore) return 0;
			return hashStore.delete(key) ? 1 : 0;
		},
		del: async (key) => {
			return store.delete(key) ? 1 : 0;
		},
		expire: async (key, seconds) => {
			// We don't actually implement expiry in the memory fallback
			return 1;
		},
		ping: async () => 'PONG',
		quit: async () => {}
	};
}

// Initialize all database connections
async function initDatabase() {
	let mongo = null;
	let redis = null;
	
	try {
		// Connect to MongoDB and Redis
		mongo = await connectMongo();
		redis = await connectRedis();
		
		return {
			mongo,
			redis,
			isConnected: {
				mongo: !!mongo,
				redis: !!redis
			}
		};
	} catch (error) {
		console.error('Failed to initialize database connections:', error);
		throw error;
	}
}

// Graceful shutdown
async function closeConnections() {
	try {
		if (mongoConnection) {
			await mongoose.connection.close();
			console.log('MongoDB disconnected');
		}
		
		if (redisClient) {
			await redisClient.quit();
			console.log('Redis disconnected');
		}
	} catch (error) {
		console.error('Error closing database connections:', error);
		throw error;
	}
}

module.exports = {
	initDatabase,
	closeConnections,
	config
}; 
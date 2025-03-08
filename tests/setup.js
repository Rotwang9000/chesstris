/**
 * Test Setup
 * 
 * This file configures the test environment:
 * - Sets NODE_ENV to 'test'
 * - Configures test databases
 * - Handles cleanup between tests
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Define test database URIs if not already set
process.env.TEST_MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/chesstris_test';
process.env.TEST_REDIS_URI = process.env.TEST_REDIS_URI || 'redis://localhost:6379/1';

// Import services and utilities needed for cleanup
import { closeConnections } from '../services/index.js';
import mongoose from 'mongoose';
import * as redis from 'redis';
import { setupMockFetch, restoreFetch } from './mockFetch.js';

// Import server for proper shutdown
let mainServer;
let srcServer;
try {
	// Try to import both server modules
	mainServer = await import('../server.js');
} catch (error) {
	console.log('Main server module not found, will try src folder');
}

try {
	srcServer = await import('../src/server.js');
} catch (error) {
	console.log('Src server module not found');
}

if (!mainServer && !srcServer) {
	console.log('No server modules found, will not attempt shutdown');
}

// Test helpers for ES modules
export const createTestProxy = (module) => {
	// Create a mutable object to store overrides
	const overrides = {};
	
	const handler = {
		get: (target, prop) => {
			if (prop === '__esModule') return true;
			if (prop === '_testOverrides') return overrides;
			if (prop === 'mockImplementation') {
				return (key, implementation) => {
					overrides[key] = implementation;
				};
			}
			if (prop in overrides) {
				return overrides[prop];
			}
			return target[prop];
		},
		set: (target, prop, value) => {
			overrides[prop] = value;
			return true;
		}
	};
	return new Proxy(module, handler);
};

// Set up test environment
export async function mochaGlobalSetup() {
	console.log('Setting up test environment');
	console.log(`Using test MongoDB: ${process.env.TEST_MONGO_URI}`);
	console.log(`Using test Redis: ${process.env.TEST_REDIS_URI}`);

	// Check Redis availability
	const redisAvailable = await checkRedisConnection();
	if (!redisAvailable) {
		throw new Error('Redis server is required for tests but is not available');
	}

	// Setup fetch mocking for API calls
	setupMockFetch();

	// Add global test helpers
	global.createTestProxy = createTestProxy;
}

// Clean up test environment
export async function mochaGlobalTeardown() {
	console.log('Cleaning up test environment');
	try {
		// Restore original fetch
		restoreFetch();

		// Disconnect Redis - handle a potentially already closed connection
		try {
			await closeConnections();
		} catch (error) {
			// If Redis is already closed, log but don't fail the test
			console.error('Error closing database connections:', error);
		}
		
		// Drop the test database
		if (mongoose.connection.readyState !== 0) {
			await mongoose.connection.dropDatabase();
			await mongoose.connection.close();
		}
		
		// Shutdown server if available
		if (mainServer && mainServer.shutdownServer) {
			console.log('Shutting down main server...');
			await mainServer.shutdownServer();
		}
		if (srcServer && srcServer.shutdownServer) {
			console.log('Shutting down src server...');
			await srcServer.shutdownServer();
		}
		
		// Clean up any remaining event listeners
		process.removeAllListeners();
		
		// Clear any outstanding timers
		const clearTimerIds = [];
		const oldSetTimeout = setTimeout;
		const oldClearTimeout = clearTimeout;
		
		for (let i = 0; i < 10000; i++) {
			clearTimerIds.push(oldClearTimeout(i));
		}
		
		// Force terminate any open handles or timers
		const forceExit = oldSetTimeout(() => {
			console.log('Forcing process exit after cleanup');
			process.exit(0);
		}, 1000);
		
		// Make sure this timeout gets cleared if we exit naturally
		forceExit.unref();
		
		console.log('Test cleanup completed successfully');
	} catch (error) {
		console.error('Error during test cleanup:', error);
		process.exit(1);
	}
}

// Check if Redis is available
async function checkRedisConnection() {
	const client = redis.createClient({ url: process.env.TEST_REDIS_URI });
	try {
		await client.connect();
		await client.quit();
		return true;
	} catch (error) {
		console.error('Redis is not available. Please ensure Redis server is running.');
		console.error('You can install Redis on Windows using:');
		console.error('  1. Enable WSL2 (Windows Subsystem for Linux 2)');
		console.error('  2. Install Redis in WSL2: sudo apt-get install redis-server');
		console.error('  3. Start Redis in WSL2: sudo service redis-server start');
		console.error('Or use Docker:');
		console.error('  docker run --name redis -p 6379:6379 -d redis');
		return false;
	}
} 
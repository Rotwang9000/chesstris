/**
 * Jest custom helpers for Shaktris tests
 * 
 * This file contains custom matchers and helpers to make
 * the transition from Chai/Sinon to Jest easier.
 */

// Custom Chai-like assertions
expect.extend({
	// Mimics Chai's 'include' assertion
	toInclude(received, expected) {
		const pass = received.includes(expected);
		return {
			pass,
			message: () => 
				`expected ${received} ${pass ? 'not to' : 'to'} include ${expected}`,
		};
	},
	
	// Mimics Chai's 'keys' assertion
	toHaveKeys(received, expected) {
		const keys = Object.keys(received);
		const pass = expected.every(key => keys.includes(key));
		
		return {
			pass,
			message: () => 
				`expected ${JSON.stringify(received)} ${pass ? 'not to' : 'to'} have keys ${JSON.stringify(expected)}`,
		};
	},
	
	// Mimics Chai's 'length' assertion
	toHaveLength(received, expected) {
		const pass = received.length === expected;
		
		return {
			pass,
			message: () => 
				`expected ${JSON.stringify(received)} ${pass ? 'not to' : 'to'} have length ${expected}`,
		};
	}
});

/**
 * Creates a test proxy object that wraps an object with Jest mocks
 * This helps mimic Sinon's behavior
 */
function createTestProxy(originalObject = {}) {
	const proxy = {};
	
	// Create proxy properties for each property in original
	Object.keys(originalObject).forEach(key => {
		if (typeof originalObject[key] === 'function') {
			proxy[key] = jest.fn(originalObject[key]);
		} else if (typeof originalObject[key] === 'object' && originalObject[key] !== null) {
			proxy[key] = createTestProxy(originalObject[key]);
		} else {
			proxy[key] = originalObject[key];
		}
	});
	
	return proxy;
}

/**
 * Creates a mock for the Redis client
 */
function createMockRedisClient() {
	return {
		on: jest.fn(),
		connect: jest.fn().mockResolvedValue(),
		disconnect: jest.fn().mockResolvedValue(),
		json: {
			set: jest.fn().mockResolvedValue("OK"),
			get: jest.fn().mockResolvedValue(null),
			del: jest.fn().mockResolvedValue(1)
		},
		exists: jest.fn().mockResolvedValue(0),
		hSet: jest.fn().mockResolvedValue(1),
		hGetAll: jest.fn().mockResolvedValue({}),
		hDel: jest.fn().mockResolvedValue(1),
		lPush: jest.fn().mockResolvedValue(1),
		lRange: jest.fn().mockResolvedValue([]),
		subscribe: jest.fn().mockResolvedValue(),
		publish: jest.fn().mockResolvedValue(0)
	};
}

/**
 * Creates a mock for Express
 */
function createMockExpress() {
	const app = {
		use: jest.fn(),
		get: jest.fn(),
		post: jest.fn(),
		put: jest.fn(),
		delete: jest.fn(),
		listen: jest.fn()
	};
	
	return () => app;
}

module.exports = {
	createTestProxy,
	createMockRedisClient,
	createMockExpress
}; 
/**
 * Mock collections module for testing
 * This provides placeholder implementations of any collections used in tests
 */

// Define mock function for CommonJS environment
function mockFn() {
	const fn = function(...args) {
		fn.mock.calls.push(args);
		return fn.mock.results[fn.mock.calls.length - 1].value;
	};
	
	fn.mock = {
		calls: [],
		instances: [],
		invocationCallOrder: [],
		results: []
	};
	
	fn.mockReturnValue = function(value) {
		fn.mock.results.push({ type: 'return', value });
		return fn;
	};
	
	fn.mockImplementation = function(implementation) {
		fn._implementation = implementation;
		return fn;
	};
	
	return fn;
}

// Export a minimal collections object using CommonJS
module.exports = {
	games: {
		find: mockFn().mockReturnValue([]),
		findOne: mockFn().mockReturnValue(null),
		insertOne: mockFn().mockReturnValue({ insertedId: 'mock-id' }),
		updateOne: mockFn().mockReturnValue({ modifiedCount: 1 }),
		deleteOne: mockFn().mockReturnValue({ deletedCount: 1 })
	},
	players: {
		find: mockFn().mockReturnValue([]),
		findOne: mockFn().mockReturnValue(null),
		insertOne: mockFn().mockReturnValue({ insertedId: 'mock-id' }),
		updateOne: mockFn().mockReturnValue({ modifiedCount: 1 }),
		deleteOne: mockFn().mockReturnValue({ deletedCount: 1 })
	},
	transactions: {
		find: mockFn().mockReturnValue([]),
		findOne: mockFn().mockReturnValue(null),
		insertOne: mockFn().mockReturnValue({ insertedId: 'mock-id' }),
		updateOne: mockFn().mockReturnValue({ modifiedCount: 1 }),
		deleteOne: mockFn().mockReturnValue({ deletedCount: 1 })
	}
}; 
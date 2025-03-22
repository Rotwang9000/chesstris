/**
 * Mock for all internal modules
 * This provides a single catch-all mock for any internal modules that may be imported
 */

module.exports = {
	// Generic properties and methods that can be used by any internal module
	debug: function() { return console.log; },
	isDebugMode: false,
	
	// Constants
	DIFFICULTY_SETTINGS: {
		EASY: {
			MOVE_INTERVAL: 1500,
			THINKING_DEPTH: 1,
			ACCURACY: 0.6
		},
		MEDIUM: {
			MOVE_INTERVAL: 1000,
			THINKING_DEPTH: 2,
			ACCURACY: 0.8
		},
		HARD: {
			MOVE_INTERVAL: 600,
			THINKING_DEPTH: 3,
			ACCURACY: 0.95
		}
	},
	
	// Utility functions
	parseOptions: function(options, defaults) {
		if (!options) return { ...defaults };
		return { ...defaults, ...options };
	},
	
	// Regular expression utilities
	test: function(pattern, str) {
		if (typeof pattern === 'string') {
			return str.includes(pattern);
		}
		return pattern.test(str);
	},
	
	// Mock identifiers
	generateId: function(prefix = '') {
		return `${prefix}${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}
}; 
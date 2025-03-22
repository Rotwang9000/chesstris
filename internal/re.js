/**
 * Mock re module for testing
 */

module.exports = {
	// Mock regular expression utilities
	test: function(pattern, str) {
		if (typeof pattern === 'string') {
			return str.includes(pattern);
		}
		return pattern.test(str);
	},
	match: function(pattern, str) {
		if (typeof pattern === 'string') {
			return str.match(new RegExp(pattern));
		}
		return str.match(pattern);
	},
	create: function(pattern, flags) {
		return new RegExp(pattern, flags);
	}
}; 
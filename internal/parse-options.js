/**
 * Mock parse-options module for testing
 */

module.exports = function parseOptions(options, defaults) {
	// Simple implementation that merges options with defaults
	if (!options) return { ...defaults };
	return { ...defaults, ...options };
}; 
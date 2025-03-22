/**
 * Mock for functions modules
 */

// Mock for ../functions/cmp
export function cmp(a, b) {
	if (a === b) return 0;
	return a < b ? -1 : 1;
}

// Default export for ES modules
export default {
	cmp
}; 
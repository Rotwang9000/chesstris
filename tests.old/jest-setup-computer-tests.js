/**
 * Jest setup file specifically for computer player tests
 */

// Override the moduleNameMapper dynamically for this test suite
jest.mock('../functions/cmp', () => ({
	__esModule: true,
	default: function cmp(a, b) {
		if (a === b) return 0;
		return a < b ? -1 : 1;
	},
	cmp: function cmp(a, b) {
		if (a === b) return 0;
		return a < b ? -1 : 1;
	}
}), { virtual: true });

// Mock any other dependencies as needed
console.log('Computer player test setup complete'); 
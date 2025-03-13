/**
 * Basic test file to verify Jest setup
 */

// Using global Jest functions
describe('Basic Tests', () => {
	test('should pass a simple test', () => {
		expect(1 + 1).toBe(2);
	});

	test('should handle subtraction', () => {
		expect(5 - 3).toBe(2);
	});
}); 
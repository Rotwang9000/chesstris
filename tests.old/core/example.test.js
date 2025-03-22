/**
 * Example ES6 Module Tests
 * 
 * This file demonstrates how to write tests for ES6 modules.
 */

// Import Jest's expect
const { expect } = require('@jest/globals');

// Import the original modules
const { randomInt, randomColor, clamp, lerp } = require('../../public/js/utils/helpers.js');

describe('Example ES6 Module Tests', () => {
	// Test case
	it('should demonstrate a simple test with ES6 modules', () => {
		// Arrange
		const min = 1;
		const max = 10;
		
		// Act
		const result = randomInt(min, max);
		
		// Assert
		expect(result).toBeGreaterThanOrEqual(min);
		expect(result).toBeLessThanOrEqual(max);
	});
	
	// Async test case
	it('should demonstrate an async test with ES6 modules', async () => {
		// Arrange
		const mockData = { success: true, data: [1, 2, 3] };
		
		// Create a mock implementation of an async function
		const mockAsyncFunction = jest.fn().mockResolvedValue(mockData);
		
		// Act
		const result = await mockAsyncFunction('test-url');
		
		// Assert
		expect(result).toEqual(mockData);
		expect(mockAsyncFunction).toHaveBeenCalledWith('test-url');
	});
	
	describe('Mocking module methods', () => {
		it('should mock methods with replacements', () => {
			// Arrange
			const clampStub = jest.fn().mockReturnValue(5);
			
			// Act
			const result = clampStub(10, 0, 5);
			
			// Assert
			expect(result).toBe(5);
			expect(clampStub).toHaveBeenCalledWith(10, 0, 5);
		});
	});
});

describe('Another Test Suite', () => {
	it('should work as expected', () => {
		expect(true).toBe(true);
	});
}); 
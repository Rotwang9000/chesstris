/**
 * Example ES6 Module Tests
 * 
 * This file demonstrates how to write tests for ES6 modules.
 */

import { expect } from 'chai';
import sinon from 'sinon';

// Import the original modules
import { randomInt, randomColor, clamp, lerp } from '../../public/js/utils/helpers.js';

describe('Example ES6 Module Tests', () => {
	// Test case
	it('should demonstrate a simple test with ES6 modules', () => {
		// Arrange
		const min = 1;
		const max = 10;
		
		// Act
		const result = randomInt(min, max);
		
		// Assert
		expect(result).to.be.at.least(min);
		expect(result).to.be.at.most(max);
	});
	
	// Async test case
	it('should demonstrate an async test with ES6 modules', async () => {
		// Arrange
		const mockData = { success: true, data: [1, 2, 3] };
		
		// Create a mock implementation of an async function
		const mockAsyncFunction = sinon.stub().resolves(mockData);
		
		// Act
		const result = await mockAsyncFunction('test-url');
		
		// Assert
		expect(result).to.deep.equal(mockData);
		expect(mockAsyncFunction.calledWith('test-url')).to.be.true;
	});
	
	describe('Mocking module methods', () => {
		it('should mock methods with replacements', () => {
			// Arrange
			const clampStub = sinon.stub().returns(5);
			
			// Act
			const result = clampStub(10, 0, 5);
			
			// Assert
			expect(result).to.equal(5);
			expect(clampStub.calledWith(10, 0, 5)).to.be.true;
		});
	});
});

describe('Another Test Suite', () => {
	it('should work as expected', () => {
		expect(true).to.be.true;
	});
}); 
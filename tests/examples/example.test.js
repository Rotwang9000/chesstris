/**
 * Example ES6 Module Tests
 * 
 * This file demonstrates how to test ES6 modules using our custom proxy system.
 */

import { expect } from 'chai';
import { createTestProxy } from '../setup.js';

// Import the module we want to test
import * as OriginalExample from '../../public/js/examples/example.js';

// Create a proxy for the module
const Example = createTestProxy(OriginalExample);

describe('Example ES6 Module Tests', () => {
	beforeEach(() => {
		// Reset any overrides
		delete Example._testOverrides;
	});
	
	it('should demonstrate a simple test with ES6 modules', () => {
		// Override the sum function
		Example.sum = (a, b) => a + b + 10;
		
		// Test the overridden function
		expect(Example.sum(2, 3)).to.equal(15);
	});
	
	it('should demonstrate an async test with ES6 modules', async () => {
		// Override the async function
		Example.fetchData = async () => ({ success: true, data: 'mocked data' });
		
		// Test the overridden function
		const result = await Example.fetchData();
		expect(result.success).to.be.true;
		expect(result.data).to.equal('mocked data');
	});
	
	describe('Mocking module methods', () => {
		it('should mock methods with replacements', () => {
			// Create a mock implementation that tracks calls
			let calls = 0;
			Example.calculate = () => {
				calls++;
				return 42;
			};
			
			// Call the function multiple times
			Example.calculate();
			Example.calculate();
			
			// Verify it was called the expected number of times
			expect(calls).to.equal(2);
		});
	});
});

// Additional example
describe('Another Test Suite', () => {
	it('should work as expected', () => {
		expect(true).to.be.true;
	});
}); 
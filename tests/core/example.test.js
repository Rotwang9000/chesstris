/**
 * Example Test File with ES6 Modules
 * 
 * This demonstrates how to structure tests using ES6 modules
 */

// Import test libraries with ES6 import syntax
import { expect } from 'chai';
import sinon from 'sinon';

// Import modules you're testing with .js extension
import { addSponsorToTetromino } from '../../public/utils/sponsors.js';

// Example of how to mock ES modules
// Create a module proxy for mocking
const mockFetch = async () => ({
	ok: true,
	json: async () => ({ _id: '123', name: 'Test Sponsor' })
});

// Test suite
describe('Example ES6 Module Tests', () => {
	// Mock setup and teardown
	let fetchStub;
	
	beforeEach(() => {
		// Setup: Replace global.fetch with our mock
		fetchStub = sinon.stub(global, 'fetch').callsFake(mockFetch);
	});
	
	afterEach(() => {
		// Teardown: Restore original fetch
		fetchStub.restore();
	});
	
	// Test case
	it('should demonstrate a simple test with ES6 modules', () => {
		// Arrange
		const expected = 'test';
		
		// Act
		const actual = 'test';
		
		// Assert
		expect(actual).to.equal(expected);
	});
	
	// Async test case
	it('should demonstrate an async test with ES6 modules', async () => {
		// We're using the fetchStub defined in beforeEach
		
		// Act
		const tetromino = { type: 'I' };
		const result = await addSponsorToTetromino(tetromino);
		
		// Assert
		expect(result.sponsor).to.exist;
		expect(result.sponsor.id).to.equal('123');
	});
	
	// Example of how to mock specific module methods
	describe('Mocking module methods', () => {
		// Example class to mock
		class ExampleClass {
			doSomething() {
				return 'real implementation';
			}
		}
		
		it('should mock methods with replacements', () => {
			// Create an instance
			const instance = new ExampleClass();
			
			// Mock the method
			sinon.stub(instance, 'doSomething').returns('mocked implementation');
			
			// Test the mock
			expect(instance.doSomething()).to.equal('mocked implementation');
		});
	});
});

// You can also have multiple describe blocks
describe('Another Test Suite', () => {
	it('should work as expected', () => {
		expect(true).to.be.true;
	});
}); 
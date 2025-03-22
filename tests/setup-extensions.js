/**
 * Jest Setup Extensions
 * 
 * This file runs after Jest is installed but before tests are run.
 * It's a good place to add custom matchers.
 */

// Add custom matchers for Jest
expect.extend({
	// Check if a value is within a range
	toBeWithinRange(received, floor, ceiling) {
		const pass = received >= floor && received <= ceiling;
		if (pass) {
			return {
				message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
				pass: false,
			};
		}
	},
	
	// Check if a value matches a 3D position
	toMatchPosition(received, expected) {
		const pass = 
			received.x === expected.x && 
			received.y === expected.y && 
			received.z === expected.z;
			
		if (pass) {
			return {
				message: () => `expected ${JSON.stringify(received)} not to match position ${JSON.stringify(expected)}`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected ${JSON.stringify(received)} to match position ${JSON.stringify(expected)}`,
				pass: false,
			};
		}
	},
	
	// Check if an array contains an object with specific properties
	toContainObject(received, expected) {
		const pass = received.some(item => {
			for (const key in expected) {
				if (item[key] !== expected[key]) {
					return false;
				}
			}
			return true;
		});
		
		if (pass) {
			return {
				message: () => `expected ${JSON.stringify(received)} not to contain object ${JSON.stringify(expected)}`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected ${JSON.stringify(received)} to contain object ${JSON.stringify(expected)}`,
				pass: false,
			};
		}
	},
	
	// Check if a value is approximately equal to an expected value within a tolerance
	toBeCloseTo(received, expected, precision = 2) {
		const tolerance = Math.pow(10, -precision) / 2;
		const pass = Math.abs(received - expected) < tolerance;
		
		if (pass) {
			return {
				message: () => `expected ${received} not to be close to ${expected} (within ${tolerance})`,
				pass: true,
			};
		} else {
			return {
				message: () => `expected ${received} to be close to ${expected} (within ${tolerance})`,
				pass: false,
			};
		}
	}
}); 
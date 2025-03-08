/**
 * Example Module
 * 
 * This is an example module that demonstrates various functionality
 * that can be tested with our test system.
 */

/**
 * Simple sum function
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
export function sum(a, b) {
	return a + b;
}

/**
 * Mock async function that would fetch data
 * @returns {Promise<Object>} The fetched data
 */
export async function fetchData() {
	// In a real app, this would call an API
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve({
				success: true,
				data: 'real data'
			});
		}, 100);
	});
}

/**
 * Calculate something complex
 * @returns {number} The calculated value
 */
export function calculate() {
	// Complex calculation
	return Math.floor(Math.random() * 100);
} 
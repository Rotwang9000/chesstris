/**
 * Example test file to verify Jest setup
 */

import { jest } from '@jest/globals';
import { randomInt, randomColor, clamp, lerp } from '../public/js/utils/helpers.js';

// Mock fetch for testing
global.fetch = jest.fn();

describe('Basic Tests', () => {
	test('should pass a simple test', () => {
		expect(1 + 1).toBe(2);
	});

	test('should handle subtraction', () => {
		expect(5 - 3).toBe(2);
	});
});

describe('Helper Functions', () => {
	test('should clamp a value between min and max', () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-5, 0, 10)).toBe(0);
		expect(clamp(15, 0, 10)).toBe(10);
	});

	test('should linearly interpolate between two values', () => {
		expect(lerp(0, 10, 0.5)).toBe(5);
		expect(lerp(0, 10, 0)).toBe(0);
		expect(lerp(0, 10, 1)).toBe(10);
	});

	test('should generate a random integer within range', () => {
		// Test multiple times to ensure it stays within range
		for (let i = 0; i < 100; i++) {
			const result = randomInt(5, 10);
			expect(result).toBeGreaterThanOrEqual(5);
			expect(result).toBeLessThanOrEqual(10);
			expect(Number.isInteger(result)).toBe(true);
		}
	});
});

describe('Fetch API', () => {
	beforeEach(() => {
		fetch.mockClear();
	});

	test('should mock fetch correctly', async () => {
		const mockResponse = { data: 'test data' };
		fetch.mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse
		});

		const response = await fetch('https://example.com/api');
		const data = await response.json();

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith('https://example.com/api');
		expect(data).toEqual(mockResponse);
	});
});

describe('DOM Elements', () => {
	test('should mock document.getElementById', () => {
		const mockElement = {
			style: {},
			classList: {
				add: jest.fn(),
				remove: jest.fn()
			}
		};
		
		document.getElementById = jest.fn().mockReturnValue(mockElement);
		
		const element = document.getElementById('test-id');
		expect(document.getElementById).toHaveBeenCalledWith('test-id');
		expect(element).toBe(mockElement);
	});
}); 
/**
 * Mock Fetch Implementation
 * 
 * This file provides a mock implementation of the fetch API for tests.
 */

// Store the original fetch
const originalFetch = globalThis.fetch;

// Mock response generator
const createMockResponse = (data, options = {}) => {
	const defaultOptions = {
		status: 200,
		statusText: 'OK',
		headers: new Headers({ 'Content-Type': 'application/json' })
	};
	
	const mockOptions = { ...defaultOptions, ...options };
	
	return {
		ok: mockOptions.status >= 200 && mockOptions.status < 300,
		status: mockOptions.status,
		statusText: mockOptions.statusText,
		headers: mockOptions.headers,
		json: async () => data,
		text: async () => JSON.stringify(data)
	};
};

// Mock routes and responses
const mockRoutes = {
	'/api/advertisers/next': {
		data: {
			id: 'ad123',
			name: 'Test Advertiser',
			logo: 'test-logo.png',
			adText: 'Test ad message',
			adLink: 'https://example.com'
		}
	},
	'/api/advertisers/click': {
		data: { success: true }
	},
	'/api/advertisers/stats': {
		data: {
			impressions: 100,
			clicks: 10,
			ctr: 0.1
		}
	}
};

// Replace global fetch in tests
export function setupMockFetch() {
	globalThis.fetch = async (url, options = {}) => {
		// If the URL is a URL object, convert to string
		const urlString = url instanceof URL ? url.toString() : url.toString();
		
		// Extract the pathname from the URL
		let pathname;
		try {
			// For full URLs, extract the pathname
			if (urlString.startsWith('http')) {
				pathname = new URL(urlString).pathname;
			} else {
				// For relative paths, use as is
				pathname = urlString;
			}
		} catch (error) {
			// If it's not a valid URL, just use the string as is
			pathname = urlString;
		}
		
		// Find the mock response for this route
		const route = mockRoutes[pathname];
		
		if (!route) {
			return createMockResponse({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
		}
		
		return createMockResponse(route.data, route.options);
	};
}

// Restore original fetch
export function restoreFetch() {
	globalThis.fetch = originalFetch;
}

// Add a route to the mock routes
export function addMockRoute(path, data, options = {}) {
	mockRoutes[path] = { data, options };
} 
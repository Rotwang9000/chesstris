// Mock implementation of sinon
module.exports = {
	stub: function() {
		return {
			returns: jest.fn(),
			callsFake: jest.fn(),
			resolves: jest.fn(),
			rejects: jest.fn(),
			reset: jest.fn(),
			restore: jest.fn()
		};
	},
	spy: jest.fn(),
	mock: jest.fn(),
	fake: jest.fn(),
	createSandbox: function() {
		return {
			stub: jest.fn(),
			spy: jest.fn(),
			mock: jest.fn(),
			restore: jest.fn()
		};
	}
}; 
/**
 * Mock for the sessionManager module
 */

const sessionManagerMock = {
	init: jest.fn(),
	getSession: jest.fn(),
	setSession: jest.fn(),
	clearSession: jest.fn(),
	getPlayerToken: jest.fn(() => 'mock-player-token'),
	setPlayerToken: jest.fn(),
	getPlayerId: jest.fn(() => 'test-player-id'),
	setPlayerId: jest.fn(),
	getPlayerName: jest.fn(() => 'Test Player'),
	setPlayerName: jest.fn(),
	isLoggedIn: jest.fn(() => true),
	saveGameState: jest.fn(),
	loadGameState: jest.fn(),
	clearGameState: jest.fn()
};

export default sessionManagerMock; 
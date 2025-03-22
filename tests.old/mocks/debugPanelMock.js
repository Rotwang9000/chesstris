/**
 * Mock for the debugPanel module
 */

const debugPanelMock = {
	init: jest.fn(),
	log: jest.fn(),
	error: jest.fn(),
	warn: jest.fn(),
	info: jest.fn(),
	clear: jest.fn(),
	show: jest.fn(),
	hide: jest.fn(),
	toggle: jest.fn(),
	isVisible: jest.fn(() => false),
	addCommand: jest.fn(),
	executeCommand: jest.fn()
};

export default debugPanelMock; 
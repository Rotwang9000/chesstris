/**
 * Mock for the renderer module
 */

const rendererMock = {
	init: jest.fn(),
	renderBoard: jest.fn(),
	renderChessPieces: jest.fn(),
	renderTetromino: jest.fn(),
	renderUI: jest.fn(),
	renderPlayerInfo: jest.fn(),
	renderGameStatus: jest.fn(),
	renderNextPiece: jest.fn(),
	renderScore: jest.fn(),
	renderTime: jest.fn(),
	renderHoldPiece: jest.fn(),
	renderAnimations: jest.fn(),
	renderBackground: jest.fn(),
	clear: jest.fn(),
	update: jest.fn(),
	resize: jest.fn()
};

export default rendererMock; 
/**
 * UI Manager Unit Tests
 */

describe('UI Manager', () => {
	// Mock dependencies using jest.doMock to ensure it loads correctly
	jest.doMock('../public/js/utils/gameStateManager.js', () => ({
		onAnyStateChange: jest.fn(),
		getGameState: jest.fn().mockReturnValue({}),
		GAME_STATES: {
			LOADING: 'LOADING',
			MENU: 'MENU',
			CONNECTING: 'CONNECTING',
			PLAYING: 'PLAYING',
			PAUSED: 'PAUSED',
			GAME_OVER: 'GAME_OVER'
		}
	}));
	
	jest.doMock('../public/js/utils/soundManager.js', () => ({
		play: jest.fn(),
		getMasterVolume: jest.fn().mockReturnValue(0.7),
		getMusicVolume: jest.fn().mockReturnValue(0.5),
		getSfxVolume: jest.fn().mockReturnValue(0.8),
		setMasterVolume: jest.fn(),
		setMusicVolume: jest.fn(),
		setSfxVolume: jest.fn(),
		isMuted: jest.fn().mockReturnValue(false),
		mute: jest.fn()
	}));
	
	// Import the module for testing after mocks are set up
	import uiManager from '../public/js/utils/uiManager.js';
	
	// Get references to mocked dependencies
	import mockGameStateManager from '../public/js/utils/gameStateManager.js';
	import mockSoundManager from '../public/js/utils/soundManager.js';
	
	// Mock DOM elements
	let mockRoot;
	
	beforeEach(() => {
		// Set up DOM mocks
		mockRoot = document.createElement('div');
		mockRoot.id = 'ui-container';
		document.body.appendChild(mockRoot);
		
		// Reset mocks before each test
		jest.clearAllMocks();
	});
	
	afterEach(() => {
		// Clean up DOM mocks
		if (mockRoot && mockRoot.parentNode) {
			mockRoot.parentNode.removeChild(mockRoot);
		}
		
		// Cleanup the UI manager
		if (uiManager.cleanup) {
			uiManager.cleanup();
		}
	});
	
	describe('Initialization', () => {
		test('should initialize properly', async () => {
			const result = await uiManager.init({ rootElement: mockRoot });
			expect(result).toBe(true);
		});
		
		test('should register state change handler', async () => {
			await uiManager.init({ rootElement: mockRoot });
			expect(mockGameStateManager.onAnyStateChange).toHaveBeenCalled();
		});
	});
	
	describe('Component Management', () => {
		test('should register and retrieve components', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const testComponent = { render: jest.fn() };
			uiManager.registerComponent('test', testComponent);
			
			const retrieved = uiManager.getComponent('test');
			expect(retrieved).toBe(testComponent);
		});
	});
	
	describe('UI Element Creation', () => {
		test('should create UI elements', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const element = uiManager.createElement('div', {
				className: 'test-element',
				style: { color: 'red' }
			});
			
			expect(element.tagName).toBe('DIV');
			expect(element.className).toBe('test-element');
			expect(element.style.color).toBe('red');
		});
		
		test('should create buttons with event handlers', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const clickHandler = jest.fn();
			const button = uiManager.createButton({
				text: 'Test Button',
				onClick: clickHandler
			});
			
			expect(button.tagName).toBe('BUTTON');
			expect(button.textContent).toBe('Test Button');
			
			// Simulate a click
			button.click();
			expect(clickHandler).toHaveBeenCalled();
			expect(mockSoundManager.play).toHaveBeenCalledWith('click');
		});
	});
	
	describe('Dialog Management', () => {
		test('should show and close dialogs', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const dialog = uiManager.showDialog({
				title: 'Test Dialog',
				content: 'Test content'
			});
			
			expect(dialog).toBeTruthy();
			expect(document.querySelector('.dialog')).toBeTruthy();
			
			uiManager.closeDialog();
			expect(document.querySelector('.dialog')).toBeFalsy();
		});
		
		test('should handle dialog buttons', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const buttonClickHandler = jest.fn();
			uiManager.showDialog({
				title: 'Test Dialog',
				content: 'Test content',
				buttons: [
					{
						text: 'OK',
						onClick: buttonClickHandler
					}
				]
			});
			
			// Find the button and click it
			const button = document.querySelector('.dialog button');
			button.click();
			
			expect(buttonClickHandler).toHaveBeenCalled();
		});
	});
	
	describe('Notification Management', () => {
		test('should show notifications', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const notification = uiManager.showNotification('Test notification', 'info', 1000);
			expect(notification).toBeTruthy();
			
			// Notification should play a sound
			expect(mockSoundManager.play).toHaveBeenCalled();
		});
	});
	
	describe('Theme Management', () => {
		test('should toggle dark mode', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			uiManager.toggleDarkMode(true);
			expect(uiManager.isDarkModeEnabled()).toBe(true);
			
			uiManager.toggleDarkMode(false);
			expect(uiManager.isDarkModeEnabled()).toBe(false);
		});
	});
	
	describe('Settings Menu', () => {
		test('should show settings menu', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			const dialog = uiManager.showSettingsMenu();
			expect(dialog).toBeTruthy();
			
			// Check if volume controls are available
			expect(document.querySelector('input[type="range"]')).toBeTruthy();
		});
	});
	
	describe('Game State Handling', () => {
		test('should handle game state changes', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			// Simulate game state change
			uiManager.handleGameStateChange(
				mockGameStateManager.GAME_STATES.PLAYING,
				mockGameStateManager.GAME_STATES.MENU,
				{}
			);
			
			// Check that notification was shown
			expect(mockSoundManager.play).toHaveBeenCalled();
		});
	});
	
	describe('UI Updates', () => {
		test('should update UI with game state', async () => {
			await uiManager.init({ rootElement: mockRoot });
			
			// Create UI components to test updates
			uiManager.createPlayerInfoPanel = jest.fn();
			uiManager.createGameStatusIndicator = jest.fn();
			uiManager.createTurnIndicator = jest.fn();
			
			uiManager.updatePlayerInfoPanel = jest.fn();
			uiManager.updateGameStatusIndicator = jest.fn();
			uiManager.updateTurnIndicator = jest.fn();
			
			// Mock game state
			const gameState = {
				players: {
					player1: { name: 'Player 1', score: 100 }
				},
				currentPhase: 'CHESS',
				turnTimeRemaining: 30000,
				isGameStarted: true
			};
			
			// Update UI
			uiManager.updateUI(gameState);
			
			// Check that UI was updated with game state
			if (uiManager.updatePlayerInfoPanel) {
				expect(uiManager.updatePlayerInfoPanel).toHaveBeenCalledWith(gameState);
			}
			if (uiManager.updateGameStatusIndicator) {
				expect(uiManager.updateGameStatusIndicator).toHaveBeenCalledWith(gameState);
			}
			if (uiManager.updateTurnIndicator) {
				expect(uiManager.updateTurnIndicator).toHaveBeenCalledWith(gameState);
			}
		});
	});
});
/**
 * Main Entry Point
 * 
 * Initializes the game and handles the main application flow.
 */

import * as GameManager from './core/gameManager.js';
import * as DebugPanel from './utils/debugPanel.js';
import * as SoundManager from './utils/soundManager.js';
import * as Renderer from './rendering/renderer-init.js';
import { GAME_CONSTANTS } from './core/constants.js';

// DOM elements
let gameContainer;
let loadingScreen;
let menuScreen;
let gameOverScreen;
let startButton;
let restartButton;
let settingsButton;
let render2DButton;
let render3DButton;

/**
 * Initialize the application
 */
async function init() {
	try {
		console.log('Initializing application...');
		
		// Get DOM elements
		gameContainer = document.getElementById('game-container');
		loadingScreen = document.getElementById('loading-screen');
		menuScreen = document.getElementById('menu-screen');
		gameOverScreen = document.getElementById('game-over-screen');
		startButton = document.getElementById('start-button');
		restartButton = document.getElementById('restart-button');
		settingsButton = document.getElementById('settings-button');
		render2DButton = document.getElementById('render-2d-button');
		render3DButton = document.getElementById('render-3d-button');
		
		// Create elements if they don't exist
		if (!gameContainer) {
			gameContainer = createGameContainer();
		}
		
		if (!loadingScreen) {
			loadingScreen = createLoadingScreen();
		}
		
		if (!menuScreen) {
			menuScreen = createMenuScreen();
		}
		
		if (!gameOverScreen) {
			gameOverScreen = createGameOverScreen();
		}
		
		// Show loading screen
		showScreen(loadingScreen);
		
		// Initialize managers
		await SoundManager.init();
		DebugPanel.init();
		
		// Initialize renderer
		try {
			await Renderer.init(gameContainer, {
				enableSkybox: true,
				enableClouds: true,
				enableEffects: true,
				enableRussianTheme: true,
				debug: false
			});
		} catch (error) {
			console.error('Failed to initialize renderer:', error);
			throw error;
		}
		
		// Initialize game manager
		try {
			await GameManager.init({
				renderMode: '3D',
				enableRussianTheme: true
			});
		} catch (error) {
			console.error('Failed to initialize game manager:', error);
			throw error;
		}
		
		// Set up event listeners
		setupEventListeners();
		
		// Hide loading screen and show menu
		hideScreen(loadingScreen);
		showScreen(menuScreen);
		
		// Play menu music
		SoundManager.playMusic('music_menu');
		
		console.log('Application initialized');
	} catch (error) {
		console.error('Error initializing application:', error);
		showErrorScreen(error);
	}
}

/**
 * Create game container
 * @returns {HTMLElement} - Game container element
 */
function createGameContainer() {
	try {
		const container = document.createElement('div');
		container.id = 'game-container';
		container.style.width = '100%';
		container.style.height = '100%';
		container.style.position = 'absolute';
		container.style.top = '0';
		container.style.left = '0';
		container.style.backgroundColor = '#000';
		
		document.body.appendChild(container);
		
		return container;
	} catch (error) {
		console.error('Error creating game container:', error);
		return null;
	}
}

/**
 * Create loading screen
 * @returns {HTMLElement} - Loading screen element
 */
function createLoadingScreen() {
	try {
		const screen = document.createElement('div');
		screen.id = 'loading-screen';
		screen.className = 'screen';
		screen.style.display = 'flex';
		screen.style.flexDirection = 'column';
		screen.style.justifyContent = 'center';
		screen.style.alignItems = 'center';
		screen.style.position = 'absolute';
		screen.style.top = '0';
		screen.style.left = '0';
		screen.style.width = '100%';
		screen.style.height = '100%';
		screen.style.backgroundColor = '#000';
		screen.style.color = '#fff';
		screen.style.zIndex = '100';
		
		const title = document.createElement('h1');
		title.textContent = 'SHAKTRIS';
		title.style.fontSize = '48px';
		title.style.marginBottom = '20px';
		
		const loadingText = document.createElement('p');
		loadingText.textContent = 'Loading...';
		loadingText.style.fontSize = '24px';
		
		const spinner = document.createElement('div');
		spinner.className = 'spinner';
		spinner.style.width = '50px';
		spinner.style.height = '50px';
		spinner.style.border = '5px solid rgba(255, 255, 255, 0.3)';
		spinner.style.borderRadius = '50%';
		spinner.style.borderTop = '5px solid #fff';
		spinner.style.animation = 'spin 1s linear infinite';
		spinner.style.marginTop = '20px';
		
		// Add keyframes for spinner animation
		const style = document.createElement('style');
		style.textContent = `
			@keyframes spin {
				0% { transform: rotate(0deg); }
				100% { transform: rotate(360deg); }
			}
		`;
		document.head.appendChild(style);
		
		screen.appendChild(title);
		screen.appendChild(loadingText);
		screen.appendChild(spinner);
		
		document.body.appendChild(screen);
		
		return screen;
	} catch (error) {
		console.error('Error creating loading screen:', error);
		return null;
	}
}

/**
 * Create menu screen
 * @returns {HTMLElement} - Menu screen element
 */
function createMenuScreen() {
	try {
		const screen = document.createElement('div');
		screen.id = 'menu-screen';
		screen.className = 'screen';
		screen.style.display = 'none';
		screen.style.flexDirection = 'column';
		screen.style.justifyContent = 'center';
		screen.style.alignItems = 'center';
		screen.style.position = 'absolute';
		screen.style.top = '0';
		screen.style.left = '0';
		screen.style.width = '100%';
		screen.style.height = '100%';
		screen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		screen.style.color = '#fff';
		screen.style.zIndex = '90';
		screen.style.pointerEvents = 'auto'; // Ensure pointer events work
		
		const title = document.createElement('h1');
		title.textContent = 'SHAKTRIS';
		title.style.fontSize = '64px';
		title.style.marginBottom = '40px';
		title.style.textShadow = '0 0 10px #00f, 0 0 20px #00f, 0 0 30px #00f';
		
		const buttonContainer = document.createElement('div');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.flexDirection = 'column';
		buttonContainer.style.gap = '20px';
		
		// Start button
		const startButton = document.createElement('button');
		startButton.id = 'start-button';
		startButton.textContent = 'Start Game';
		styleButton(startButton);
		startButton.onclick = () => {
			SoundManager.playSound('menu_confirm');
			startGame();
		};
		
		// Settings button
		const settingsButton = document.createElement('button');
		settingsButton.id = 'settings-button';
		settingsButton.textContent = 'Settings';
		styleButton(settingsButton);
		settingsButton.onclick = () => {
			SoundManager.playSound('menu_select');
			showSettingsScreen();
		};
		
		// Render mode buttons
		const renderModeContainer = document.createElement('div');
		renderModeContainer.style.display = 'flex';
		renderModeContainer.style.gap = '20px';
		renderModeContainer.style.marginTop = '20px';
		
		const render2DButton = document.createElement('button');
		render2DButton.id = 'render-2d-button';
		render2DButton.textContent = '2D Mode';
		styleButton(render2DButton, { width: '120px' });
		render2DButton.onclick = () => {
			SoundManager.playSound('menu_select');
			setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_2D);
			render2DButton.style.backgroundColor = '#00f';
			render3DButton.style.backgroundColor = '#333';
		};
		
		const render3DButton = document.createElement('button');
		render3DButton.id = 'render-3d-button';
		render3DButton.textContent = '3D Mode';
		styleButton(render3DButton, { width: '120px' });
		render3DButton.style.backgroundColor = '#00f'; // Default to 3D mode
		render3DButton.onclick = () => {
			SoundManager.playSound('menu_select');
			setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_3D);
			render2DButton.style.backgroundColor = '#333';
			render3DButton.style.backgroundColor = '#00f';
		};
		
		// Add buttons to containers
		renderModeContainer.appendChild(render2DButton);
		renderModeContainer.appendChild(render3DButton);
		
		buttonContainer.appendChild(startButton);
		buttonContainer.appendChild(settingsButton);
		buttonContainer.appendChild(renderModeContainer);
		
		// Add elements to screen
		screen.appendChild(title);
		screen.appendChild(buttonContainer);
		
		document.body.appendChild(screen);
		
		return screen;
	} catch (error) {
		console.error('Error creating menu screen:', error);
		return null;
	}
}

/**
 * Create game over screen
 * @returns {HTMLElement} - Game over screen element
 */
function createGameOverScreen() {
	try {
		const screen = document.createElement('div');
		screen.id = 'game-over-screen';
		screen.className = 'screen';
		screen.style.display = 'none';
		screen.style.flexDirection = 'column';
		screen.style.justifyContent = 'center';
		screen.style.alignItems = 'center';
		screen.style.position = 'absolute';
		screen.style.top = '0';
		screen.style.left = '0';
		screen.style.width = '100%';
		screen.style.height = '100%';
		screen.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		screen.style.color = '#fff';
		screen.style.zIndex = '80';
		
		const title = document.createElement('h1');
		title.textContent = 'GAME OVER';
		title.style.fontSize = '64px';
		title.style.marginBottom = '20px';
		title.style.textShadow = '0 0 10px #f00, 0 0 20px #f00, 0 0 30px #f00';
		
		const scoreContainer = document.createElement('div');
		scoreContainer.id = 'final-score-container';
		scoreContainer.style.fontSize = '32px';
		scoreContainer.style.marginBottom = '40px';
		
		const scoreText = document.createElement('p');
		scoreText.id = 'final-score-text';
		scoreText.textContent = 'Score: 0';
		
		const levelText = document.createElement('p');
		levelText.id = 'final-level-text';
		levelText.textContent = 'Level: 1';
		
		const linesText = document.createElement('p');
		linesText.id = 'final-lines-text';
		linesText.textContent = 'Lines: 0';
		
		scoreContainer.appendChild(scoreText);
		scoreContainer.appendChild(levelText);
		scoreContainer.appendChild(linesText);
		
		const buttonContainer = document.createElement('div');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '20px';
		
		// Restart button
		const restartButton = document.createElement('button');
		restartButton.id = 'restart-button';
		restartButton.textContent = 'Play Again';
		styleButton(restartButton);
		
		// Menu button
		const menuButton = document.createElement('button');
		menuButton.id = 'menu-button';
		menuButton.textContent = 'Main Menu';
		styleButton(menuButton);
		
		buttonContainer.appendChild(restartButton);
		buttonContainer.appendChild(menuButton);
		
		screen.appendChild(title);
		screen.appendChild(scoreContainer);
		screen.appendChild(buttonContainer);
		
		document.body.appendChild(screen);
		
		return screen;
	} catch (error) {
		console.error('Error creating game over screen:', error);
		return null;
	}
}

/**
 * Style a button
 * @param {HTMLElement} button - Button to style
 * @param {Object} options - Style options
 */
function styleButton(button, options = {}) {
	button.style.padding = options.padding || '15px 30px';
	button.style.fontSize = options.fontSize || '24px';
	button.style.backgroundColor = options.backgroundColor || '#333';
	button.style.color = options.color || '#fff';
	button.style.border = options.border || 'none';
	button.style.borderRadius = options.borderRadius || '5px';
	button.style.cursor = 'pointer';
	button.style.transition = 'all 0.2s ease';
	button.style.width = options.width || 'auto';
	button.style.boxShadow = options.boxShadow || '0 4px 6px rgba(0, 0, 0, 0.3)';
	button.style.margin = options.margin || '5px';
	button.style.pointerEvents = 'auto'; // Ensure pointer events work
	
	// Hover effect using event listeners
	button.addEventListener('mouseover', () => {
		button.style.backgroundColor = options.hoverColor || '#555';
		button.style.transform = 'scale(1.05)';
	});
	
	button.addEventListener('mouseout', () => {
		button.style.backgroundColor = options.backgroundColor || '#333';
		button.style.transform = 'scale(1)';
	});
	
	button.addEventListener('mousedown', () => {
		button.style.transform = 'scale(0.95)';
	});
	
	button.addEventListener('mouseup', () => {
		button.style.transform = 'scale(1.05)';
	});
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
	try {
		// Start button
		if (startButton) {
			startButton.addEventListener('click', () => {
				SoundManager.playSound('menu_confirm');
				startGame();
			});
		} else {
			// Find the button by ID if not already found
			const startBtn = document.getElementById('start-button');
			if (startBtn) {
				startBtn.addEventListener('click', () => {
					SoundManager.playSound('menu_confirm');
					startGame();
				});
			}
		}
		
		// Restart button
		if (restartButton) {
			restartButton.addEventListener('click', () => {
				SoundManager.playSound('menu_confirm');
				restartGame();
			});
		} else {
			// Find the button by ID if not already found
			const restartBtn = document.getElementById('restart-button');
			if (restartBtn) {
				restartBtn.addEventListener('click', () => {
					SoundManager.playSound('menu_confirm');
					restartGame();
				});
			}
		}
		
		// Settings button
		if (settingsButton) {
			settingsButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				showSettingsScreen();
			});
		} else {
			// Find the button by ID if not already found
			const settingsBtn = document.getElementById('settings-button');
			if (settingsBtn) {
				settingsBtn.addEventListener('click', () => {
					SoundManager.playSound('menu_select');
					showSettingsScreen();
				});
			}
		}
		
		// Render mode buttons
		if (render2DButton) {
			render2DButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_2D);
				
				// Update button styles
				render2DButton.style.backgroundColor = '#00f';
				render3DButton.style.backgroundColor = '#333';
			});
		} else {
			// Find the button by ID if not already found
			const render2DBtn = document.getElementById('render-2d-button');
			if (render2DBtn) {
				render2DBtn.addEventListener('click', () => {
					SoundManager.playSound('menu_select');
					setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_2D);
					
					// Update button styles
					render2DBtn.style.backgroundColor = '#00f';
					const render3DBtn = document.getElementById('render-3d-button');
					if (render3DBtn) {
						render3DBtn.style.backgroundColor = '#333';
					}
				});
			}
		}
		
		if (render3DButton) {
			render3DButton.addEventListener('click', () => {
				SoundManager.playSound('menu_select');
				setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_3D);
				
				// Update button styles
				render2DButton.style.backgroundColor = '#333';
				render3DButton.style.backgroundColor = '#00f';
			});
		} else {
			// Find the button by ID if not already found
			const render3DBtn = document.getElementById('render-3d-button');
			if (render3DBtn) {
				render3DBtn.addEventListener('click', () => {
					SoundManager.playSound('menu_select');
					setRenderMode(GAME_CONSTANTS.RENDER_MODE.MODE_3D);
					
					// Update button styles
					const render2DBtn = document.getElementById('render-2d-button');
					if (render2DBtn) {
						render2DBtn.style.backgroundColor = '#333';
					}
					render3DBtn.style.backgroundColor = '#00f';
				});
			}
		}
		
		// Menu button in game over screen
		const menuButton = document.getElementById('menu-button');
		if (menuButton) {
			menuButton.addEventListener('click', () => {
				SoundManager.playSound('menu_back');
				showMainMenu();
			});
		}
		
		// Game state change listener
		window.addEventListener('game-state-change', (event) => {
			const { state } = event.detail;
			
			if (state === GAME_CONSTANTS.GAME_STATE.GAME_OVER) {
				handleGameOver();
			}
		});
		
		// Keyboard shortcuts
		window.addEventListener('keydown', (event) => {
			// F9 to toggle debug panel
			if (event.key === 'F9') {
				DebugPanel.toggle();
			}
			
			// Escape to pause/show menu
			if (event.key === 'Escape') {
				if (GameManager.getGameState() === GAME_CONSTANTS.GAME_STATE.PLAYING) {
					GameManager.pauseGame();
					showScreen(menuScreen);
				}
			}
		});
	} catch (error) {
		console.error('Error setting up event listeners:', error);
	}
}

/**
 * Show settings screen
 */
function showSettingsScreen() {
	try {
		// Create settings screen if it doesn't exist
		let settingsScreen = document.getElementById('settings-screen');
		
		if (!settingsScreen) {
			settingsScreen = document.createElement('div');
			settingsScreen.id = 'settings-screen';
			settingsScreen.className = 'screen';
			settingsScreen.style.display = 'none';
			settingsScreen.style.flexDirection = 'column';
			settingsScreen.style.justifyContent = 'center';
			settingsScreen.style.alignItems = 'center';
			settingsScreen.style.position = 'absolute';
			settingsScreen.style.top = '0';
			settingsScreen.style.left = '0';
			settingsScreen.style.width = '100%';
			settingsScreen.style.height = '100%';
			settingsScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
			settingsScreen.style.color = '#fff';
			settingsScreen.style.zIndex = '95';
			
			const title = document.createElement('h1');
			title.textContent = 'SETTINGS';
			title.style.fontSize = '48px';
			title.style.marginBottom = '40px';
			
			const settingsContainer = document.createElement('div');
			settingsContainer.style.display = 'flex';
			settingsContainer.style.flexDirection = 'column';
			settingsContainer.style.gap = '20px';
			settingsContainer.style.width = '300px';
			
			// Volume control
			const volumeContainer = document.createElement('div');
			volumeContainer.style.display = 'flex';
			volumeContainer.style.flexDirection = 'column';
			volumeContainer.style.gap = '10px';
			
			const volumeLabel = document.createElement('label');
			volumeLabel.textContent = 'Volume';
			volumeLabel.style.fontSize = '24px';
			
			const volumeSlider = document.createElement('input');
			volumeSlider.type = 'range';
			volumeSlider.min = '0';
			volumeSlider.max = '100';
			volumeSlider.value = '50';
			volumeSlider.style.width = '100%';
			
			volumeSlider.addEventListener('input', (event) => {
				const volume = event.target.value / 100;
				SoundManager.setVolume(volume);
			});
			
			volumeContainer.appendChild(volumeLabel);
			volumeContainer.appendChild(volumeSlider);
			
			// Mute checkbox
			const muteContainer = document.createElement('div');
			muteContainer.style.display = 'flex';
			muteContainer.style.alignItems = 'center';
			muteContainer.style.gap = '10px';
			
			const muteCheckbox = document.createElement('input');
			muteCheckbox.type = 'checkbox';
			muteCheckbox.id = 'mute-checkbox';
			
			const muteLabel = document.createElement('label');
			muteLabel.textContent = 'Mute';
			muteLabel.style.fontSize = '24px';
			muteLabel.htmlFor = 'mute-checkbox';
			
			muteCheckbox.addEventListener('change', (event) => {
				SoundManager.setMute(event.target.checked);
			});
			
			muteContainer.appendChild(muteCheckbox);
			muteContainer.appendChild(muteLabel);
			
			// Back button
			const backButton = document.createElement('button');
			backButton.textContent = 'Back';
			styleButton(backButton, { marginTop: '40px' });
			
			backButton.addEventListener('click', () => {
				SoundManager.playSound('menu_back');
				hideScreen(settingsScreen);
				showScreen(menuScreen);
			});
			
			settingsContainer.appendChild(volumeContainer);
			settingsContainer.appendChild(muteContainer);
			settingsContainer.appendChild(backButton);
			
			settingsScreen.appendChild(title);
			settingsScreen.appendChild(settingsContainer);
			
			document.body.appendChild(settingsScreen);
		}
		
		// Hide menu screen
		hideScreen(menuScreen);
		
		// Show settings screen
		showScreen(settingsScreen);
	} catch (error) {
		console.error('Error showing settings screen:', error);
	}
}

/**
 * Start the game
 */
function startGame() {
	try {
		console.log('Starting game from UI...');
		
		// Hide menu screen
		hideScreen(menuScreen);
		
		// Initialize game state if needed
		if (window.GameState && typeof window.GameState.initGameState === 'function') {
			window.GameState.initGameState();
		}
		
		// Start the game
		GameManager.startGame();
		
		// Play start sound
		SoundManager.playSound('game_start');
		
		console.log('Game started successfully');
	} catch (error) {
		console.error('Error starting game:', error);
		showErrorScreen(error);
	}
}

/**
 * Update the UI based on game state
 */
function updateUI() {
	try {
		// Update score display
		const scoreElement = document.getElementById('score-value');
		if (scoreElement) {
			scoreElement.textContent = GameManager.getScore();
		}
		
		// Update level display
		const levelElement = document.getElementById('level-value');
		if (levelElement) {
			levelElement.textContent = GameManager.getLevel();
		}
		
		// Update lines display
		const linesElement = document.getElementById('lines-value');
		if (linesElement) {
			linesElement.textContent = GameManager.getLines();
		}
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Restart the game
 */
function restartGame() {
	try {
		// Hide game over screen
		hideScreen(gameOverScreen);
		
		// Restart game
		GameManager.restartGame();
		
		// Play game music
		SoundManager.playMusic('music_game');
	} catch (error) {
		console.error('Error restarting game:', error);
		showErrorScreen(error);
	}
}

/**
 * Set render mode
 * @param {string} mode - Render mode
 */
function setRenderMode(mode) {
	try {
		GameManager.setRenderMode(mode);
	} catch (error) {
		console.error('Error setting render mode:', error);
	}
}

/**
 * Handle game over
 */
function handleGameOver() {
	try {
		// Update final score
		const finalScoreText = document.getElementById('final-score-text');
		const finalLevelText = document.getElementById('final-level-text');
		const finalLinesText = document.getElementById('final-lines-text');
		
		if (finalScoreText) {
			finalScoreText.textContent = `Score: ${GameManager.getScore()}`;
		}
		
		if (finalLevelText) {
			finalLevelText.textContent = `Level: ${GameManager.getLevel()}`;
		}
		
		if (finalLinesText) {
			finalLinesText.textContent = `Lines: ${GameManager.getLines()}`;
		}
		
		// Show game over screen
		showScreen(gameOverScreen);
		
		// Play game over music
		SoundManager.playMusic('music_menu');
	} catch (error) {
		console.error('Error handling game over:', error);
	}
}

/**
 * Show main menu
 */
function showMainMenu() {
	try {
		// Hide all screens
		hideScreen(loadingScreen);
		hideScreen(gameOverScreen);
		
		// Show menu screen
		showScreen(menuScreen);
		
		// Play menu music
		SoundManager.playMusic('music_menu');
	} catch (error) {
		console.error('Error showing main menu:', error);
	}
}

/**
 * Show a screen
 * @param {HTMLElement} screen - Screen to show
 */
function showScreen(screen) {
	if (screen) {
		screen.style.display = 'flex';
	}
}

/**
 * Hide a screen
 * @param {HTMLElement} screen - Screen to hide
 */
function hideScreen(screen) {
	if (screen) {
		screen.style.display = 'none';
	}
}

/**
 * Show error screen
 * @param {Error} error - Error to display
 */
function showErrorScreen(error) {
	try {
		// Create error screen if it doesn't exist
		let errorScreen = document.getElementById('error-screen');
		
		if (!errorScreen) {
			errorScreen = document.createElement('div');
			errorScreen.id = 'error-screen';
			errorScreen.className = 'screen';
			errorScreen.style.display = 'flex';
			errorScreen.style.flexDirection = 'column';
			errorScreen.style.justifyContent = 'center';
			errorScreen.style.alignItems = 'center';
			errorScreen.style.position = 'absolute';
			errorScreen.style.top = '0';
			errorScreen.style.left = '0';
			errorScreen.style.width = '100%';
			errorScreen.style.height = '100%';
			errorScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
			errorScreen.style.color = '#f00';
			errorScreen.style.zIndex = '1000';
			
			const title = document.createElement('h1');
			title.textContent = 'ERROR';
			title.style.fontSize = '48px';
			title.style.marginBottom = '20px';
			
			const errorMessage = document.createElement('p');
			errorMessage.id = 'error-message';
			errorMessage.style.fontSize = '24px';
			errorMessage.style.maxWidth = '80%';
			errorMessage.style.textAlign = 'center';
			errorMessage.style.whiteSpace = 'pre-wrap';
			
			const reloadButton = document.createElement('button');
			reloadButton.textContent = 'Reload Page';
			styleButton(reloadButton, { backgroundColor: '#f00', marginTop: '40px' });
			reloadButton.addEventListener('click', () => {
				window.location.reload();
			});
			
			errorScreen.appendChild(title);
			errorScreen.appendChild(errorMessage);
			errorScreen.appendChild(reloadButton);
			
			document.body.appendChild(errorScreen);
		}
		
		// Update error message
		const errorMessage = document.getElementById('error-message');
		if (errorMessage) {
			errorMessage.textContent = `${error.message}\n\n${error.stack}`;
		}
		
		// Hide all other screens
		hideScreen(loadingScreen);
		hideScreen(menuScreen);
		hideScreen(gameOverScreen);
		
		// Show error screen
		showScreen(errorScreen);
	} catch (e) {
		console.error('Error showing error screen:', e);
		alert(`Critical error: ${error.message}`);
	}
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.Shaktris = {
	GameManager,
	DebugPanel,
	SoundManager,
	Renderer,
	startGame,
	restartGame,
	showMainMenu
};

/**
 * UI Manager Module
 * 
 * Handles the user interface, including screens, menus, and notifications.
 */

import * as Helpers from '../utils/helpers.js';

// Event listeners
const eventListeners = {};

// UI elements cache
const elements = {};

/**
 * Initialize the UI
 */
export function init() {
	// Cache UI elements
	cacheElements();
	
	// Set up event listeners
	setupEventListeners();
	
	console.log('UI initialized');
}

/**
 * Cache UI elements for faster access
 */
function cacheElements() {
	// Try to find the elements, but don't fail if they don't exist
	// This allows for a simplified UI during development
	
	// Other elements
	elements.gameContainer = document.getElementById('game-container');
	elements.notificationContainer = document.getElementById('notification-container');
	elements.notification = document.getElementById('notification');
	
	// Optional elements that might not exist in the simplified UI
	elements.screens = {
		loading: document.getElementById('loading-screen'),
		mainMenu: document.getElementById('main-menu-screen'),
		game: document.getElementById('game-screen'),
		gameOver: document.getElementById('game-over-screen'),
		error: document.getElementById('error-screen'),
		login: document.getElementById('login-screen'),
		register: document.getElementById('register-screen'),
		leaderboard: document.getElementById('leaderboard-screen'),
		settings: document.getElementById('settings-screen')
	};
	
	// Other optional elements
	elements.userInfo = document.getElementById('user-info');
	elements.errorMessage = document.getElementById('error-message');
	elements.loadingMessage = document.getElementById('loading-message');
	elements.gameOverMessage = document.getElementById('game-over-message');
	elements.gameOverStats = document.getElementById('game-over-stats');
	elements.leaderboardList = document.getElementById('leaderboard-list');
	
	// Buttons
	elements.buttons = {
		startGame: document.getElementById('start-game-btn'),
		joinGame: document.getElementById('join-game-btn'),
		leaderboard: document.getElementById('leaderboard-btn'),
		settings: document.getElementById('settings-btn'),
		login: document.getElementById('login-btn'),
		register: document.getElementById('register-btn'),
		logout: document.getElementById('logout-btn'),
		backToMenu: document.querySelectorAll('.back-to-menu-btn'),
		submitLogin: document.getElementById('submit-login-btn'),
		submitRegister: document.getElementById('submit-register-btn'),
		playAgain: document.getElementById('play-again-btn'),
		leaveGame: document.getElementById('leave-game-btn')
	};
	
	// Forms
	elements.forms = {
		login: document.getElementById('login-form'),
		register: document.getElementById('register-form'),
		joinGame: document.getElementById('join-game-form')
	};
}

/**
 * Set up event listeners for UI elements
 */
function setupEventListeners() {
	// Start game button
	if (elements.buttons.startGame) {
		elements.buttons.startGame.addEventListener('click', () => {
			emit('start_game', { width: 10, height: 20 });
		});
	}
	
	// Join game button
	if (elements.buttons.joinGame) {
		elements.buttons.joinGame.addEventListener('click', () => {
			showScreen('joinGame');
		});
	}
	
	// Join game form
	if (elements.forms.joinGame) {
		elements.forms.joinGame.addEventListener('submit', (event) => {
			event.preventDefault();
			const gameId = event.target.elements.gameId.value;
			emit('join_game', gameId);
		});
	}
	
	// Leaderboard button
	if (elements.buttons.leaderboard) {
		elements.buttons.leaderboard.addEventListener('click', () => {
			showScreen('leaderboard');
			loadLeaderboard();
		});
	}
	
	// Settings button
	if (elements.buttons.settings) {
		elements.buttons.settings.addEventListener('click', () => {
			showScreen('settings');
		});
	}
	
	// Login button
	if (elements.buttons.login) {
		elements.buttons.login.addEventListener('click', () => {
			showScreen('login');
		});
	}
	
	// Register button
	if (elements.buttons.register) {
		elements.buttons.register.addEventListener('click', () => {
			showScreen('register');
		});
	}
	
	// Logout button
	if (elements.buttons.logout) {
		elements.buttons.logout.addEventListener('click', () => {
			emit('logout');
		});
	}
	
	// Back to menu buttons
	if (elements.buttons.backToMenu) {
		elements.buttons.backToMenu.forEach(button => {
			button.addEventListener('click', () => {
				showMainMenu();
			});
		});
	}
	
	// Login form
	if (elements.forms.login) {
		elements.forms.login.addEventListener('submit', (event) => {
			event.preventDefault();
			const username = event.target.elements.username.value;
			const password = event.target.elements.password.value;
			emit('login', { username, password });
		});
	}
	
	// Register form
	if (elements.forms.register) {
		elements.forms.register.addEventListener('submit', (event) => {
			event.preventDefault();
			const username = event.target.elements.username.value;
			const password = event.target.elements.password.value;
			const email = event.target.elements.email.value;
			emit('register', { username, password, email });
		});
	}
	
	// Play again button
	if (elements.buttons.playAgain) {
		elements.buttons.playAgain.addEventListener('click', () => {
			emit('start_game', { width: 10, height: 20 });
		});
	}
	
	// Leave game button
	if (elements.buttons.leaveGame) {
		elements.buttons.leaveGame.addEventListener('click', () => {
			emit('leave_game');
		});
	}
}

/**
 * Show a screen and hide all others
 * @param {string} screenName - The name of the screen to show
 */
function showScreen(screenName) {
	if (!elements.screens) {
		console.warn(`Cannot show screen ${screenName} - screens not initialized`);
		return;
	}
	
	// Hide all screens
	Object.keys(elements.screens).forEach(key => {
		const screen = elements.screens[key];
		if (screen) {
			screen.classList.add('hidden');
		}
	});
	
	// Show the requested screen
	const screen = elements.screens[screenName];
	if (screen) {
		screen.classList.remove('hidden');
	} else {
		console.warn(`Screen ${screenName} not found`);
	}
}

/**
 * Show loading screen
 * @param {string} message - The loading message
 */
export function showLoadingScreen(message = 'Loading...') {
	if (elements.screens && elements.screens.loading) {
		showScreen('loading');
		if (elements.loadingMessage) {
			elements.loadingMessage.textContent = message;
		}
	} else {
		// Use notification as fallback
		showNotification(message, 'info', 0);
	}
}

/**
 * Hide loading screen
 */
export function hideLoadingScreen() {
	if (elements.screens && elements.screens.loading) {
		elements.screens.loading.classList.add('hidden');
	} else {
		// Hide the notification if we used that as fallback
		if (elements.notification) {
			elements.notification.classList.remove('show');
		}
	}
}

/**
 * Show the main menu
 */
export function showMainMenu() {
	if (elements.screens && elements.screens.mainMenu) {
		showScreen('mainMenu');
	} else {
		// For the simplified UI, just show a welcome notification
		showNotification('Welcome to Shaktris!', 'info', 3000);
	}
}

/**
 * Show the game screen
 */
export function showGameScreen() {
	showScreen('game');
}

/**
 * Show the game over screen
 * @param {Object} data - Game over data
 */
export function showGameOverScreen(data) {
	if (elements.gameOverMessage) {
		elements.gameOverMessage.textContent = data.winner ? 
			`Game Over! ${data.winner.username} wins!` : 
			'Game Over!';
	}
	
	if (elements.gameOverStats) {
		// Clear previous stats
		elements.gameOverStats.innerHTML = '';
		
		// Add player stats
		if (data.players && data.players.length > 0) {
			const statsList = document.createElement('ul');
			
			data.players.forEach(player => {
				const listItem = document.createElement('li');
				listItem.textContent = `${player.username}: ${player.score} points, ${player.remainingPieces} pieces remaining`;
				
				// Highlight the winner
				if (data.winner && player.id === data.winner.id) {
					listItem.classList.add('winner');
				}
				
				statsList.appendChild(listItem);
			});
			
			elements.gameOverStats.appendChild(statsList);
		}
	}
	
	showScreen('gameOver');
}

/**
 * Show the error screen
 * @param {string} title - The error title
 * @param {string} message - The error message
 */
export function showErrorScreen(title, message) {
	if (elements.errorMessage) {
		elements.errorMessage.innerHTML = `<h3>${title}</h3><p>${message}</p>`;
	}
	showScreen('error');
}

/**
 * Show a notification
 * @param {string} message - The notification message
 * @param {string} type - The notification type (info, success, warning, error)
 * @param {number} duration - The duration in milliseconds (0 for no auto-hide)
 */
export function showNotification(message, type = 'info', duration = 3000) {
	console.log(`Notification (${type}): ${message}`);
	
	// First try to use the notification container
	if (elements.notificationContainer) {
		// Create notification element
		const notification = document.createElement('div');
		notification.className = `notification notification-${type}`;
		notification.textContent = message;
		
		// Add to container
		elements.notificationContainer.appendChild(notification);
		
		// Show the notification
		setTimeout(() => {
			notification.classList.add('show');
		}, 10);
		
		// Remove after duration (if not 0)
		if (duration > 0) {
			setTimeout(() => {
				notification.classList.remove('show');
				
				// Remove from DOM after animation
				setTimeout(() => {
					if (notification.parentNode) {
						notification.parentNode.removeChild(notification);
					}
				}, 300);
			}, duration);
		}
		
		return notification;
	}
	// Fall back to the simple notification element
	else if (elements.notification) {
		const notification = elements.notification;
		notification.textContent = message;
		notification.className = `notification ${type}`;
		
		// Show the notification
		notification.classList.add('show');
		
		// Hide after duration (if not 0)
		if (duration > 0) {
			setTimeout(() => {
				notification.classList.remove('show');
			}, duration);
		}
		
		return notification;
	}
	// Last resort - log to console
	else {
		console.warn(`Could not show notification: ${message}`);
	}
	
	return null;
}

/**
 * Update user info display
 * @param {Object|null} user - The user data or null if logged out
 */
export function updateUserInfo(user) {
	if (!elements.userInfo) {
		return;
	}
	
	if (user) {
		elements.userInfo.innerHTML = `
			<span class="username">${user.username}</span>
			<span class="user-stats">
				<span class="wins">${user.stats?.wins || 0} wins</span>
				<span class="games">${user.stats?.gamesPlayed || 0} games</span>
			</span>
		`;
		elements.userInfo.classList.remove('hidden');
		
		// Show logout button, hide login/register buttons
		if (elements.buttons.logout) {
			elements.buttons.logout.classList.remove('hidden');
		}
		if (elements.buttons.login) {
			elements.buttons.login.classList.add('hidden');
		}
		if (elements.buttons.register) {
			elements.buttons.register.classList.add('hidden');
		}
	} else {
		elements.userInfo.classList.add('hidden');
		
		// Hide logout button, show login/register buttons
		if (elements.buttons.logout) {
			elements.buttons.logout.classList.add('hidden');
		}
		if (elements.buttons.login) {
			elements.buttons.login.classList.remove('hidden');
		}
		if (elements.buttons.register) {
			elements.buttons.register.classList.remove('hidden');
		}
	}
}

/**
 * Load and display the leaderboard
 * @param {string} type - The leaderboard type
 */
async function loadLeaderboard(type = 'score') {
	if (!elements.leaderboardList) {
		return;
	}
	
	try {
		// Clear the leaderboard
		elements.leaderboardList.innerHTML = '<li class="loading">Loading leaderboard...</li>';
		
		// Import the network module dynamically to avoid circular dependencies
		const Network = await import('../utils/network.js');
		
		// Get leaderboard data
		const leaderboardData = await Network.getLeaderboard(type);
		
		// Clear the loading message
		elements.leaderboardList.innerHTML = '';
		
		// Add leaderboard entries
		if (leaderboardData && leaderboardData.length > 0) {
			leaderboardData.forEach((entry, index) => {
				const listItem = document.createElement('li');
				listItem.innerHTML = `
					<span class="rank">#${index + 1}</span>
					<span class="username">${entry.username}</span>
					<span class="score">${entry.score} points</span>
				`;
				
				// Add medal class for top 3
				if (index < 3) {
					listItem.classList.add(`medal-${index + 1}`);
				}
				
				elements.leaderboardList.appendChild(listItem);
			});
		} else {
			elements.leaderboardList.innerHTML = '<li class="empty">No leaderboard data available</li>';
		}
	} catch (error) {
		console.error('Failed to load leaderboard:', error);
		elements.leaderboardList.innerHTML = '<li class="error">Failed to load leaderboard</li>';
	}
}

/**
 * Add an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function on(event, callback) {
	if (!eventListeners[event]) {
		eventListeners[event] = [];
	}
	
	eventListeners[event].push(callback);
}

/**
 * Remove an event listener
 * @param {string} event - The event name
 * @param {Function} callback - The callback function
 */
export function off(event, callback) {
	if (eventListeners[event]) {
		eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
	}
}

/**
 * Emit an event
 * @param {string} event - The event name
 * @param {*} data - The event data
 */
function emit(event, data) {
	if (eventListeners[event]) {
		eventListeners[event].forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in ${event} event handler:`, error);
			}
		});
	}
}

export default {
	init,
	showLoadingScreen,
	hideLoadingScreen,
	showMainMenu,
	showGameScreen,
	showGameOverScreen,
	showErrorScreen,
	showNotification,
	updateUserInfo,
	on,
	off
}; 
/**
 * UI Manager Utility
 *
 * Manages UI components and interactions for the game
 */

import * as gameStateManager from './gameStateManager.js';
import * as soundManager from './soundManager.js';

// UI component registry
const components = {};
let rootElement = null;
let isInitialized = false;
let activeDialog = null;
let notifications = [];
let notificationCounter = 0;
let isDarkMode = false;
let lastStateUpdateTime = 0;
const MIN_UPDATE_INTERVAL = 100; // ms between updates

// Constants
const NOTIFICATION_DURATION = 5000; // ms
const MAX_NOTIFICATIONS = 3;

/**
 * Initialize the UI manager
 * @param {Object} options - Configuration options
 * @returns {Promise<boolean>} Success status
 */
export function init(options = {}) {
	try {
		if (isInitialized) {
			console.warn('UI manager already initialized');
			return true;
		}
		
		console.log('Initializing UI manager...');
		
		// Store root element
		rootElement = options.rootElement || document.body;
		
		// Apply theme
		isDarkMode = options.theme === 'dark' || (options.darkMode ?? window.matchMedia('(prefers-color-scheme: dark)').matches);
		applyTheme(isDarkMode);
		
		// Set up game state change listeners
		if (options.onGameStateChange && typeof options.onGameStateChange === 'function') {
			gameStateManager.onAnyStateChange(options.onGameStateChange);
		} else {
			gameStateManager.onAnyStateChange(handleGameStateChange);
		}
		
		// Set up window resize handler
		window.addEventListener('resize', handleWindowResize);
		
		isInitialized = true;
		console.log('UI manager initialized');
		return true;
	} catch (error) {
		console.error('Error initializing UI manager:', error);
		return false;
	}
}

/**
 * Register a UI component
 * @param {string} id - Component ID
 * @param {Object} component - Component object
 * @returns {boolean} Success status
 */
export function registerComponent(id, component) {
	try {
		if (components[id]) {
			console.warn(`Component with ID ${id} already exists`);
			return false;
		}
		
		components[id] = component;
		return true;
	} catch (error) {
		console.error(`Error registering component ${id}:`, error);
		return false;
	}
}

/**
 * Get a registered UI component
 * @param {string} id - Component ID
 * @returns {Object|null} Component object or null if not found
 */
export function getComponent(id) {
	return components[id] || null;
}

/**
 * Create a UI element
 * @param {string} type - Element type
 * @param {Object} props - Element properties
 * @param {Array} children - Child elements
 * @returns {HTMLElement} Created element
 */
export function createElement(type, props = {}, children = []) {
	try {
		const element = document.createElement(type);
		
		// Apply properties
		for (const [key, value] of Object.entries(props)) {
			if (key === 'style' && typeof value === 'object') {
				// Apply style object
				Object.assign(element.style, value);
			} else if (key === 'className') {
				// Apply classes
				element.className = value;
			} else if (key === 'dataset' && typeof value === 'object') {
				// Apply data attributes
				Object.assign(element.dataset, value);
			} else if (key.startsWith('on') && typeof value === 'function') {
				// Add event listener
				const eventName = key.slice(2).toLowerCase();
				element.addEventListener(eventName, value);
			} else {
				// Set attribute
				element.setAttribute(key, value);
			}
		}
		
		// Add children
		for (const child of children) {
			if (child instanceof Node) {
				element.appendChild(child);
			} else if (child !== null && child !== undefined) {
				element.appendChild(document.createTextNode(String(child)));
			}
		}
		
		return element;
	} catch (error) {
		console.error('Error creating element:', error);
		return document.createElement('div');
	}
}

/**
 * Show a dialog
 * @param {Object} options - Dialog options
 * @returns {HTMLElement} Dialog element
 */
export function showDialog(options) {
	try {
		// Hide any existing dialogs
		closeDialog();
		
		// Play sound
		soundManager.play('click');
		
		// Create dialog container
		const dialogContainer = createElement('div', {
			className: 'dialog-container',
			style: {
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: 'rgba(0, 0, 0, 0.5)',
				zIndex: 1000
			}
		});
		
		// Create dialog element
		const dialog = createElement('div', {
			className: 'dialog',
			style: {
				backgroundColor: isDarkMode ? '#333' : '#fff',
				color: isDarkMode ? '#fff' : '#333',
				borderRadius: '8px',
				padding: '20px',
				maxWidth: '80%',
				maxHeight: '80%',
				overflow: 'auto',
				boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
			}
		});
		
		// Create dialog header
		const dialogHeader = createElement('div', {
			className: 'dialog-header',
			style: {
				borderBottom: isDarkMode ? '1px solid #555' : '1px solid #ddd',
				paddingBottom: '10px'
			}
		});
		
		// Create dialog title
		const dialogTitle = createElement('h3', {
			style: {
				margin: '0 0 15px 0',
				fontWeight: 'bold'
			}
		}, [options.title || 'Dialog']);
		
		dialogHeader.appendChild(dialogTitle);
		
		// Create close button if not disabled
		if (!options.hideClose) {
			const closeButton = createElement('button', {
				className: 'dialog-close',
				style: {
					position: 'absolute',
					top: '10px',
					right: '10px',
					background: 'none',
					border: 'none',
					fontSize: '20px',
					cursor: 'pointer',
					color: isDarkMode ? '#aaa' : '#666'
				},
				onClick: closeDialog
			}, ['×']);
			
			dialogHeader.appendChild(closeButton);
		}
		
		dialog.appendChild(dialogHeader);
		
		// Create dialog content
		const dialogContent = createElement('div', {
			className: 'dialog-content',
			style: {
				marginBottom: '15px'
			}
		});
		
		if (typeof options.content === 'string') {
			dialogContent.innerHTML = options.content;
		} else if (options.content instanceof Node) {
			dialogContent.appendChild(options.content);
		}
		
		dialog.appendChild(dialogContent);
		
		// Create dialog buttons if any
		if (options.buttons && options.buttons.length > 0) {
			const dialogButtons = createElement('div', {
				className: 'dialog-buttons',
				style: {
					display: 'flex',
					justifyContent: 'flex-end',
					gap: '10px',
					marginTop: '15px'
				}
			});
			
			options.buttons.forEach(buttonConfig => {
				const button = createElement('button', {
					className: `dialog-button ${buttonConfig.className || ''}`,
					style: {
						padding: '8px 16px',
						border: 'none',
						borderRadius: '4px',
						cursor: 'pointer',
						backgroundColor: buttonConfig.primary ? '#4a90e2' : isDarkMode ? '#555' : '#ddd',
						color: buttonConfig.primary ? '#fff' : isDarkMode ? '#fff' : '#333'
					},
					onClick: (event) => {
						if (buttonConfig.onClick) {
							buttonConfig.onClick(event);
						}
						
						if (buttonConfig.closeOnClick !== false) {
							closeDialog();
						}
					}
				}, [buttonConfig.text || 'OK']);
				
				dialogButtons.appendChild(button);
			});
			
			dialog.appendChild(dialogButtons);
		}
		
		// Add dialog to container
		dialogContainer.appendChild(dialog);
		
		// Add click handler to close on background click if needed
		if (options.closeOnBackgroundClick !== false) {
			dialogContainer.addEventListener('click', (event) => {
				if (event.target === dialogContainer) {
					closeDialog();
				}
			});
		}
		
		// Add to document
		rootElement.appendChild(dialogContainer);
		
		// Store active dialog
		activeDialog = {
			element: dialogContainer,
			onClose: options.onClose
		};
		
		// Animate dialog in
		setTimeout(() => {
			dialogContainer.classList.add('visible');
		}, 10);
		
		// Return dialog element
		return dialogContainer;
	} catch (error) {
		console.error('Error showing dialog:', error);
		return null;
	}
}

/**
 * Close the active dialog
 * @returns {boolean} Success status
 */
export function closeDialog() {
	try {
		if (!activeDialog) {
			return false;
		}
		
		// Remove dialog from DOM
		rootElement.removeChild(activeDialog.element);
		
		// Call onClose callback if provided
		if (activeDialog.onClose) {
			activeDialog.onClose();
		}
		
		// Clear active dialog
		activeDialog = null;
		
		return true;
	} catch (error) {
		console.error('Error closing dialog:', error);
		return false;
	}
}

/**
 * Show a notification
 * @param {Object|string} options - Notification options or message string
 * @param {string} type - Notification type (info, success, warning, error)
 * @param {number} duration - Duration in milliseconds
 * @returns {HTMLElement} - Notification element
 */
export function showNotification(options, type = 'info', duration = 3000) {
	try {
		let notificationOptions;
		
		if (typeof options === 'string') {
			notificationOptions = {
				message: options,
				type,
				duration
			};
		} else {
			notificationOptions = {
				...options,
				type: options.type || type,
				duration: options.duration || duration
			};
		}
		
		// Play appropriate sound based on notification type
		switch (notificationOptions.type) {
			case 'error':
				soundManager.play('error');
				break;
			case 'success':
				soundManager.play('success');
				break;
			default:
				soundManager.play('click');
				break;
		}
		
		// Create notification container if it doesn't exist
		let notificationContainer = document.getElementById('notification-container');
		
		if (!notificationContainer) {
			notificationContainer = createElement('div', {
				className: 'notification-container',
				style: {
					position: 'fixed',
					top: '20px',
					right: '20px',
					display: 'flex',
					flexDirection: 'column',
					gap: '10px',
					zIndex: 1001
				}
			});
			
			rootElement.appendChild(notificationContainer);
		}
		
		// Generate notification ID
		const id = ++notificationCounter;
		
		// Create notification element
		const notification = createElement('div', {
			className: `notification notification-${notificationOptions.type}`,
			style: {
				backgroundColor: getNotificationColor(notificationOptions.type),
				color: '#fff',
				padding: '12px 16px',
				borderRadius: '4px',
				boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
				minWidth: '200px',
				maxWidth: '300px',
				opacity: 0,
				transform: 'translateX(50px)',
				transition: 'opacity 0.3s, transform 0.3s'
			}
		});
		
		// Create content
		const content = createElement('div', {
			className: 'notification-content'
		});
		
		// Add title if provided
		if (notificationOptions.title) {
			const title = createElement('div', {
				className: 'notification-title',
				style: {
					fontWeight: 'bold',
					marginBottom: '4px'
				}
			}, [notificationOptions.title]);
			
			content.appendChild(title);
		}
		
		// Add message
		if (notificationOptions.message) {
			const message = createElement('div', {
				className: 'notification-message'
			}, [notificationOptions.message]);
			
			content.appendChild(message);
		}
		
		notification.appendChild(content);
		
		// Add close button
		const closeButton = createElement('button', {
			className: 'notification-close',
			style: {
				background: 'none',
				border: 'none',
				color: '#fff',
				cursor: 'pointer',
				marginLeft: '8px'
			},
			onClick: () => removeNotification(id)
		}, ['×']);
		
		notification.appendChild(closeButton);
		
		// Add to container
		notificationContainer.appendChild(notification);
		
		// Store notification
		notifications.push({
			id,
			element: notification,
			timeout: notificationOptions.duration !== Infinity ? setTimeout(() => removeNotification(id), notificationOptions.duration) : null
		});
		
		// Limit number of notifications
		if (notifications.length > MAX_NOTIFICATIONS) {
			removeNotification(notifications[0].id);
		}
		
		// Trigger animation
		setTimeout(() => {
			notification.style.opacity = '1';
			notification.style.transform = 'translateX(0)';
		}, 10);
		
		return notification;
	} catch (error) {
		console.error('Error showing notification:', error);
		return null;
	}
}

/**
 * Remove a notification
 * @param {number} id - Notification ID
 * @returns {boolean} Success status
 */
export function removeNotification(id) {
	try {
		const index = notifications.findIndex(n => n.id === id);
		
		if (index === -1) {
			return false;
		}
		
		const notification = notifications[index];
		
		// Clear timeout if exists
		if (notification.timeout) {
			clearTimeout(notification.timeout);
		}
		
		// Trigger exit animation
		notification.element.style.opacity = '0';
		notification.element.style.transform = 'translateX(50px)';
		
		// Remove after animation
		setTimeout(() => {
			try {
				notification.element.parentNode.removeChild(notification.element);
				
				// Remove from array
				notifications.splice(index, 1);
				
				// Remove container if empty
				if (notifications.length === 0) {
					const container = document.querySelector('.notification-container');
					if (container) {
						container.parentNode.removeChild(container);
					}
				}
			} catch (e) {
				console.error('Error removing notification element:', e);
			}
		}, 300);
		
		return true;
	} catch (error) {
		console.error('Error removing notification:', error);
		return false;
	}
}

/**
 * Create a menu
 * @param {Object} options - Menu options
 * @returns {HTMLElement} Menu element
 */
export function createMenu(options) {
	try {
		// Create menu container
		const menuContainer = createElement('div', {
			className: `menu-container ${options.className || ''}`,
			style: {
				backgroundColor: isDarkMode ? '#333' : '#fff',
				color: isDarkMode ? '#fff' : '#333',
				borderRadius: '4px',
				boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
				overflow: 'hidden',
				...options.style
			}
		});
		
		// Add title if provided
		if (options.title) {
			const titleElement = createElement('div', {
				className: 'menu-title',
				style: {
					padding: '12px 16px',
					fontWeight: 'bold',
					borderBottom: isDarkMode ? '1px solid #444' : '1px solid #eee'
				}
			}, [options.title]);
			
			menuContainer.appendChild(titleElement);
		}
		
		// Add items
		if (options.items && options.items.length > 0) {
			const menuList = createElement('ul', {
				className: 'menu-list',
				style: {
					listStyle: 'none',
					margin: 0,
					padding: 0
				}
			});
			
			for (const item of options.items) {
				if (item.separator) {
					// Add separator
					const separator = createElement('li', {
						className: 'menu-separator',
						style: {
							height: '1px',
							backgroundColor: isDarkMode ? '#444' : '#eee',
							margin: '4px 0'
						}
					});
					
					menuList.appendChild(separator);
				} else {
					// Add menu item
					const menuItem = createElement('li', {
						className: `menu-item ${item.disabled ? 'disabled' : ''} ${item.selected ? 'selected' : ''}`,
						style: {
							padding: '8px 16px',
							cursor: item.disabled ? 'default' : 'pointer',
							opacity: item.disabled ? 0.5 : 1,
							backgroundColor: item.selected ? (isDarkMode ? '#444' : '#f0f0f0') : 'transparent'
						},
						onClick: (event) => {
							if (!item.disabled && item.onClick) {
								item.onClick(event);
							}
						}
					});
					
					// Add icon if provided
					if (item.icon) {
						const icon = createElement('span', {
							className: 'menu-item-icon',
							style: {
								marginRight: '8px'
							}
						}, [item.icon]);
						
						menuItem.appendChild(icon);
					}
					
					// Add label
					const label = createElement('span', {
						className: 'menu-item-label'
					}, [item.label]);
					
					menuItem.appendChild(label);
					
					// Add shortcut if provided
					if (item.shortcut) {
						const shortcut = createElement('span', {
							className: 'menu-item-shortcut',
							style: {
								marginLeft: '16px',
								opacity: 0.7,
								fontSize: '0.9em'
							}
						}, [item.shortcut]);
						
						menuItem.appendChild(shortcut);
					}
					
					menuList.appendChild(menuItem);
				}
			}
			
			menuContainer.appendChild(menuList);
		}
		
		return menuContainer;
	} catch (error) {
		console.error('Error creating menu:', error);
		return document.createElement('div');
	}
}

/**
 * Create a button with the specified options
 * @param {Object} options - Button options
 * @returns {HTMLElement} - Button element
 */
export function createButton(options) {
	const button = document.createElement('button');
	button.className = options.className || 'btn';
	
	if (options.primary) {
		button.classList.add('btn-primary');
	}
	
	if (options.size) {
		button.classList.add(`btn-${options.size}`);
	}
	
	if (options.id) {
		button.id = options.id;
	}
	
	if (options.text) {
		button.textContent = options.text;
	}
	
	if (options.disabled) {
		button.disabled = true;
	}
	
	// Add sound effects for button interactions
	button.addEventListener('mouseenter', () => {
		soundManager.play('hover');
	});
	
	button.addEventListener('click', (event) => {
		soundManager.play('click');
		
		if (options.onClick) {
			options.onClick(event);
		}
	});
	
	return button;
}

/**
 * Toggle dark mode
 * @param {boolean} [enable] - Force enable/disable dark mode
 * @returns {boolean} New dark mode state
 */
export function toggleDarkMode(enable) {
	try {
		isDarkMode = enable !== undefined ? enable : !isDarkMode;
		applyTheme(isDarkMode);
		return isDarkMode;
	} catch (error) {
		console.error('Error toggling dark mode:', error);
		return isDarkMode;
	}
}

/**
 * Check if dark mode is enabled
 * @returns {boolean} Dark mode state
 */
export function isDarkModeEnabled() {
	return isDarkMode;
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up UI manager...');
		
		// Close active dialog
		if (activeDialog) {
			closeDialog();
		}
		
		// Remove all notifications
		for (const notification of [...notifications]) {
			removeNotification(notification.id);
		}
		
		// Remove window resize handler
		window.removeEventListener('resize', handleWindowResize);
		
		// Reset state
		components = {};
		rootElement = null;
		isInitialized = false;
		
		console.log('UI manager cleaned up');
	} catch (error) {
		console.error('Error cleaning up UI manager:', error);
	}
}

// Helper functions

/**
 * Apply theme to the document
 * @param {boolean} darkMode - Whether to apply dark mode
 */
function applyTheme(darkMode) {
	try {
		// Apply CSS variables
		document.documentElement.style.setProperty('--bg-color', darkMode ? '#222' : '#f5f5f5');
		document.documentElement.style.setProperty('--text-color', darkMode ? '#fff' : '#333');
		document.documentElement.style.setProperty('--primary-color', '#4a90e2');
		document.documentElement.style.setProperty('--secondary-color', darkMode ? '#444' : '#ddd');
		document.documentElement.style.setProperty('--border-color', darkMode ? '#555' : '#ddd');
		
		// Add/remove dark mode class
		if (darkMode) {
			document.body.classList.add('dark-mode');
		} else {
			document.body.classList.remove('dark-mode');
		}
	} catch (error) {
		console.error('Error applying theme:', error);
	}
}

/**
 * Get notification background color based on type
 * @param {string} type - Notification type
 * @returns {string} Color
 */
function getNotificationColor(type) {
	switch (type) {
		case 'success':
			return '#4caf50';
		case 'error':
			return '#f44336';
		case 'warning':
			return '#ff9800';
		case 'info':
		default:
			return '#2196f3';
	}
}

/**
 * Handle game state change
 * @param {string} newState - New game state
 * @param {string} oldState - Old game state
 * @param {Object} data - State change data
 */
export function handleGameStateChange(newState, oldState, data) {
	try {
		// Throttle updates to prevent excessive rendering
		const now = Date.now();
		if (now - lastStateUpdateTime < MIN_UPDATE_INTERVAL) {
			return; // Skip this update if too soon after the last one
		}
		lastStateUpdateTime = now;
		
		if (debugMode) {
			console.log(`UI handling game state change from ${oldState} to ${newState}`);
		}
		
		// Update UI based on state change
		switch (newState) {
			case gameStateManager.GAME_STATES.MENU:
				// Show menu UI
				showScreen('menu-screen');
				break;
				
			case gameStateManager.GAME_STATES.CONNECTING:
				// Show connecting UI
				showNotification({
					type: 'info',
					message: 'Connecting to server...'
				});
				break;
				
			case gameStateManager.GAME_STATES.PLAYING:
				// Show game UI and hide menu
				showScreen('game-screen');
				
				// Explicitly hide the menu screen
				const menuScreen = document.getElementById('menu-screen');
				if (menuScreen) {
					menuScreen.classList.remove('visible');
					menuScreen.style.display = 'none';
				}
				
				if (oldState === gameStateManager.GAME_STATES.PAUSED) {
					showNotification({
						type: 'info',
						message: 'Game resumed'
					});
				} else {
					showNotification({
						type: 'success',
						message: 'Game started'
					});
				}
				break;
				
			case gameStateManager.GAME_STATES.PAUSED:
				// Show pause UI
				showNotification({
					type: 'info',
					message: 'Game paused'
				});
				break;
				
			case gameStateManager.GAME_STATES.GAME_OVER:
				// Show game over UI
				showDialog({
					title: 'Game Over',
					content: `
						<p>${data.result === 'win' ? 'You won!' : 'Game over!'}</p>
						<p>Score: ${data.score || 0}</p>
						<p>Level: ${data.level || 1}</p>
					`,
					buttons: [
						{
							text: 'Play Again',
							primary: true,
							onClick: () => {
								gameStateManager.startGame();
							}
						},
						{
							text: 'Main Menu',
							onClick: () => {
								gameStateManager.setState(gameStateManager.GAME_STATES.MENU);
							}
						}
					]
				});
				break;
		}
	} catch (error) {
		console.error('Error handling game state change:', error);
	}
}

/**
 * Handle window resize
 */
function handleWindowResize() {
	try {
		// Trigger resize event for all components
		for (const id in components) {
			if (components[id].onResize) {
				components[id].onResize();
			}
		}
	} catch (error) {
		console.error('Error handling window resize:', error);
	}
}

/**
 * Show a specific screen
 * @param {string} screenName - Screen name to show
 * @returns {boolean} Success status
 */
export function showScreen(screenName) {
	try {
		// Get all screens
		const screens = document.querySelectorAll('.screen');
		
		// Hide all screens (but maintain in DOM for transitions)
		screens.forEach(screen => {
			screen.classList.remove('visible');
			// Don't immediately hide to allow for transition
			setTimeout(() => {
				if (!screen.classList.contains('visible')) {
					screen.style.display = 'none';
				}
			}, 500); // Match transition time
		});
		
		// Show requested screen
		let screenToShow;
		
		switch (screenName) {
			case 'loading':
			case 'loading-screen':
				screenToShow = document.getElementById('loading-screen');
				break;
				
			case 'menu':
			case 'menu-screen':
				screenToShow = document.getElementById('menu-screen');
				break;
				
			case 'game':
			case 'game-screen':
				screenToShow = document.getElementById('game-screen');
				break;
				
			case 'pause':
			case 'pause-screen':
				screenToShow = document.getElementById('pause-screen');
				if (!screenToShow) {
					// Create pause screen if it doesn't exist
					screenToShow = createElement('div', {
						id: 'pause-screen',
						className: 'screen',
						style: {
							position: 'fixed',
							top: 0,
							left: 0,
							width: '100%',
							height: '100%',
							backgroundColor: 'rgba(0, 0, 0, 0.7)',
							display: 'flex',
							flexDirection: 'column',
							justifyContent: 'center',
							alignItems: 'center',
							zIndex: 100
						}
					});
					
					const pauseContent = createElement('div', {
						className: 'pause-content',
						style: {
							backgroundColor: isDarkMode ? '#333' : '#fff',
							color: isDarkMode ? '#fff' : '#333',
							padding: '20px',
							borderRadius: '8px',
							textAlign: 'center'
						}
					});
					
					const pauseTitle = createElement('h2', {}, ['Game Paused']);
					pauseContent.appendChild(pauseTitle);
					
					const resumeButton = createButton({
						label: 'Resume',
						primary: true,
						onClick: () => {
							gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
						}
					});
					pauseContent.appendChild(resumeButton);
					
					const menuButton = createButton({
						label: 'Main Menu',
						style: { marginLeft: '10px' },
						onClick: () => {
							gameStateManager.setState(gameStateManager.GAME_STATES.MENU);
						}
					});
					pauseContent.appendChild(menuButton);
					
					screenToShow.appendChild(pauseContent);
					document.body.appendChild(screenToShow);
				}
				break;
				
			case 'game-over':
			case 'game-over-screen':
				screenToShow = document.getElementById('game-over-screen');
				if (!screenToShow) {
					// Create game over screen if it doesn't exist
					screenToShow = createElement('div', {
						id: 'game-over-screen',
						className: 'screen',
						style: {
							position: 'fixed',
							top: 0,
							left: 0,
							width: '100%',
							height: '100%',
							backgroundColor: 'rgba(0, 0, 0, 0.7)',
							display: 'flex',
							flexDirection: 'column',
							justifyContent: 'center',
							alignItems: 'center',
							zIndex: 100
						}
					});
					
					const gameOverContent = createElement('div', {
						className: 'game-over-content',
						style: {
							backgroundColor: isDarkMode ? '#333' : '#fff',
							color: isDarkMode ? '#fff' : '#333',
							padding: '20px',
							borderRadius: '8px',
							textAlign: 'center'
						}
					});
					
					const gameOverTitle = createElement('h2', {}, ['Game Over']);
					gameOverContent.appendChild(gameOverTitle);
					
					const restartButton = createButton({
						label: 'Play Again',
						primary: true,
						onClick: () => {
							gameStateManager.setState(gameStateManager.GAME_STATES.PLAYING);
						}
					});
					gameOverContent.appendChild(restartButton);
					
					const menuButton = createButton({
						label: 'Main Menu',
						style: { marginLeft: '10px' },
						onClick: () => {
							gameStateManager.setState(gameStateManager.GAME_STATES.MENU);
						}
					});
					gameOverContent.appendChild(menuButton);
					
					screenToShow.appendChild(gameOverContent);
					document.body.appendChild(screenToShow);
				}
				break;
				
			default:
				console.warn(`Unknown screen: ${screenName}`);
				return false;
		}
		
		if (screenToShow) {
			// First make it display flex (but invisible)
			screenToShow.style.display = 'flex';
			
			// Force a reflow before setting the visible class
			void screenToShow.offsetWidth;
			
			// Add visible class to trigger transition
			screenToShow.classList.add('visible');
			return true;
		} else {
			console.error(`Screen not found: ${screenName}`);
			return false;
		}
	} catch (error) {
		console.error('Error showing screen:', error);
		return false;
	}
}

/**
 * Creates a player information panel 
 * @param {string} containerId - ID of the container element
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The created panel element
 */
export function createPlayerInfoPanel(containerId = 'game-container', options = {}) {
	const container = document.getElementById(containerId);
	if (!container) {
		console.error(`Container element with ID ${containerId} not found`);
		return null;
	}

	// Create panel element
	const panel = createElement('div', {
		className: 'ui-panel player-info-panel ' + (options.position || 'top-right')
	});

	// Add header
	const header = createElement('div', { className: 'panel-header' }, [
		createElement('h3', {}, ['Players'])
	]);
	panel.appendChild(header);

	// Add content container
	const content = createElement('div', { className: 'panel-content' });
	
	// Add player list
	const playerList = createElement('div', { className: 'player-list' });
	content.appendChild(playerList);
	
	// Add game info section
	const gameInfo = createElement('div', { className: 'game-info' });
	
	// Add turn phase info
	const turnPhase = createElement('div', { className: 'turn-phase' }, [
		createElement('span', { className: 'label' }, ['Phase:']),
		createElement('span', { className: 'value phase-chess' }, ['Chess'])
	]);
	gameInfo.appendChild(turnPhase);
	
	// Add time remaining
	const timeRemaining = createElement('div', { className: 'time-remaining' }, [
		createElement('span', { className: 'label' }, ['Time:']),
		createElement('span', { className: 'value' }, ['0:30'])
	]);
	gameInfo.appendChild(timeRemaining);
	
	content.appendChild(gameInfo);
	panel.appendChild(content);
	
	// Add to container
	container.appendChild(panel);
	
	// Register component
	registerComponent('playerInfoPanel', {
		element: panel,
		playerList,
		turnPhase,
		timeRemaining
	});
	
	return panel;
}

/**
 * Updates the player information panel with current game state
 * @param {Object} gameState - Current game state
 */
export function updatePlayerInfoPanel(gameState) {
	const panel = getComponent('playerInfoPanel');
	if (!panel) return;
	
	const { playerList, turnPhase, timeRemaining } = panel;
	
	// Clear player list
	playerList.innerHTML = '';
	
	// Check if we have players
	if (!gameState.players || Object.keys(gameState.players).length === 0) {
		const placeholder = createElement('div', { 
			className: 'player-item placeholder' 
		}, ['Waiting for players...']);
		playerList.appendChild(placeholder);
		return;
	}
	
	// Get local player ID
	const localPlayerId = gameState.localPlayerId || '';
	const currentPlayerId = gameState.currentPlayerId || '';
	
	// Add players
	Object.entries(gameState.players).forEach(([playerId, player]) => {
		const isLocal = playerId === localPlayerId;
		const isCurrent = playerId === currentPlayerId;
		
		const playerItem = createElement('div', { 
			className: `player-item ${isLocal ? 'local-player' : ''} ${isCurrent ? 'current-player' : ''}`,
			dataset: { playerId }
		});
		
		// Player info (color and name)
		const playerInfo = createElement('div', { className: 'player-info' }, [
			createElement('div', { 
				className: 'player-color',
				style: { backgroundColor: player.color || '#888' }
			}),
			createElement('div', { className: 'player-name' }, [player.name || `Player ${playerId}`])
		]);
		playerItem.appendChild(playerInfo);
		
		// Player stats
		const playerStats = createElement('div', { className: 'player-stats' }, [
			createElement('div', { className: 'player-score' }, [`Score: ${player.score || 0}`]),
			createElement('div', { className: 'captured-pieces' }, [
				`Captured: ${player.capturedPieces?.length || 0}`
			])
		]);
		
		// Player status if needed
		if (player.status) {
			const statusEl = createElement('div', { 
				className: `player-status ${player.status.toLowerCase()}` 
			}, [player.status]);
			playerStats.appendChild(statusEl);
		}
		
		playerItem.appendChild(playerStats);
		playerList.appendChild(playerItem);
	});
	
	// Update turn phase
	if (gameState.currentPhase) {
		const phaseValueEl = turnPhase.querySelector('.value');
		if (phaseValueEl) {
			phaseValueEl.textContent = gameState.currentPhase;
			phaseValueEl.className = `value phase-${gameState.currentPhase.toLowerCase()}`;
		}
	}
	
	// Update time remaining
	if (gameState.turnTimeRemaining !== undefined) {
		const timeValueEl = timeRemaining.querySelector('.value');
		if (timeValueEl) {
			const seconds = Math.max(0, Math.floor(gameState.turnTimeRemaining / 1000));
			const minutes = Math.floor(seconds / 60);
			const remainingSeconds = seconds % 60;
			
			const formattedTime = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
			timeValueEl.textContent = formattedTime;
			
			// Add warning classes
			timeValueEl.classList.remove('warning', 'urgent');
			if (seconds <= 5) {
				timeValueEl.classList.add('urgent');
			} else if (seconds <= 15) {
				timeValueEl.classList.add('warning');
			}
		}
	}
}

/**
 * Creates a game status indicator
 * @param {string} containerId - ID of the container element
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} The created status indicator element
 */
export function createGameStatusIndicator(containerId = 'game-container', options = {}) {
	const container = document.getElementById(containerId);
	if (!container) {
		console.error(`Container element with ID ${containerId} not found`);
		return null;
	}
	
	// Create status indicator element
	const indicator = createElement('div', {
		className: 'game-status-indicator ' + (options.position || 'top-center'),
		id: 'game-status-indicator'
	}, [
		createElement('div', { className: 'status-icon waiting' }),
		createElement('div', { className: 'status-text' }, ['Waiting for game to start'])
	]);
	
	// Add to container
	container.appendChild(indicator);
	
	// Register component
	registerComponent('gameStatusIndicator', {
		element: indicator,
		iconElement: indicator.querySelector('.status-icon'),
		textElement: indicator.querySelector('.status-text')
	});
	
	return indicator;
}

/**
 * Updates the game status indicator based on current game state
 * @param {Object} gameState - Current game state
 */
export function updateGameStatusIndicator(gameState) {
	const indicator = getComponent('gameStatusIndicator');
	if (!indicator) return;
	
	const { iconElement, textElement } = indicator;
	
	// Reset classes
	iconElement.className = 'status-icon';
	
	// Set status based on game state
	if (!gameState.isGameStarted) {
		iconElement.classList.add('waiting');
		textElement.textContent = 'Waiting for game to start';
	} else if (gameState.isGamePaused) {
		iconElement.classList.add('paused');
		textElement.textContent = 'Game paused';
	} else if (gameState.isGameOver) {
		iconElement.classList.add('gameover');
		textElement.textContent = 'Game over';
	} else if (gameState.isLoading) {
		iconElement.classList.add('loading');
		textElement.textContent = 'Loading...';
	} else if (gameState.isLocalPlayerTurn) {
		// It's the local player's turn
		if (gameState.currentPhase === 'CHESS') {
			iconElement.classList.add('yourturn-chess');
			textElement.textContent = 'Your turn - Chess phase';
		} else if (gameState.currentPhase === 'TETROMINO') {
			iconElement.classList.add('yourturn-tetromino');
			textElement.textContent = 'Your turn - Tetromino phase';
		} else {
			iconElement.classList.add('yourturn');
			textElement.textContent = 'Your turn';
		}
		iconElement.classList.add('pulse');
	} else {
		// It's another player's turn
		iconElement.classList.add('opponentturn');
		
		// Get current player name if available
		let playerName = 'Opponent';
		if (gameState.currentPlayerId && gameState.players && gameState.players[gameState.currentPlayerId]) {
			playerName = gameState.players[gameState.currentPlayerId].name || 'Opponent';
		}
		
		if (gameState.currentPhase) {
			textElement.textContent = `${playerName}'s turn - ${gameState.currentPhase} phase`;
		} else {
			textElement.textContent = `${playerName}'s turn`;
		}
	}
}

/**
 * Create a turn indicator UI element
 * @param {string} containerId - ID of container element
 * @returns {HTMLElement} Turn indicator element
 */
export function createTurnIndicator(containerId = 'game-container') {
	try {
		// Remove existing turn indicator if any
		const existingIndicator = document.getElementById('turn-indicator');
		if (existingIndicator) {
			existingIndicator.remove();
		}
		
		// Create turn indicator container
		const turnIndicator = document.createElement('div');
		turnIndicator.id = 'turn-indicator';
		turnIndicator.className = 'turn-indicator';
		
		// Create phase indicators
		const phases = ['Tetromino', 'Chess', 'Waiting'];
		phases.forEach(phase => {
			const phaseIndicator = document.createElement('div');
			phaseIndicator.className = `phase-indicator phase-${phase.toLowerCase()}`;
			phaseIndicator.innerHTML = `
				<span class="phase-name">${phase}</span>
				<span class="phase-timer"></span>
			`;
			turnIndicator.appendChild(phaseIndicator);
		});
		
		// Create turn timer
		const turnTimer = document.createElement('div');
		turnTimer.className = 'turn-timer';
		turnTimer.innerHTML = `
			<span class="timer-label">Minimum Turn:</span>
			<span class="timer-value">10s</span>
		`;
		turnIndicator.appendChild(turnTimer);
		
		// Add to container
		const container = document.getElementById(containerId);
		if (container) {
			container.appendChild(turnIndicator);
		} else {
			document.body.appendChild(turnIndicator);
		}
		
		// Add CSS
		const style = document.createElement('style');
		style.textContent = `
			.turn-indicator {
				position: absolute;
				bottom: 20px;
				right: 20px;
				background-color: rgba(0, 0, 0, 0.7);
				border-radius: 8px;
				padding: 10px;
				color: white;
				z-index: 100;
				font-family: Arial, sans-serif;
				display: flex;
				flex-direction: column;
				gap: 5px;
				min-width: 150px;
			}
			
			.phase-indicator {
				display: flex;
				justify-content: space-between;
				padding: 5px;
				border-radius: 4px;
				opacity: 0.5;
			}
			
			.phase-indicator.active {
				opacity: 1;
				background-color: rgba(255, 255, 255, 0.2);
				font-weight: bold;
			}
			
			.phase-tetromino.active {
				border-left: 4px solid #00FFFF;
			}
			
			.phase-chess.active {
				border-left: 4px solid #FF8800;
			}
			
			.phase-waiting.active {
				border-left: 4px solid #FF3333;
			}
			
			.turn-timer {
				display: flex;
				justify-content: space-between;
				margin-top: 5px;
				padding-top: 5px;
				border-top: 1px solid rgba(255, 255, 255, 0.3);
			}
			
			.timer-value {
				font-weight: bold;
			}
		`;
		document.head.appendChild(style);
		
		return turnIndicator;
	} catch (error) {
		console.error('Error creating turn indicator:', error);
		return null;
	}
}

/**
 * Update the turn indicator
 * @param {Object} gameState - Current game state
 */
export function updateTurnIndicator(gameState) {
	try {
		// Get turn indicator element
		let turnIndicator = document.getElementById('turn-indicator');
		
		// Create it if it doesn't exist
		if (!turnIndicator) {
			turnIndicator = createTurnIndicator();
		}
		
		if (!turnIndicator) return;
		
		// Get the current phase from game state
		const currentPhase = gameState.turnPhase || 'tetromino';
		
		// Update phase indicators
		const phaseIndicators = turnIndicator.querySelectorAll('.phase-indicator');
		phaseIndicators.forEach(indicator => {
			// Remove active class from all
			indicator.classList.remove('active');
			
			// Check if this is the current phase
			const phaseClass = Array.from(indicator.classList).find(cls => cls.startsWith('phase-'));
			if (phaseClass) {
				const phase = phaseClass.replace('phase-', '');
				if (phase === currentPhase.toLowerCase()) {
					indicator.classList.add('active');
				}
			}
		});
		
		// Update timer
		const timerValue = turnIndicator.querySelector('.timer-value');
		if (timerValue) {
			if (typeof gameStateManager !== 'undefined' && gameStateManager.getRemainingMinimumTurnTime) {
				const remainingTime = gameStateManager.getRemainingMinimumTurnTime();
				timerValue.textContent = `${Math.ceil(remainingTime / 1000)}s`;
				
				// Visual indication of time remaining
				if (remainingTime <= 3000) {
					timerValue.style.color = '#FF3333'; // Red when almost done
				} else if (remainingTime <= 5000) {
					timerValue.style.color = '#FFCC00'; // Yellow when half done
				} else {
					timerValue.style.color = '#FFFFFF'; // White otherwise
				}
			} else {
				timerValue.textContent = '10s';
			}
		}
	} catch (error) {
		console.error('Error updating turn indicator:', error);
	}
}

/**
 * Updates all UI components based on the current game state
 * @param {Object} gameState - Current game state
 */
export function updateUI(gameState) {
	try {
		// Update player info panel
		updatePlayerInfoPanel(gameState);
		
		// Update game status indicator
		updateGameStatusIndicator(gameState);
		
		// Update turn indicator
		updateTurnIndicator(gameState);
		
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Show the settings menu dialog
 * @returns {HTMLElement} The dialog element
 */
export function showSettingsMenu() {
	// Create settings content
	const settingsContent = document.createElement('div');
	settingsContent.className = 'settings-content';
	
	// Create volume settings
	const volumeSettings = document.createElement('div');
	volumeSettings.className = 'settings-section';
	
	// Create main volume slider
	const masterVolumeContainer = document.createElement('div');
	masterVolumeContainer.className = 'settings-item';
	
	const masterVolumeLabel = document.createElement('label');
	masterVolumeLabel.textContent = 'Master Volume:';
	masterVolumeContainer.appendChild(masterVolumeLabel);
	
	const masterVolumeSlider = document.createElement('input');
	masterVolumeSlider.type = 'range';
	masterVolumeSlider.min = '0';
	masterVolumeSlider.max = '100';
	masterVolumeSlider.value = Math.round(soundManager.getMasterVolume() * 100);
	masterVolumeSlider.addEventListener('input', () => {
		soundManager.setMasterVolume(parseInt(masterVolumeSlider.value) / 100);
		localStorage.setItem('masterVolume', soundManager.getMasterVolume().toString());
	});
	masterVolumeContainer.appendChild(masterVolumeSlider);
	
	volumeSettings.appendChild(masterVolumeContainer);
	
	// Create music volume slider
	const musicVolumeContainer = document.createElement('div');
	musicVolumeContainer.className = 'settings-item';
	
	const musicVolumeLabel = document.createElement('label');
	musicVolumeLabel.textContent = 'Music Volume:';
	musicVolumeContainer.appendChild(musicVolumeLabel);
	
	const musicVolumeSlider = document.createElement('input');
	musicVolumeSlider.type = 'range';
	musicVolumeSlider.min = '0';
	musicVolumeSlider.max = '100';
	musicVolumeSlider.value = Math.round(soundManager.getMusicVolume() * 100);
	musicVolumeSlider.addEventListener('input', () => {
		soundManager.setMusicVolume(parseInt(musicVolumeSlider.value) / 100);
		localStorage.setItem('musicVolume', soundManager.getMusicVolume().toString());
	});
	musicVolumeContainer.appendChild(musicVolumeSlider);
	
	volumeSettings.appendChild(musicVolumeContainer);
	
	// Create SFX volume slider
	const sfxVolumeContainer = document.createElement('div');
	sfxVolumeContainer.className = 'settings-item';
	
	const sfxVolumeLabel = document.createElement('label');
	sfxVolumeLabel.textContent = 'SFX Volume:';
	sfxVolumeContainer.appendChild(sfxVolumeLabel);
	
	const sfxVolumeSlider = document.createElement('input');
	sfxVolumeSlider.type = 'range';
	sfxVolumeSlider.min = '0';
	sfxVolumeSlider.max = '100';
	sfxVolumeSlider.value = Math.round(soundManager.getSfxVolume() * 100);
	sfxVolumeSlider.addEventListener('input', () => {
		soundManager.setSfxVolume(parseInt(sfxVolumeSlider.value) / 100);
		localStorage.setItem('sfxVolume', soundManager.getSfxVolume().toString());
	});
	sfxVolumeContainer.appendChild(sfxVolumeSlider);
	
	volumeSettings.appendChild(sfxVolumeContainer);
	
	// Create mute toggle
	const muteContainer = document.createElement('div');
	muteContainer.className = 'settings-item';
	
	const muteLabel = document.createElement('label');
	muteLabel.textContent = 'Mute All Sound:';
	muteContainer.appendChild(muteLabel);
	
	const muteToggle = document.createElement('input');
	muteToggle.type = 'checkbox';
	muteToggle.checked = soundManager.isMuted();
	muteToggle.addEventListener('change', () => {
		soundManager.mute(muteToggle.checked);
		localStorage.setItem('soundMuted', soundManager.isMuted().toString());
	});
	muteContainer.appendChild(muteToggle);
	
	volumeSettings.appendChild(muteContainer);
	
	// Create display settings
	const displaySettings = document.createElement('div');
	displaySettings.className = 'settings-section';
	
	// Create dark mode toggle
	const darkModeContainer = document.createElement('div');
	darkModeContainer.className = 'settings-item';
	
	const darkModeLabel = document.createElement('label');
	darkModeLabel.textContent = 'Dark Mode:';
	darkModeContainer.appendChild(darkModeLabel);
	
	const darkModeToggle = document.createElement('input');
	darkModeToggle.type = 'checkbox';
	darkModeToggle.checked = isDarkModeEnabled();
	darkModeToggle.addEventListener('change', () => {
		toggleDarkMode(darkModeToggle.checked);
		localStorage.setItem('darkMode', isDarkModeEnabled().toString());
	});
	darkModeContainer.appendChild(darkModeToggle);
	
	displaySettings.appendChild(darkModeContainer);
	
	// Create render quality selector
	const renderQualityContainer = document.createElement('div');
	renderQualityContainer.className = 'settings-item';
	
	const renderQualityLabel = document.createElement('label');
	renderQualityLabel.textContent = 'Render Quality:';
	renderQualityContainer.appendChild(renderQualityLabel);
	
	const renderQualitySelector = document.createElement('select');
	
	const lowOption = document.createElement('option');
	lowOption.value = 'low';
	lowOption.textContent = 'Low';
	
	const mediumOption = document.createElement('option');
	mediumOption.value = 'medium';
	mediumOption.textContent = 'Medium';
	
	const highOption = document.createElement('option');
	highOption.value = 'high';
	highOption.textContent = 'High';
	
	renderQualitySelector.appendChild(lowOption);
	renderQualitySelector.appendChild(mediumOption);
	renderQualitySelector.appendChild(highOption);
	
	// Set current value based on localStorage
	renderQualitySelector.value = localStorage.getItem('renderQuality') || 'medium';
	
	renderQualitySelector.addEventListener('change', () => {
		localStorage.setItem('renderQuality', renderQualitySelector.value);
		
		// Notify about render quality change
		import('./gameRenderer.js').then(gameRenderer => {
			gameRenderer.setRenderQuality(renderQualitySelector.value);
		});
		
		// Show notification
		showNotification({
			message: 'Render quality changed to ' + renderQualitySelector.value,
			type: 'info',
			duration: 2000
		});
	});
	
	renderQualityContainer.appendChild(renderQualitySelector);
	displaySettings.appendChild(renderQualityContainer);
	
	// Add sections to settings content
	const volumeHeader = document.createElement('h3');
	volumeHeader.textContent = 'Audio Settings';
	settingsContent.appendChild(volumeHeader);
	settingsContent.appendChild(volumeSettings);
	
	const displayHeader = document.createElement('h3');
	displayHeader.textContent = 'Display Settings';
	settingsContent.appendChild(displayHeader);
	settingsContent.appendChild(displaySettings);
	
	// Show dialog with settings
	return showDialog({
		title: 'Settings',
		content: settingsContent,
		buttons: [
			{
				text: 'Apply',
				primary: true,
				onClick: () => {
					// All settings are applied immediately, so no extra action needed
					showNotification({
						message: 'Settings saved',
						type: 'success',
						duration: 2000
					});
				}
			},
			{
				text: 'Reset to Defaults',
				onClick: () => {
					// Reset audio settings
					soundManager.setMasterVolume(0.7);
					soundManager.setMusicVolume(0.5);
					soundManager.setSfxVolume(0.8);
					soundManager.mute(false);
					
					// Reset display settings
					toggleDarkMode(true);
					
					// Reset localStorage
					localStorage.setItem('masterVolume', '0.7');
					localStorage.setItem('musicVolume', '0.5');
					localStorage.setItem('sfxVolume', '0.8');
					localStorage.setItem('soundMuted', 'false');
					localStorage.setItem('darkMode', 'true');
					localStorage.setItem('renderQuality', 'medium');
					
					// Update UI elements
					masterVolumeSlider.value = 70;
					musicVolumeSlider.value = 50;
					sfxVolumeSlider.value = 80;
					muteToggle.checked = false;
					darkModeToggle.checked = true;
					renderQualitySelector.value = 'medium';
					
					// Notify about reset
					showNotification({
						message: 'Settings reset to defaults',
						type: 'info',
						duration: 2000
					});
				}
			}
		]
	});
} 
/**
 * UI Manager Utility
 *
 * Manages UI components and interactions for the game
 */

import * as gameStateManager from './gameStateManager.js';

// UI component registry
const components = {};
let rootElement = null;
let isInitialized = false;
let activeDialog = null;
let notifications = [];
let notificationCounter = 0;
let isDarkMode = false;

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
		// Close any existing dialog
		if (activeDialog) {
			closeDialog();
		}
		
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
		
		// Create dialog content
		const dialogContent = createElement('div', {
			className: 'dialog-content',
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
		
		// Add title if provided
		if (options.title) {
			const titleElement = createElement('h2', {
				className: 'dialog-title',
				style: {
					margin: '0 0 15px 0',
					borderBottom: isDarkMode ? '1px solid #555' : '1px solid #ddd',
					paddingBottom: '10px'
				}
			}, [options.title]);
			
			dialogContent.appendChild(titleElement);
		}
		
		// Add content
		if (options.content) {
			if (typeof options.content === 'string') {
				const contentElement = createElement('div', {
					className: 'dialog-body',
					style: {
						marginBottom: '15px'
					}
				});
				contentElement.innerHTML = options.content;
				dialogContent.appendChild(contentElement);
			} else if (options.content instanceof Node) {
				dialogContent.appendChild(options.content);
			}
		}
		
		// Add buttons
		if (options.buttons && options.buttons.length > 0) {
			const buttonContainer = createElement('div', {
				className: 'dialog-buttons',
				style: {
					display: 'flex',
					justifyContent: 'flex-end',
					gap: '10px',
					marginTop: '15px'
				}
			});
			
			for (const button of options.buttons) {
				const buttonElement = createElement('button', {
					className: `dialog-button ${button.className || ''}`,
					style: {
						padding: '8px 16px',
						border: 'none',
						borderRadius: '4px',
						cursor: 'pointer',
						backgroundColor: button.primary ? '#4a90e2' : isDarkMode ? '#555' : '#ddd',
						color: button.primary ? '#fff' : isDarkMode ? '#fff' : '#333'
					},
					onClick: (event) => {
						if (button.onClick) {
							button.onClick(event);
						}
						if (button.closeDialog !== false) {
							closeDialog();
						}
					}
				}, [button.text || 'OK']);
				
				buttonContainer.appendChild(buttonElement);
			}
			
			dialogContent.appendChild(buttonContainer);
		}
		
		// Add close button if needed
		if (options.closable !== false) {
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
			
			dialogContent.appendChild(closeButton);
		}
		
		// Add dialog to container
		dialogContainer.appendChild(dialogContent);
		
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
 * @param {string|Object} options - Notification message or options
 * @param {string} [type] - Notification type (if first param is string)
 * @returns {number} Notification ID
 */
export function showNotification(options, type = 'info') {
	try {
		// Convert string message to options object
		if (typeof options === 'string') {
			options = {
				message: options,
				type: type
			};
		}
		
		// Ensure we have a valid root element
		if (!rootElement || !rootElement.appendChild) {
			console.warn('UI Manager: No valid root element for notifications, using document.body');
			rootElement = document.body;
		}
		
		// Create notification container if it doesn't exist
		let notificationContainer = document.querySelector('.notification-container');
		
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
			className: `notification ${options.type || 'info'}`,
			style: {
				backgroundColor: getNotificationColor(options.type),
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
		if (options.title) {
			const title = createElement('div', {
				className: 'notification-title',
				style: {
					fontWeight: 'bold',
					marginBottom: '4px'
				}
			}, [options.title]);
			
			content.appendChild(title);
		}
		
		// Add message
		if (options.message) {
			const message = createElement('div', {
				className: 'notification-message'
			}, [options.message]);
			
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
			timeout: options.duration !== false ? setTimeout(() => removeNotification(id), options.duration || NOTIFICATION_DURATION) : null
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
		
		return id;
	} catch (error) {
		console.error('Error showing notification:', error);
		return -1;
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
 * Create a button
 * @param {Object} options - Button options
 * @returns {HTMLElement} Button element
 */
export function createButton(options) {
	try {
		// Create button element
		const button = createElement('button', {
			className: `ui-button ${options.className || ''}`,
			disabled: options.disabled,
			style: {
				padding: '8px 16px',
				borderRadius: '4px',
				border: 'none',
				cursor: options.disabled ? 'default' : 'pointer',
				backgroundColor: options.primary ? '#4a90e2' : isDarkMode ? '#555' : '#eee',
				color: options.primary ? '#fff' : isDarkMode ? '#fff' : '#333',
				opacity: options.disabled ? 0.5 : 1,
				...options.style
			},
			onClick: (event) => {
				if (!options.disabled && options.onClick) {
					options.onClick(event);
				}
			}
		});
		
		// Add icon if provided
		if (options.icon) {
			const icon = createElement('span', {
				className: 'button-icon',
				style: {
					marginRight: options.label ? '8px' : 0
				}
			}, [options.icon]);
			
			button.appendChild(icon);
		}
		
		// Add label if provided
		if (options.label) {
			const label = createElement('span', {
				className: 'button-label'
			}, [options.label]);
			
			button.appendChild(label);
		}
		
		return button;
	} catch (error) {
		console.error('Error creating button:', error);
		return document.createElement('button');
	}
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
function handleGameStateChange(newState, oldState, data) {
	try {
		console.log(`UI handling game state change: ${oldState} -> ${newState}`);
		
		// Update UI based on state change
		switch (newState) {
			case gameStateManager.GAME_STATES.MENU:
				// Show menu UI
				break;
				
			case gameStateManager.GAME_STATES.CONNECTING:
				// Show connecting UI
				showNotification({
					type: 'info',
					message: 'Connecting to server...'
				});
				break;
				
			case gameStateManager.GAME_STATES.PLAYING:
				// Show game UI
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
		
		// Hide all screens
		screens.forEach(screen => {
			screen.style.display = 'none';
		});
		
		// Show requested screen
		let screenToShow;
		
		switch (screenName) {
			case 'loading':
				screenToShow = document.getElementById('loading-screen');
				break;
				
			case 'menu':
				screenToShow = document.getElementById('menu-screen');
				break;
				
			case 'game':
				screenToShow = document.getElementById('game-screen');
				break;
				
			case 'pause':
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
				console.error(`Unknown screen: ${screenName}`);
				return false;
		}
		
		if (screenToShow) {
			screenToShow.style.display = 'block';
			return true;
		}
		
		return false;
	} catch (error) {
		console.error(`Error showing screen ${screenName}:`, error);
		return false;
	}
} 
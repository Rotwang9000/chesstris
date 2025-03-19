/**
 * Wallet Manager - UI for Solana wallet integrations
 */
import SessionManager from '../services/sessionManager.js';

// DOM Elements
let walletContainer;
let connectButton;
let walletStatus;
let walletAddress;
let saveGameBtn;
let loadGameBtn;

/**
 * Initialize the wallet manager UI
 */
export function initWalletUI() {
	try {
		// Create the wallet container
		createWalletUI();
		
		// Set up event handlers
		setupEventListeners();
		
		// Update UI based on current session
		updateWalletUI();
		
		console.log('Wallet manager UI initialized');
	} catch (error) {
		console.error('Error initializing wallet manager UI:', error);
	}
}

/**
 * Create the wallet UI elements
 */
function createWalletUI() {
	// Check if container already exists
	if (document.getElementById('wallet-container')) {
		walletContainer = document.getElementById('wallet-container');
		return;
	}
	
	// Create container
	walletContainer = document.createElement('div');
	walletContainer.id = 'wallet-container';
	walletContainer.className = 'wallet-container';
	walletContainer.style.position = 'fixed';
	walletContainer.style.top = '10px';
	walletContainer.style.right = '10px';
	walletContainer.style.background = 'rgba(0, 0, 0, 0.7)';
	walletContainer.style.color = '#fff';
	walletContainer.style.padding = '10px';
	walletContainer.style.borderRadius = '5px';
	walletContainer.style.zIndex = '1000';
	walletContainer.style.display = 'flex';
	walletContainer.style.flexDirection = 'column';
	walletContainer.style.gap = '10px';
	
	// Create wallet status
	walletStatus = document.createElement('div');
	walletStatus.className = 'wallet-status';
	walletStatus.textContent = 'Wallet: Not Connected';
	
	// Create wallet address
	walletAddress = document.createElement('div');
	walletAddress.className = 'wallet-address';
	walletAddress.style.fontSize = '12px';
	walletAddress.style.opacity = '0.8';
	walletAddress.style.display = 'none';
	
	// Create connect button
	connectButton = document.createElement('button');
	connectButton.className = 'wallet-connect-btn';
	connectButton.textContent = 'Connect Wallet';
	connectButton.style.padding = '5px 10px';
	connectButton.style.backgroundColor = '#4CAF50';
	connectButton.style.border = 'none';
	connectButton.style.borderRadius = '3px';
	connectButton.style.color = 'white';
	connectButton.style.cursor = 'pointer';
	
	// Create save/load buttons (initially hidden)
	saveGameBtn = document.createElement('button');
	saveGameBtn.className = 'save-game-btn';
	saveGameBtn.textContent = 'Save Game';
	saveGameBtn.style.padding = '5px 10px';
	saveGameBtn.style.backgroundColor = '#2196F3';
	saveGameBtn.style.border = 'none';
	saveGameBtn.style.borderRadius = '3px';
	saveGameBtn.style.color = 'white';
	saveGameBtn.style.cursor = 'pointer';
	saveGameBtn.style.display = 'none';
	
	loadGameBtn = document.createElement('button');
	loadGameBtn.className = 'load-game-btn';
	loadGameBtn.textContent = 'Load Game';
	loadGameBtn.style.padding = '5px 10px';
	loadGameBtn.style.backgroundColor = '#9C27B0';
	loadGameBtn.style.border = 'none';
	loadGameBtn.style.borderRadius = '3px';
	loadGameBtn.style.color = 'white';
	loadGameBtn.style.cursor = 'pointer';
	loadGameBtn.style.display = 'none';
	
	// Add elements to container
	walletContainer.appendChild(walletStatus);
	walletContainer.appendChild(walletAddress);
	walletContainer.appendChild(connectButton);
	walletContainer.appendChild(saveGameBtn);
	walletContainer.appendChild(loadGameBtn);
	
	// Add to document
	document.body.appendChild(walletContainer);
}

/**
 * Set up event listeners for the UI elements
 */
function setupEventListeners() {
	// Connect wallet button
	connectButton.addEventListener('click', async () => {
		if (SessionManager.getSessionData().walletConnected) {
			// Disconnect wallet
			SessionManager.disconnectWallet();
			updateWalletUI();
		} else {
			// Connect wallet
			try {
				await connectWallet();
			} catch (error) {
				console.error('Error connecting wallet:', error);
				// Create a toast notification
				showNotification('Failed to connect wallet. Make sure you have Phantom installed.', 'error');
			}
		}
	});
	
	// Save game button
	saveGameBtn.addEventListener('click', async () => {
		try {
			const success = await SessionManager.saveGameToServer();
			if (success) {
				showNotification('Game saved successfully!', 'success');
			} else {
				showNotification('Failed to save game.', 'error');
			}
		} catch (error) {
			console.error('Error saving game:', error);
			showNotification('Error saving game.', 'error');
		}
	});
	
	// Load game button
	loadGameBtn.addEventListener('click', async () => {
		try {
			const success = await SessionManager.loadGameFromServer();
			if (success) {
				showNotification('Game loaded successfully!', 'success');
				// Refresh the page to update the game state
				setTimeout(() => {
					window.location.reload();
				}, 1500);
			} else {
				showNotification('Failed to load game.', 'error');
			}
		} catch (error) {
			console.error('Error loading game:', error);
			showNotification('Error loading game.', 'error');
		}
	});
}

/**
 * Update the wallet UI based on current session state
 */
function updateWalletUI() {
	const sessionData = SessionManager.getSessionData();
	
	if (sessionData.walletConnected && sessionData.walletAddress) {
		// Wallet is connected
		walletStatus.textContent = 'Wallet: Connected';
		walletStatus.style.color = '#4CAF50';
		
		// Show truncated wallet address
		const address = sessionData.walletAddress;
		const truncatedAddr = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
		walletAddress.textContent = truncatedAddr;
		walletAddress.style.display = 'block';
		
		// Update connect button to disconnect
		connectButton.textContent = 'Disconnect Wallet';
		connectButton.style.backgroundColor = '#F44336';
		
		// Show save/load buttons
		saveGameBtn.style.display = 'block';
		loadGameBtn.style.display = 'block';
	} else {
		// Wallet is not connected
		walletStatus.textContent = 'Wallet: Not Connected';
		walletStatus.style.color = '#fff';
		
		// Hide wallet address
		walletAddress.style.display = 'none';
		
		// Update button to connect
		connectButton.textContent = 'Connect Wallet';
		connectButton.style.backgroundColor = '#4CAF50';
		
		// Hide save/load buttons
		saveGameBtn.style.display = 'none';
		loadGameBtn.style.display = 'none';
	}
}

/**
 * Connect to the Solana wallet
 */
async function connectWallet() {
	try {
		// Check if Phantom is installed
		if (!window.solana || !window.solana.isPhantom) {
			showNotification('Phantom wallet is not installed!', 'error');
			window.open('https://phantom.app/', '_blank');
			return;
		}
		
		// Connect to Phantom
		const response = await window.solana.connect();
		const walletAddress = response.publicKey.toString();
		
		// Update session
		SessionManager.connectWallet(walletAddress);
		
		// Update UI
		updateWalletUI();
		
		// Show success notification
		showNotification('Wallet connected successfully!', 'success');
		
		console.log('Connected to wallet:', walletAddress);
		return true;
	} catch (error) {
		console.error('Wallet connection error:', error);
		showNotification('Failed to connect wallet.', 'error');
		return false;
	}
}

/**
 * Show a notification toast
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'info'
 */
function showNotification(message, type = 'info') {
	// Create notification element if it doesn't exist
	let notification = document.getElementById('wallet-notification');
	if (!notification) {
		notification = document.createElement('div');
		notification.id = 'wallet-notification';
		notification.style.position = 'fixed';
		notification.style.bottom = '20px';
		notification.style.right = '20px';
		notification.style.padding = '10px 20px';
		notification.style.borderRadius = '5px';
		notification.style.color = '#fff';
		notification.style.zIndex = '1001';
		notification.style.opacity = '0';
		notification.style.transition = 'opacity 0.3s ease-in-out';
		document.body.appendChild(notification);
	}
	
	// Set background color based on type
	if (type === 'success') {
		notification.style.backgroundColor = '#4CAF50';
	} else if (type === 'error') {
		notification.style.backgroundColor = '#F44336';
	} else {
		notification.style.backgroundColor = '#2196F3';
	}
	
	// Set message and show notification
	notification.textContent = message;
	notification.style.opacity = '1';
	
	// Hide after 3 seconds
	setTimeout(() => {
		notification.style.opacity = '0';
	}, 3000);
}

export default {
	initWalletUI,
	updateWalletUI
}; 
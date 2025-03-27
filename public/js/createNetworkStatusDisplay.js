import { updateNetworkStatus } from './createLoadingIndicator.js';
import * as NetworkManagerModule from './utils/networkManager.js';

/**
 * Create a network status display
 */
export function createNetworkStatusDisplay() {
	// Ensure we have the correct NetworkManager instance
	const NetworkManager = window.NetworkManager || NetworkManagerModule.default || NetworkManagerModule;
	
	// Create the network status element with Russian-style design
	const networkStatusElement = document.createElement('div');
	networkStatusElement.id = 'network-status';

	// Style the network status element
	Object.assign(networkStatusElement.style, {
		position: 'fixed',
		top: '10px',
		left: '10px',
		padding: '5px 10px',
		borderRadius: '5px',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffcc00', // Gold color for Russian theme
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '12px',
		zIndex: '1000',
		pointerEvents: 'none',
		border: '1px solid #ffcc00' // Gold border
	});

	// Set initial status text
	networkStatusElement.textContent = 'Network: Connecting...';

	// Add to DOM
	document.body.appendChild(networkStatusElement);

	// Check if isConnected function exists before using it
	let isConnected = false;
	try {
		if (NetworkManager && typeof NetworkManager.isConnected === 'function') {
			isConnected = NetworkManager.isConnected();
		}
	} catch (error) {
		console.error('Error checking network connection status:', error);
	}

	// Update status based on current connection
	updateNetworkStatus(isConnected ? 'connected' : 'disconnected');
	
	// Set up event listeners for connection status changes
	if (NetworkManager) {
		// Add listeners for connect and disconnect events
		if (typeof NetworkManager.on === 'function') {
			NetworkManager.on('connect', () => {
				updateNetworkStatus('connected');
				networkStatusElement.textContent = 'Network: Connected';
			});
			
			NetworkManager.on('disconnect', () => {
				updateNetworkStatus('disconnected');
				networkStatusElement.textContent = 'Network: Disconnected';
			});
			
			NetworkManager.on('error', () => {
				updateNetworkStatus('error');
				networkStatusElement.textContent = 'Network: Error';
			});
		}
		
		// Also listen for DOM events as a fallback
		document.addEventListener('network:connect', () => {
			updateNetworkStatus('connected');
			networkStatusElement.textContent = 'Network: Connected';
		});
		
		document.addEventListener('network:disconnect', () => {
			updateNetworkStatus('disconnected');
			networkStatusElement.textContent = 'Network: Disconnected';
		});
		
		document.addEventListener('network:error', () => {
			updateNetworkStatus('error');
			networkStatusElement.textContent = 'Network: Error';
		});
	}
	
	// Poll for status updates as a failsafe (every 5 seconds)
	setInterval(() => {
		try {
			if (NetworkManager && typeof NetworkManager.isConnected === 'function') {
				const connectionStatus = NetworkManager.isConnected();
				updateNetworkStatus(connectionStatus ? 'connected' : 'disconnected');
				networkStatusElement.textContent = `Network: ${connectionStatus ? 'Connected' : 'Disconnected'}`;
			}
		} catch (error) {
			console.warn('Error during network status polling:', error);
		}
	}, 5000);
}

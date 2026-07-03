import { updateNetworkStatus } from './createLoadingIndicator.js';
import * as NetworkManager from './utils/networkManager.js';

/**
 * Create a network status display
 */
const STATUS_POLL_INTERVAL_MS = 5000;

export function createNetworkStatusDisplay() {
	// Create the network status element with Russian-style design
	const networkStatusElement = document.createElement('div');
	networkStatusElement.id = 'network-status';

	// Sits just below the TETCHES title (which owns the top-left corner).
	// `updateNetworkStatus` (createLoadingIndicator.js) is the single
	// writer: it hides the pill while connected and shows it otherwise.
	Object.assign(networkStatusElement.style, {
		position: 'fixed',
		top: '44px',
		left: '10px',
		padding: '4px 10px',
		borderRadius: '999px',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffcc00', // Gold color for Russian theme
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '12px',
		zIndex: '1000',
		pointerEvents: 'none',
		border: '1px solid #ffcc00' // Gold border
	});

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
	updateNetworkStatus(isConnected ? 'connected' : 'connecting');
	
	// "Disconnected" is only meaningful after we had a connection; before
	// that (name prompt, welcome modal) the honest state is "connecting".
	let everConnected = isConnected;
	const reportConnected = () => {
		everConnected = true;
		updateNetworkStatus('connected');
	};

	// Set up event listeners for connection status changes. All paths
	// funnel through updateNetworkStatus so show/hide stays consistent.
	if (NetworkManager) {
		if (typeof NetworkManager.on === 'function') {
			NetworkManager.on('connect', reportConnected);
			NetworkManager.on('disconnect', () => updateNetworkStatus('disconnected'));
			NetworkManager.on('error', () => updateNetworkStatus('error'));
		}
		
		// Also listen for DOM events as a fallback
		document.addEventListener('network:connect', reportConnected);
		document.addEventListener('network:disconnect', () => updateNetworkStatus('disconnected'));
		document.addEventListener('network:error', () => updateNetworkStatus('error'));
	}
	
	// Poll for status updates as a failsafe (updateNetworkStatus ignores
	// repeats, so this only matters when an event was missed)
	setInterval(() => {
		try {
			if (NetworkManager && typeof NetworkManager.isConnected === 'function') {
				const connectionStatus = NetworkManager.isConnected();
				if (connectionStatus) {
					reportConnected();
				} else {
					updateNetworkStatus(everConnected ? 'disconnected' : 'connecting');
				}
			}
		} catch (error) {
			console.warn('Error during network status polling:', error);
		}
	}, STATUS_POLL_INTERVAL_MS);
}

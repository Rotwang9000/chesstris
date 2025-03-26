import { updateNetworkStatus } from './createLoadingIndicator.js';
import * as NetworkManager from './utils/networkManager.js';

/**
 * Create a network status display
 */
export function createNetworkStatusDisplay() {
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

	// Update status based on current connection
	updateNetworkStatus(NetworkManager.isConnected() ? 'connected' : 'disconnected');
}

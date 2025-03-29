/**
 * Network Status Manager Module
 * This module tracks network connection status and provides notifications
 */
import NetworkManager from './networkManager.js';

// Network status constants
export const NetworkStatus = {
	CONNECTED: 'connected',
	DISCONNECTED: 'disconnected',
	CONNECTING: 'connecting',
	ERROR: 'error'
};

// Class-based implementation with singleton pattern
class NetworkStatusManagerClass {
	constructor() {
		this.statusListeners = [];
		this.currentStatus = NetworkStatus.CONNECTING;
		this.initialized = false;
		this.pollingInterval = null;
	}

	/**
	 * Initialize the network status manager
	 */
	init() {
		if (this.initialized) {
			return;
		}

		// Set up listeners for NetworkManager events
		if (NetworkManager) {
			NetworkManager.on('connect', () => {
				this.updateStatus(NetworkStatus.CONNECTED);
			});

			NetworkManager.on('disconnect', () => {
				this.updateStatus(NetworkStatus.DISCONNECTED);
			});

			NetworkManager.on('error', () => {
				this.updateStatus(NetworkStatus.ERROR);
			});
		}

		// Initialize polling every 5 seconds as backup
		this.pollingInterval = setInterval(() => {
			this.pollNetworkStatus();
		}, 5000);

		// Initial status check
		this.pollNetworkStatus();

		this.initialized = true;
	}

	/**
	 * Poll the network status
	 */
	pollNetworkStatus() {
		try {
			if (NetworkManager && typeof NetworkManager.isConnected === 'function') {
				const isConnected = NetworkManager.isConnected();
				this.updateStatus(isConnected ? NetworkStatus.CONNECTED : NetworkStatus.DISCONNECTED);
			}
		} catch (error) {
			console.warn('Error polling network status:', error);
			this.updateStatus(NetworkStatus.ERROR);
		}
	}

	/**
	 * Update the current network status
	 * @param {string} status - The new status
	 */
	updateStatus(status) {
		if (this.currentStatus !== status) {
			this.currentStatus = status;
			this.notifyStatusListeners(status);
		}
	}

	/**
	 * Add a status listener
	 * @param {Function} callback - The callback function to add
	 */
	addStatusListener(callback) {
		if (typeof callback === 'function' && !this.statusListeners.includes(callback)) {
			this.statusListeners.push(callback);
		}
	}

	/**
	 * Remove a status listener
	 * @param {Function} callback - The callback function to remove
	 */
	removeStatusListener(callback) {
		const index = this.statusListeners.indexOf(callback);
		if (index !== -1) {
			this.statusListeners.splice(index, 1);
		}
	}

	/**
	 * Notify all status listeners of a change
	 * @param {string} status - The new status
	 */
	notifyStatusListeners(status) {
		this.statusListeners.forEach(callback => {
			try {
				callback(status);
			} catch (error) {
				console.error('Error in network status listener:', error);
			}
		});
	}
}

// Singleton implementation
let instance = null;

/**
 * Get singleton instance of NetworkStatusManager
 * @returns {NetworkStatusManagerClass} The singleton instance
 */
function getInstance() {
	if (instance === null) {
		instance = new NetworkStatusManagerClass();
	}
	return instance;
}

// Get the singleton instance
const networkStatusManagerInstance = getInstance();

// Export methods directly
export function init() {
	return networkStatusManagerInstance.init();
}

export function addStatusListener(callback) {
	return networkStatusManagerInstance.addStatusListener(callback);
}

export function removeStatusListener(callback) {
	return networkStatusManagerInstance.removeStatusListener(callback);
}

export function getStatus() {
	return networkStatusManagerInstance.currentStatus;
}

// Export the instance as default
export default networkStatusManagerInstance; 
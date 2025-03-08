import { socket } from './socketService';

/**
 * Service to handle application updates
 */
class UpdateService {
	constructor() {
		this.updateListeners = [];
		this.restartListeners = [];
		this.isUpdateAvailable = false;
		this.updateInfo = null;
		this.isUpdateImminent = false;
		this.updateCountdown = null;
		this.countdownInterval = null;
		
		this.setupSocketListeners();
	}
	
	/**
	 * Set up socket event listeners for updates
	 */
	setupSocketListeners() {
		// Listen for update notifications
		socket.on('updateAvailable', (updateData) => {
			console.log('Update available:', updateData);
			this.isUpdateAvailable = true;
			this.updateInfo = updateData;
			this.notifyUpdateListeners(updateData);
		});
		
		// Listen for imminent updates
		socket.on('updateImminent', (data) => {
			console.log('Update imminent:', data);
			this.isUpdateImminent = true;
			this.updateCountdown = data.timeRemaining;
			
			// Start a countdown timer
			this.startCountdown();
			
			// Notify listeners
			this.notifyUpdateListeners({
				...this.updateInfo,
				imminent: true,
				timeRemaining: data.timeRemaining,
				message: data.message
			});
		});
		
		// Listen for server restart notifications
		socket.on('serverRestarting', (data) => {
			console.log('Server restarting:', data);
			
			// Clear any countdown
			this.clearCountdown();
			
			// Notify listeners
			this.notifyRestartListeners(data);
			
			// Start reconnection attempts
			this.handleServerRestart(data);
		});
		
		// Reconnect event to check if update is complete
		socket.on('connect', () => {
			if (this.isUpdateImminent) {
				// Connection restored after update
				this.checkUpdateStatus();
			}
		});
	}
	
	/**
	 * Start a countdown timer for imminent updates
	 */
	startCountdown() {
		// Clear any existing interval
		this.clearCountdown();
		
		// Set up the countdown
		this.countdownInterval = setInterval(() => {
			this.updateCountdown--;
			
			// Notify listeners of countdown progress
			if (this.updateCountdown % 30 === 0 || this.updateCountdown <= 10) {
				this.notifyUpdateListeners({
					...this.updateInfo,
					imminent: true,
					timeRemaining: this.updateCountdown,
					message: `Server update in ${this.formatTimeRemaining(this.updateCountdown)}`
				});
			}
			
			// Stop the countdown when it reaches zero
			if (this.updateCountdown <= 0) {
				this.clearCountdown();
			}
		}, 1000);
	}
	
	/**
	 * Clear the countdown interval
	 */
	clearCountdown() {
		if (this.countdownInterval) {
			clearInterval(this.countdownInterval);
			this.countdownInterval = null;
		}
	}
	
	/**
	 * Format seconds into a readable time string
	 * @param {number} seconds - Time in seconds
	 * @returns {string} Formatted time string
	 */
	formatTimeRemaining(seconds) {
		if (seconds < 60) {
			return `${seconds} seconds`;
		}
		
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		
		if (remainingSeconds === 0) {
			return `${minutes} minutes`;
		}
		
		return `${minutes} minutes and ${remainingSeconds} seconds`;
	}
	
	/**
	 * Handle server restart by attempting to reconnect
	 * @param {Object} data - Server restart data
	 */
	handleServerRestart(data) {
		console.log('Server is restarting, will attempt reconnection...');
		
		// Show a reconnecting message in the UI
		this.notifyRestartListeners({
			...data,
			reconnecting: true
		});
		
		// Socket.io will automatically attempt to reconnect
	}
	
	/**
	 * Check if the update has been applied
	 */
	async checkUpdateStatus() {
		try {
			const response = await fetch('/api/version');
			const data = await response.json();
			
			if (data.version !== this.updateInfo?.version) {
				// Update has been applied
				this.isUpdateImminent = false;
				this.isUpdateAvailable = false;
				
				// Notify listeners that update is complete
				this.notifyRestartListeners({
					complete: true,
					message: 'Update completed successfully!',
					newVersion: data.version
				});
				
				// Refresh the page to load new assets
				setTimeout(() => {
					window.location.reload();
				}, 3000);
			}
		} catch (error) {
			console.error('Error checking update status:', error);
		}
	}
	
	/**
	 * Manually check for updates
	 * @returns {Promise<Object>} Update information
	 */
	async checkForUpdates() {
		try {
			const response = await fetch('/api/version');
			const data = await response.json();
			
			this.isUpdateAvailable = data.updateAvailable;
			this.updateInfo = data.updateInfo;
			
			if (this.isUpdateAvailable) {
				this.notifyUpdateListeners(this.updateInfo);
			}
			
			return data;
		} catch (error) {
			console.error('Error checking for updates:', error);
			return { error: error.message };
		}
	}
	
	/**
	 * Register a listener for update notifications
	 * @param {Function} listener - Callback function
	 */
	onUpdate(listener) {
		this.updateListeners.push(listener);
		
		// Immediately notify if update is available
		if (this.isUpdateAvailable) {
			listener(this.updateInfo);
		}
		
		// Return an unsubscribe function
		return () => {
			this.updateListeners = this.updateListeners.filter(l => l !== listener);
		};
	}
	
	/**
	 * Register a listener for server restart notifications
	 * @param {Function} listener - Callback function
	 */
	onServerRestart(listener) {
		this.restartListeners.push(listener);
		
		// Return an unsubscribe function
		return () => {
			this.restartListeners = this.restartListeners.filter(l => l !== listener);
		};
	}
	
	/**
	 * Notify all update listeners
	 * @param {Object} data - Update information
	 */
	notifyUpdateListeners(data) {
		this.updateListeners.forEach(listener => {
			try {
				listener(data);
			} catch (error) {
				console.error('Error in update listener:', error);
			}
		});
	}
	
	/**
	 * Notify all restart listeners
	 * @param {Object} data - Restart information
	 */
	notifyRestartListeners(data) {
		this.restartListeners.forEach(listener => {
			try {
				listener(data);
			} catch (error) {
				console.error('Error in restart listener:', error);
			}
		});
	}
}

// Create a singleton instance
const updateService = new UpdateService();

export default updateService; 
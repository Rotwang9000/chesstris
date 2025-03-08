import io from 'socket.io-client';

// Create socket connection
const socket = io(process.env.REACT_APP_SOCKET_URL || window.location.origin, {
	reconnectionAttempts: 5,
	reconnectionDelay: 1000,
	autoConnect: true,
	transports: ['websocket', 'polling'],
});

// Setup socket event listeners
socket.on('connect', () => {
	console.log('Socket connected');
});

socket.on('disconnect', (reason) => {
	console.log('Socket disconnected:', reason);
});

socket.on('connect_error', (error) => {
	console.error('Connection error:', error);
});

socket.on('reconnect', (attemptNumber) => {
	console.log('Socket reconnected after', attemptNumber, 'attempts');
});

socket.on('reconnect_failed', () => {
	console.error('Failed to reconnect after maximum attempts');
});

/**
 * Connect to the socket server
 */
function connect() {
	if (!socket.connected) {
		socket.connect();
	}
}

/**
 * Disconnect from the socket server
 */
function disconnect() {
	if (socket.connected) {
		socket.disconnect();
	}
}

/**
 * Emit an event to the server
 * @param {string} event - Event name
 * @param {any} data - Event data
 * @param {Function} callback - Callback function
 */
function emit(event, data, callback) {
	socket.emit(event, data, callback);
}

/**
 * Subscribe to an event
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @returns {Function} Unsubscribe function
 */
function on(event, handler) {
	socket.on(event, handler);
	
	// Return unsubscribe function
	return () => {
		socket.off(event, handler);
	};
}

export { socket, connect, disconnect, emit, on }; 
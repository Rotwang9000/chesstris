/**
 * NetworkManager internal event bus.
 *
 * Lifted out of `NetworkManagerClass` so the main class can stay
 * under the 1500-line refactor threshold and so the event-listener
 * book-keeping has a single, easy-to-test surface.
 *
 * Two flavours of events:
 *
 *   • Regular events ("connect", "game_update", etc.) — fan out to
 *     handlers in `state.eventListeners[type]`.
 *   • Server "message" events (carrying `data.type`) — also fan out
 *     to type-specific handlers in
 *     `state.eventListeners.messageHandlers[messageType]`. Subscribe
 *     to a specific message type with `addEventListener('message:foo')`
 *     or `onMessage('foo')`.
 *
 * The bus also dispatches a corresponding DOM `CustomEvent` named
 * `network:<eventType>` for any code that prefers DOM events to JS
 * callbacks. Errors thrown by handlers are caught and logged so one
 * bad subscriber can't break the others.
 */

const STANDARD_EVENT_TYPES = Object.freeze([
	'connect', 'disconnect', 'error', 'connecting',
	'game_state', 'game_update', 'player_joined', 'player_left', 'message',
	'gameJoined', 'gameLeft',
]);

function ensureListeners(state) {
	if (!state.eventListeners) state.eventListeners = {};
	for (const type of STANDARD_EVENT_TYPES) {
		if (!state.eventListeners[type]) state.eventListeners[type] = [];
	}
	if (!state.eventListeners.messageHandlers) state.eventListeners.messageHandlers = {};
}

function dispatchHandlers(handlers, data, labelForLog) {
	if (!Array.isArray(handlers)) return;
	for (const handler of handlers) {
		try {
			handler(data);
		} catch (error) {
			console.error(`NetworkManager: Error in event handler for ${labelForLog}:`, error);
		}
	}
}

/**
 * Emit an event to all registered listeners. Mirrors a DOM event of
 * the same name so legacy code can subscribe via
 * `document.addEventListener('network:foo', ...)`.
 *
 * @param {{ state: object }} manager  The NetworkManagerClass instance.
 * @param {string} eventType
 * @param {*} data
 */
export function emitEvent(manager, eventType, data) {
	const state = manager.state;
	ensureListeners(state);

	// `gameJoined` is the one event we proactively merge `gameState`
	// into — the manager has the latest snapshot but the join
	// response payload doesn't always carry it.
	if (eventType === 'gameJoined' && data && !data.gameState && state.gameState) {
		data = { ...data, gameState: state.gameState };
	}

	// `message` events have type-specific routing.
	if (eventType === 'message' && data && data.type) {
		const messageType = data.type;
		dispatchHandlers(state.eventListeners.message, data, 'message');
		const typed = state.eventListeners.messageHandlers[messageType];
		dispatchHandlers(typed, data, `message:${messageType}`);
		return;
	}

	if (!state.eventListeners[eventType]) {
		state.eventListeners[eventType] = [];
	}
	dispatchHandlers(state.eventListeners[eventType], data, eventType);

	if (typeof document !== 'undefined') {
		try {
			const customEvent = new CustomEvent(`network:${eventType}`, { detail: data });
			document.dispatchEvent(customEvent);
		} catch (error) {
			console.warn(`NetworkManager: Error dispatching DOM event ${eventType}:`, error);
		}
	}
}

/**
 * Register a listener for a given event. Use `message:<type>` to
 * subscribe to a specific server message subtype.
 */
export function addEventListener(manager, eventType, callback) {
	const state = manager.state;
	ensureListeners(state);

	if (typeof eventType === 'string' && eventType.startsWith('message:')) {
		const messageType = eventType.substring('message:'.length);
		if (!state.eventListeners.messageHandlers[messageType]) {
			state.eventListeners.messageHandlers[messageType] = [];
		}
		state.eventListeners.messageHandlers[messageType].push(callback);
		return;
	}

	if (!state.eventListeners[eventType]) {
		state.eventListeners[eventType] = [];
	}
	state.eventListeners[eventType].push(callback);
}

/** Remove a previously-registered listener. */
export function removeEventListener(manager, eventType, callback) {
	const state = manager.state;
	if (!state.eventListeners) return;

	if (typeof eventType === 'string' && eventType.startsWith('message:')) {
		const messageType = eventType.substring('message:'.length);
		const handlers = state.eventListeners.messageHandlers?.[messageType];
		if (Array.isArray(handlers)) {
			state.eventListeners.messageHandlers[messageType] =
				handlers.filter(h => h !== callback);
		}
		return;
	}

	if (Array.isArray(state.eventListeners[eventType])) {
		state.eventListeners[eventType] =
			state.eventListeners[eventType].filter(h => h !== callback);
	}
}

/**
 * Socket → NetworkManager event bridge.
 *
 * The vast majority of the wiring that used to live in
 * `NetworkManagerClass.initialize()` was 1-to-1 pass-through of
 * server-emitted events to the NetworkManager's internal event bus
 * (so game-core / UI modules can subscribe via `NetworkManager.on(...)`).
 *
 * Centralising that here:
 *   • cuts ~150 lines of repetition out of the main class,
 *   • makes it trivial to add a new event (push to the array), and
 *   • lets us add cross-cutting behaviour (logging, replay capture,
 *     Sentry breadcrumbs) in one place if we want to later.
 *
 * Some events are NOT plain forwards — `connect`, `disconnect`,
 * `error`, `connect_error`, `player_id`, `set_session`, `game_state`,
 * `game_update` — those still live in `NetworkManagerClass.initialize()`
 * because they need to mutate the manager's internal state (set the
 * playerId cookie, store the canonical gameState, drive reconnection,
 * resolve/reject the initialize promise).
 */

const SIMPLE_FORWARD_EVENTS = Object.freeze([
	// Player / lifecycle
	'player_joined',
	'player_left',
	'player_renamed',
	// Tetromino / row clears
	'row_cleared',
	'no_valid_chess_moves',
	'new_tetromino',
	'turn_update',
	'tetrominoFailed',
	'cells_clearing',
	'cascade_complete',
	// Chess moves / captures
	'chess_move',
	'chess_capture',
	'chessFailed',
	'pawn_promotion_available',
	'king_captured',
	'suicidal_pawn',
	'pawn_detonation',
	'king_detonation',
	'king_detonation_layer',
	'island_decay',
	'island_at_risk',
	'simultaneous_capture_resolved',
	// King duels
	'king_duel_start',
	'king_duel_result',
	'king_duel_round_result',
	'king_duel_new_round',
	'king_duel_announced',
	// Activity log
	'activity_event',
	'activity_log_snapshot',
	// Per-player private state (single-recipient on the wire)
	'captured_basket',
	// Power-ups
	'powerup_spawned',
	'powerup_claimed',
	'powerup_expired',
	// Promotion credits
	'promotion_credits',
	'promotion_credit_added',
	'promotion_credit_redeemed',
]);

/**
 * Wire every event the NetworkManager just passes through to its
 * subscribers. Caller still owns the lifecycle-critical events
 * (connect/disconnect/error/player_id/set_session/game_state/
 * game_update) — those mutate manager state.
 *
 * @param {import('socket.io-client').Socket} socket
 * @param {(eventType: string, data: unknown) => void} emit
 *        The NetworkManager's `emitEvent` bound to the instance.
 */
export function attachSimpleForwards(socket, emit) {
	if (!socket || typeof socket.on !== 'function') {
		throw new Error('attachSimpleForwards: socket required');
	}
	if (typeof emit !== 'function') {
		throw new Error('attachSimpleForwards: emit required');
	}
	for (const eventName of SIMPLE_FORWARD_EVENTS) {
		socket.on(eventName, (data) => emit(eventName, data));
	}
}

export { SIMPLE_FORWARD_EVENTS };

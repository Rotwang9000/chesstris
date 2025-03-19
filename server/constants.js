// Home zone degradation constants
const HOME_ZONE_DEGRADATION_CHECK_INTERVAL = 60000; // 1 minute in ms
const HOME_ZONE_DEGRADATION_THRESHOLD = 120000; // 2 minutes in ms

// Player pause related constants
const PLAYER_PAUSE_MAX_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const PLAYER_PAUSE_CHECK_INTERVAL = 60 * 1000; // 1 minute in milliseconds

// Game events
const GAME_EVENTS = {
	HOME_ZONE_DEGRADED: 'homeZoneDegraded',
	HOME_ZONE_REMOVED: 'homeZoneRemoved',
	PLAYER_PAUSED: 'playerPaused',
	PLAYER_RESUMED: 'playerResumed',
	PLAYER_PAUSE_TIMEOUT: 'playerPauseTimeout',
	PIECE_PURCHASED: 'piecePurchased',
	PIECE_PURCHASE_FAILED: 'piecePurchaseFailed',
};

// Piece acquisition constants
const PIECE_PRICES = {
	PAWN: 0.1,   // 0.1 SOL for a pawn
	ROOK: 0.5,   // 0.5 SOL for a rook
	KNIGHT: 0.5, // 0.5 SOL for a knight
	BISHOP: 0.5, // 0.5 SOL for a bishop
	QUEEN: 1.0,  // 1.0 SOL for a queen
	// Kings cannot be purchased
};

module.exports = {
	HOME_ZONE_DEGRADATION_CHECK_INTERVAL,
	HOME_ZONE_DEGRADATION_THRESHOLD,
	PLAYER_PAUSE_MAX_DURATION,
	PLAYER_PAUSE_CHECK_INTERVAL,
	GAME_EVENTS,
	PIECE_PRICES
}; 
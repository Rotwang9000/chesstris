// Initialize game manager
const gameManager = new GameManager();

// Start checking for player pause timeouts
gameManager.startPauseTimeoutChecker();

// Log that the pause system is active
console.log('Player pause system initialized with timeout checks'); 
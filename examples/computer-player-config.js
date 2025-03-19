// Computer Player Configuration
// Generated on 2025-03-15T18:10:26.603Z

module.exports = {
	// API configuration
	apiUrl: 'http://localhost:3020/api',
	
	// Server configuration
	port: 8080,
	
	// Player configuration
	playerName: 'MyComputerPlayer',
	
	// Logging configuration
	logLevel: 'info', // 'debug', 'info', 'warn', 'error'
	logToFile: true,
	logDir: 'C:\\dev\\chesstris\\logs\\computer-players',
	
	// Game strategy configuration
	strategy: {
		// Tetromino placement strategy
		tetrominoPlacement: 'random', // 'random', 'optimal', 'defensive'
		
		// Chess movement strategy
		chessMovement: 'random', // 'random', 'aggressive', 'defensive'
		
		// Decision making delay (ms)
		thinkingTime: 1000
	}
};

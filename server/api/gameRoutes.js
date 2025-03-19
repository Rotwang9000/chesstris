// Add player pause routes

/**
 * @api {post} /api/games/:gameId/players/:playerId/pause Pause a player
 * @apiName PausePlayer
 * @apiGroup Game
 * 
 * @apiParam {String} gameId Game ID
 * @apiParam {String} playerId Player ID
 * 
 * @apiSuccess {Boolean} success Whether the operation was successful
 * @apiSuccess {String} error Error message if operation failed
 */
router.post('/games/:gameId/players/:playerId/pause', (req, res) => {
	const { gameId, playerId } = req.params;
	
	const result = gameManager.pausePlayer(gameId, playerId);
	res.json(result);
});

/**
 * @api {post} /api/games/:gameId/players/:playerId/resume Resume a player
 * @apiName ResumePlayer
 * @apiGroup Game
 * 
 * @apiParam {String} gameId Game ID
 * @apiParam {String} playerId Player ID
 * 
 * @apiSuccess {Boolean} success Whether the operation was successful
 * @apiSuccess {String} error Error message if operation failed
 */
router.post('/games/:gameId/players/:playerId/resume', (req, res) => {
	const { gameId, playerId } = req.params;
	
	const result = gameManager.resumePlayer(gameId, playerId);
	res.json(result);
});

/**
 * @api {get} /api/games/:gameId/players/:playerId/pauseStatus Get player pause status
 * @apiName GetPlayerPauseStatus
 * @apiGroup Game
 * 
 * @apiParam {String} gameId Game ID
 * @apiParam {String} playerId Player ID
 * 
 * @apiSuccess {Boolean} isPaused Whether the player is paused
 * @apiSuccess {Number} remainingTime Remaining pause time in milliseconds (if paused)
 */
router.get('/games/:gameId/players/:playerId/pauseStatus', (req, res) => {
	const { gameId, playerId } = req.params;
	
	// Check if the player is paused
	const isPaused = gameManager.isPlayerPaused(playerId);
	
	// Get the remaining pause time if paused
	const remainingTime = isPaused ? gameManager.getPauseTimeRemaining(playerId) : 0;
	
	res.json({ isPaused, remainingTime });
});

/**
 * @api {post} /api/games/:gameId/players/:playerId/pieces Purchase a new chess piece
 * @apiName PurchasePiece
 * @apiGroup Game
 * 
 * @apiParam {String} gameId Game ID
 * @apiParam {String} playerId Player ID
 * @apiParam {String} pieceType Type of piece to purchase (pawn, rook, knight, bishop, queen)
 * @apiParam {Number} amount Amount of SOL being paid
 * 
 * @apiSuccess {Boolean} success Whether the operation was successful
 * @apiSuccess {Object} piece The purchased piece information if successful
 * @apiSuccess {String} error Error message if operation failed
 */
router.post('/games/:gameId/players/:playerId/pieces', (req, res) => {
	const { gameId, playerId } = req.params;
	const { pieceType, amount } = req.body;
	
	if (!pieceType || amount === undefined) {
		return res.status(400).json({ 
			success: false, 
			error: 'Missing required parameters: pieceType and amount' 
		});
	}
	
	try {
		const result = gameManager.purchasePiece(gameId, playerId, pieceType, parseFloat(amount));
		res.json(result);
	} catch (error) {
		console.error('Error purchasing piece:', error);
		res.status(500).json({ success: false, error: 'Internal server error' });
	}
}); 
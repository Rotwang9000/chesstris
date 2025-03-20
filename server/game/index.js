/**
 * Game module exports
 */

const GameManager = require('./GameManager');
const GameManagerWrapper = require('./GameManagerWrapper');
const BoardManager = require('./BoardManager');
const TetrominoManager = require('./TetrominoManager');
const ChessManager = require('./ChessManager');
const IslandManager = require('./IslandManager');
const PlayerManager = require('./PlayerManager');
const ComputerPlayerManager = require('./ComputerPlayerManager');
const GameUtilities = require('./GameUtilities');
const Constants = require('./Constants');

module.exports = {
	GameManager,
	GameManagerWrapper,
	BoardManager,
	TetrominoManager,
	ChessManager,
	IslandManager,
	PlayerManager,
	ComputerPlayerManager,
	GameUtilities,
	Constants
}; 
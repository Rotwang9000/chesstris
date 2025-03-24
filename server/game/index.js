/**
 * Game module exports
 */

const GameManager = require('./GameManager');
const BoardManager = require('./BoardManager');
const TetrominoManager = require('./TetrominoManager');
const ChessManager = require('./ChessManager');
const IslandManager = require('./IslandManager');
const PlayerManager = require('./PlayerManager');
const ComputerPlayerManager = require('./ComputerPlayerManager');
const GameUtilities = require('./GameUtilities');
const Constants = require('./Constants');
const BoardUpdater = require('./BoardUpdater');

// Import GameManagerWrapper after other modules to avoid circular reference
const GameManagerWrapper = require('./GameManagerWrapper');

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
	Constants,
	BoardUpdater
}; 
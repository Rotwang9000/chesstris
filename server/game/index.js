/**
 * Game module exports.
 *
 * Everything is exported from a single entry point so callers can do:
 *   const { GameManager } = require('./server/game');
 * without having to know the underlying file layout.
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

module.exports = {
	GameManager,
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

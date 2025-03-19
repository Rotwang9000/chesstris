const fs = require('fs');
const path = require('path');

// Read the original file
const filePath = path.join(__dirname, 'server', 'game', 'GameManager.js');
let content = fs.readFileSync(filePath, 'utf8');

// Create a backup
fs.writeFileSync(filePath + '.bak', content);

// Fix the corrupted _hasCellUnderneath method
const correctedMethod = `
	/**
	 * Check if a cell has another cell underneath it
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if there's a cell underneath
	 * @private
	 */
	_hasCellUnderneath(game, x, z) {
		const boardSize = game.settings.boardSize;
		
		// Check bounds
		if (x < 0 || x >= boardSize || z < 0 || z >= boardSize) {
			return false;
		}
		
		// Check if there's a cell at this position
		return game.board[z][x] !== null;
	}
}

// Export the GameManager class
module.exports = GameManager;`;

// Find the corrupted method
const regex = /_hasCellUnderneath[\s\S]*?module\.exports = GameManager;/;
if (regex.test(content)) {
  // Replace the corrupted method
  const newContent = content.replace(regex, correctedMethod);
  
  // Write the fixed content back to the file
  fs.writeFileSync(filePath, newContent);
  console.log('Fixed the corrupted _hasCellUnderneath method in GameManager.js');
} else {
  console.error('Could not find the corrupted method in the file');
} 
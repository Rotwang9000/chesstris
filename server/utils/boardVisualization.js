/**
 * Board Visualization Utility
 * 
 * Provides functions to visualize the game board in ASCII format
 * for debugging and display purposes.
 */

/**
 * Generate an ASCII representation of the game board
 * @param {Object} game - The game state
 * @param {Object} options - Visualization options
 * @returns {string} ASCII representation of the board
 */
function visualizeBoard(game, options = {}) {
	if (!game || !game.board) {
		return 'No valid game board to visualize';
	}
	
	const {
		highlightX,
		highlightY,
		centerX,
		centerY,
		viewSize = 20,
		showCoordinates = true,
		focusPlayerId = null
	} = options;
	
	// Determine the center of the view
	const center = {
		x: centerX !== undefined ? centerX : Math.floor(game.board[0].length / 2),
		y: centerY !== undefined ? centerY : Math.floor(game.board.length / 2)
	};
	
	// Calculate view boundaries
	const startX = Math.max(0, center.x - Math.floor(viewSize / 2));
	const startY = Math.max(0, center.y - Math.floor(viewSize / 2));
	const endX = Math.min(game.board[0].length, startX + viewSize);
	const endY = Math.min(game.board.length, startY + viewSize);
	
	// Create a map of chess pieces by position for quick lookup
	const chessPieceMap = {};
	if (game.chessPieces) {
		game.chessPieces.forEach(piece => {
			if (piece && piece.position && piece.position.x !== undefined && piece.position.y !== undefined) {
				const key = `${piece.position.x},${piece.position.y}`;
				chessPieceMap[key] = piece;
			}
		});
	}
	
	// Build the visualization
	let output = '\n=== GAME BOARD VISUALIZATION ===\n';
	
	// Add view information
	if (centerX !== undefined && centerY !== undefined) {
		output += `Centered at (${centerX}, ${centerY})`;
		if (highlightX !== undefined && highlightY !== undefined) {
			output += ` - Highlight at (${highlightX}, ${highlightY})`;
		}
		output += '\n';
	}
	
	// Add column headers if showing coordinates
	if (showCoordinates) {
		let header = '   ';
		for (let x = startX; x < endX; x++) {
			header += (x % 10) + ' ';
		}
		output += header + '\n';
		
		// Add top border
		let border = '  +';
		for (let x = startX; x < endX; x++) {
			border += '--';
		}
		output += border + '+\n';
	}
	
	// Add board rows
	for (let y = startY; y < endY; y++) {
		let row = showCoordinates ? (y % 10) + ' |' : '';
		
		for (let x = startX; x < endX; x++) {
			// Check if this is the highlighted position
			if (highlightX === x && highlightY === y) {
				row += '* ';
				continue;
			}
			
			// Check if there's a chess piece at this position
			if (chessPieceMap[`${x},${y}`]) {
				const piece = chessPieceMap[`${x},${y}`];
				// Use first letter of piece type, uppercase for focused player, lowercase for others
				let pieceChar = piece.type.charAt(0);
				
				if (focusPlayerId && piece.player === focusPlayerId) {
					pieceChar = pieceChar.toUpperCase();
				} else {
					pieceChar = pieceChar.toLowerCase();
				}
				
				// Special symbols for pieces
				switch (piece.type) {
					case 'king':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'K' : 'k';
						break;
					case 'queen':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'Q' : 'q';
						break;
					case 'rook':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'R' : 'r';
						break;
					case 'bishop':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'B' : 'b';
						break;
					case 'knight':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'N' : 'n';
						break;
					case 'pawn':
						pieceChar = focusPlayerId && piece.player === focusPlayerId ? 'P' : 'p';
						break;
				}
				
				row += pieceChar + ' ';
				continue;
			}
			
			// Get the cell at this position
			const cell = game.board[y]?.[x];
			
			if (!cell) {
				row += '. '; // Empty space
			} else if (cell.type === 'HOME_ZONE') {
				row += (focusPlayerId && cell.playerId === focusPlayerId) ? 'H ' : 'h ';
			} else if (cell.type === 'tetris') {
				row += (focusPlayerId && cell.player === focusPlayerId) ? '# ' : '= ';
			} else {
				row += '? '; // Unknown cell type
			}
		}
		
		output += row + (showCoordinates ? '|\n' : '\n');
	}
	
	// Add bottom border if showing coordinates
	if (showCoordinates) {
		let border = '  +';
		for (let x = startX; x < endX; x++) {
			border += '--';
		}
		output += border + '+\n';
	}
	
	// Add legend
	output += 'Legend: K/k=King, Q/q=Queen, R/r=Rook, B/b=Bishop, N/n=Knight, P/p=Pawn\n';
	output += '        H/h=Home zone, #/==Tetromino, *=Highlight, .=Empty\n';
	output += '        (Uppercase = focused player, lowercase = other players)\n';
	output += '================================\n';
	
	return output;
}

/**
 * Generate a detailed ASCII representation of a player's home zone
 * @param {Object} game - The game state
 * @param {string} playerId - The player's ID
 * @returns {string} ASCII representation of the player's home zone
 */
function visualizePlayerHomeZone(game, playerId) {
	if (!game || !game.players || !game.players[playerId]) {
		return 'No valid player data to visualize';
	}
	
	const player = game.players[playerId];
	
	if (!player.homeZone) {
		return 'Player has no home zone defined';
	}
	
	// Extract home zone position
	const { x: startX, y: startY } = player.homeZone;
	
	// Set home zone dimensions
	const homeZoneWidth = 8;  // Standard chess board width
	const homeZoneHeight = 2; // Two rows for pieces
	
	// Build the visualization
	let output = `\n=== HOME ZONE FOR PLAYER ${player.username || playerId} ===\n`;
	
	// Add column headers
	let header = '   ';
	for (let x = 0; x < homeZoneWidth; x++) {
		header += (x) + ' ';
	}
	output += header + '\n';
	
	// Add top border
	let border = '  +';
	for (let x = 0; x < homeZoneWidth; x++) {
		border += '--';
	}
	output += border + '+\n';
	
	// Add board rows
	for (let y = 0; y < homeZoneHeight; y++) {
		let row = y + ' |';
		
		for (let x = 0; x < homeZoneWidth; x++) {
			const boardX = startX + x;
			const boardY = startY + y;
			
			// Check if coordinates are valid
			if (boardY >= game.board.length || boardX >= game.board[0].length) {
				row += '? ';
				continue;
			}
			
			// Get the cell at this position
			const cell = game.board[boardY][boardX];
			
			if (!cell) {
				row += '. '; // Empty space
			} else if (cell.chessPiece) {
				// Show chess piece
				let pieceChar = '';
				switch (cell.chessPiece.type) {
					case 'king': pieceChar = 'K'; break;
					case 'queen': pieceChar = 'Q'; break;
					case 'rook': pieceChar = 'R'; break;
					case 'bishop': pieceChar = 'B'; break;
					case 'knight': pieceChar = 'N'; break;
					case 'pawn': pieceChar = 'P'; break;
					default: pieceChar = '?';
				}
				row += pieceChar + ' ';
			} else if (cell.type === 'HOME_ZONE') {
				row += 'H ';
			} else if (cell.type === 'tetris') {
				row += '# ';
			} else {
				row += '? '; // Unknown cell type
			}
		}
		
		output += row + '|\n';
	}
	
	// Add bottom border
	output += border + '+\n';
	
	// Add legend
	output += 'Legend: K=King, Q=Queen, R=Rook, B=Bishop, N=Knight, P=Pawn\n';
	output += '        H=Home zone, #=Tetromino, .=Empty, ?=Unknown/Invalid\n';
	output += '================================\n';
	
	return output;
}

/**
 * Generate a summary of the game state
 * @param {Object} game - The game state
 * @returns {string} Text summary of the game state
 */
function generateGameSummary(game) {
	if (!game) {
		return 'No valid game data to summarize';
	}
	
	let output = '\n=== GAME STATE SUMMARY ===\n';
	output += `Game ID: ${game.id || 'Unknown'}\n`;
	output += `Status: ${game.status || 'Unknown'}\n`;
	output += `Current Turn: ${game.currentTurn || 'Unknown'}\n`;
	output += `Current Move Type: ${game.currentMoveType || 'Unknown'}\n`;
	
	// Add player information
	output += '\nPlayers:\n';
	if (game.players) {
		if (Array.isArray(game.players)) {
			game.players.forEach(player => {
				output += `- ${player.username || player.name || 'Unknown'} (${player.id})\n`;
			});
		} else {
			Object.values(game.players).forEach(player => {
				output += `- ${player.username || player.name || 'Unknown'} (${player.id})\n`;
			});
		}
	} else {
		output += '- No players found\n';
	}
	
	// Add chess pieces information
	output += '\nChess Pieces:\n';
	if (game.chessPieces && game.chessPieces.length > 0) {
		// Group pieces by player
		const piecesByPlayer = {};
		game.chessPieces.forEach(piece => {
			if (!piecesByPlayer[piece.player]) {
				piecesByPlayer[piece.player] = [];
			}
			piecesByPlayer[piece.player].push(piece);
		});
		
		// Output pieces by player
		Object.entries(piecesByPlayer).forEach(([playerId, pieces]) => {
			const playerName = game.players && game.players[playerId] ? 
				(game.players[playerId].username || game.players[playerId].name) : 
				'Unknown';
			
			output += `  Player ${playerName} (${playerId}):\n`;
			pieces.forEach(piece => {
				if (piece.position && piece.position.x !== undefined && piece.position.y !== undefined) {
					output += `    - ${piece.type} at (${piece.position.x}, ${piece.position.y})\n`;
				} else {
					output += `    - ${piece.type} (position unknown)\n`;
				}
			});
		});
	} else {
		output += '- No chess pieces found\n';
	}
	
	output += '================================\n';
	return output;
}

module.exports = {
	visualizeBoard,
	visualizePlayerHomeZone,
	generateGameSummary
}; 
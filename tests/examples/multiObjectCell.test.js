/**
 * multiObjectCell.test.js
 * Examples of testing the multi-object cell structure
 */

const { BoardManager } = require('../../server/game/BoardManager');
const boardManager = new BoardManager();

describe('Multi-Object Cell Structure Tests', () => {
	test('should create a cell with multiple objects', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Create home zone marker
		const homeZoneObj = {
			type: 'home',
			player: 'player1',
			color: 'red'
		};
		
		// Create chess piece object
		const chessPieceObj = {
			type: 'chess',
			pieceType: 'pawn',
			player: 'player1',
			pieceId: 'pawn-123',
			color: 'red'
		};
		
		// Set the cell with both objects
		boardManager.setCell(board, 5, 5, [homeZoneObj, chessPieceObj]);
		
		// Get the cell contents
		const cellContents = boardManager.getCell(board, 5, 5);
		
		// Verify cell structure
		expect(cellContents).toBeInstanceOf(Array);
		expect(cellContents.length).toBe(2);
		expect(cellContents[0]).toEqual(homeZoneObj);
		expect(cellContents[1]).toEqual(chessPieceObj);
	});
	
	test('should add an object to an existing cell', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// First, set a home zone marker
		const homeZoneObj = {
			type: 'home',
			player: 'player1',
			color: 'red'
		};
		
		boardManager.setCell(board, 5, 5, [homeZoneObj]);
		
		// Now add a tetromino object
		const tetrominoObj = {
			type: 'tetromino',
			pieceType: 'I',
			player: 'player1',
			placedAt: Date.now()
		};
		
		// Add the tetromino to the cell using the new utility method
		boardManager.addToCellContents(board, 5, 5, tetrominoObj);
		
		// Get the cell contents
		const cellContents = boardManager.getCell(board, 5, 5);
		
		// Verify cell structure
		expect(cellContents).toBeInstanceOf(Array);
		expect(cellContents.length).toBe(2);
		expect(cellContents[0]).toEqual(homeZoneObj);
		expect(cellContents[1]).toEqual(tetrominoObj);
	});
	
	test('should filter cell contents by type', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Create a cell with multiple objects
		const homeZoneObj = { type: 'home', player: 'player1' };
		const chessPieceObj = { type: 'chess', pieceType: 'pawn', player: 'player1' };
		const tetrominoObj = { type: 'tetromino', pieceType: 'I', player: 'player1' };
		
		boardManager.setCell(board, 5, 5, [homeZoneObj, chessPieceObj, tetrominoObj]);
		
		// Test the new utility method to get contents by type
		const homeContents = boardManager.getCellContentsByType(board, 5, 5, 'home');
		const chessContents = boardManager.getCellContentsByType(board, 5, 5, 'chess');
		const tetrominoContents = boardManager.getCellContentsByType(board, 5, 5, 'tetromino');
		
		// Verify filtered content
		expect(homeContents.length).toBe(1);
		expect(homeContents[0]).toEqual(homeZoneObj);
		
		expect(chessContents.length).toBe(1);
		expect(chessContents[0]).toEqual(chessPieceObj);
		
		expect(tetrominoContents.length).toBe(1);
		expect(tetrominoContents[0]).toEqual(tetrominoObj);
	});
	
	test('should check if a cell has a specific type of content', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Create a cell with a chess piece
		const chessPieceObj = { type: 'chess', pieceType: 'pawn', player: 'player1' };
		
		boardManager.setCell(board, 5, 5, [chessPieceObj]);
		
		// Test the new hasCellType utility method
		expect(boardManager.hasCellType(board, 5, 5, 'chess')).toBe(true);
		expect(boardManager.hasCellType(board, 5, 5, 'home')).toBe(false);
		expect(boardManager.hasCellType(board, 5, 5, 'tetromino')).toBe(false);
		expect(boardManager.hasCellType(board, 6, 6, 'chess')).toBe(false); // Non-existent cell
	});
	
	test('should remove an object from a cell based on filter', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Create a cell with multiple objects
		const homeZoneObj = { type: 'home', player: 'player1' };
		const chessPieceObj = { type: 'chess', pieceType: 'pawn', player: 'player1' };
		
		boardManager.setCell(board, 5, 5, [homeZoneObj, chessPieceObj]);
		
		// Remove the chess piece using the removeFromCellContents method
		const removedItem = boardManager.removeFromCellContents(board, 5, 5, 
			item => item.type !== 'chess' // Keep everything except chess pieces
		);
		
		// Verify removed item
		expect(removedItem).toEqual(chessPieceObj);
		
		// Verify remaining cell contents
		const cellContents = boardManager.getCell(board, 5, 5);
		expect(cellContents.length).toBe(1);
		expect(cellContents[0]).toEqual(homeZoneObj);
	});
	
	test('should completely remove a cell when all objects are removed', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Create a cell with a single object
		const chessPieceObj = { type: 'chess', pieceType: 'pawn', player: 'player1' };
		
		boardManager.setCell(board, 5, 5, [chessPieceObj]);
		
		// Remove the chess piece using the removeFromCellContents method
		boardManager.removeFromCellContents(board, 5, 5, 
			item => item.type !== 'chess' // Keep everything except chess pieces
		);
		
		// Verify cell is completely removed
		expect(boardManager.getCell(board, 5, 5)).toBeNull();
		expect(board.cells['5,5']).toBeUndefined();
	});
	
	test('should simulate chess piece movement with home zone preservation', () => {
		// Create a board with the new sparse structure
		const board = boardManager.createEmptyBoard();
		
		// Set up source cell with home zone and chess piece
		const sourceHomeZone = { type: 'home', player: 'player1' };
		const chessPiece = { 
			type: 'chess', 
			pieceType: 'knight', 
			player: 'player1', 
			pieceId: 'knight-123' 
		};
		
		boardManager.setCell(board, 5, 5, [sourceHomeZone, chessPiece]);
		
		// Set up target cell with some other content
		const targetContent = { type: 'tetromino', player: 'player1' };
		boardManager.setCell(board, 7, 6, [targetContent]);
		
		// Move the chess piece
		// 1. Get the source cell contents
		const sourceCell = boardManager.getCell(board, 5, 5);
		
		// 2. Filter out the chess piece, keeping only home zone
		const homeMarkers = sourceCell.filter(item => item.type === 'home');
		
		// 3. Update the source cell with just the home zone
		boardManager.setCell(board, 5, 5, homeMarkers);
		
		// 4. Get target cell and filter out any chess pieces
		const targetCell = boardManager.getCell(board, 7, 6);
		const targetWithoutChess = targetCell.filter(item => item.type !== 'chess');
		
		// 5. Add the chess piece to target cell
		const updatedChessPiece = {...chessPiece, position: { x: 7, z: 6 }};
		boardManager.setCell(board, 7, 6, [...targetWithoutChess, updatedChessPiece]);
		
		// Verify the results
		const newSourceCell = boardManager.getCell(board, 5, 5);
		const newTargetCell = boardManager.getCell(board, 7, 6);
		
		// Source cell should only have the home zone
		expect(newSourceCell.length).toBe(1);
		expect(newSourceCell[0]).toEqual(sourceHomeZone);
		
		// Target cell should have the tetromino and the chess piece
		expect(newTargetCell.length).toBe(2);
		expect(newTargetCell.find(item => item.type === 'tetromino')).toEqual(targetContent);
		expect(newTargetCell.find(item => item.type === 'chess')).toEqual(updatedChessPiece);
	});
}); 
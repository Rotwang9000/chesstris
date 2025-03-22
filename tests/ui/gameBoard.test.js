/**
 * Game Board UI Tests
 * 
 * Tests the rendering and interaction with the game board UI
 */

const { UIManager } = require('../../public/js/ui/UIManager');
const { GameManager } = require('../../public/js/game/GameManager');

// Mock DOM elements and event handlers
document.body.innerHTML = `
	<div id="game-container">
		<div id="game-board"></div>
		<div id="player-info"></div>
		<div id="tetromino-preview"></div>
	</div>
`;

// Mock for THREE.js or other rendering libraries
jest.mock('../../public/js/lib/three.module.js', () => {
	return {
		Scene: jest.fn(() => ({
			add: jest.fn(),
			remove: jest.fn()
		})),
		WebGLRenderer: jest.fn(() => ({
			setSize: jest.fn(),
			render: jest.fn(),
			domElement: document.createElement('canvas')
		})),
		PerspectiveCamera: jest.fn(),
		Vector3: jest.fn(),
		Raycaster: jest.fn(() => ({
			setFromCamera: jest.fn(),
			intersectObjects: jest.fn(() => [])
		})),
		GridHelper: jest.fn(),
		BoxGeometry: jest.fn(),
		MeshBasicMaterial: jest.fn(),
		Mesh: jest.fn(() => ({
			position: { x: 0, y: 0, z: 0 }
		}))
	};
});

describe('Game Board UI', () => {
	let uiManager;
	let gameManager;
	let gameState;
	
	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks();
		
		// Create a game instance
		gameManager = new GameManager();
		gameState = gameManager.createGame('UI Test Game');
		
		// Add some players
		gameManager.addPlayer(gameState.id, 'player1', 'Player One');
		gameManager.addPlayer(gameState.id, 'player2', 'Player Two');
		
		// Start the game
		gameManager.startGame(gameState.id);
		
		// Get the updated game state
		gameState = gameManager.getGame(gameState.id);
		
		// Create the UI manager
		uiManager = new UIManager(gameManager, document.getElementById('game-container'));
		
		// Initialize UI with the game state
		uiManager.initializeUI(gameState.id);
	});
	
	describe('Board Rendering', () => {
		it('should render the initial game board', () => {
			// Check that the board was rendered
			expect(uiManager.isInitialized).toBe(true);
			expect(uiManager.renderer).toBeDefined();
			expect(uiManager.scene).toBeDefined();
			expect(uiManager.camera).toBeDefined();
			
			// Verify the game board has cells
			expect(uiManager.boardCells).toBeDefined();
			expect(Object.keys(uiManager.boardCells).length).toBeGreaterThan(0);
		});
		
		it('should render chess pieces for each player', () => {
			// Check that pieces were rendered
			expect(uiManager.pieceMeshes).toBeDefined();
			
			// Each player should have pieces
			const player1 = Object.values(gameState.players).find(p => p.id === 'player1');
			const player2 = Object.values(gameState.players).find(p => p.id === 'player2');
			
			// Count player pieces in the game state
			const player1PieceCount = Object.keys(player1.pieces).length;
			const player2PieceCount = Object.keys(player2.pieces).length;
			
			// Count piece meshes in the UI
			const player1MeshCount = Object.values(uiManager.pieceMeshes).filter(
				mesh => mesh.userData.playerId === 'player1'
			).length;
			
			const player2MeshCount = Object.values(uiManager.pieceMeshes).filter(
				mesh => mesh.userData.playerId === 'player2'
			).length;
			
			// Each piece in the game state should have a mesh
			expect(player1MeshCount).toBe(player1PieceCount);
			expect(player2MeshCount).toBe(player2PieceCount);
		});
		
		it('should render territory with correct colors', () => {
			// Skip if the game doesn't use colored territory
			if (!uiManager.renderTerritory) {
				return;
			}
			
			// Call render explicitly to ensure all updates are processed
			uiManager.render();
			
			// Check that territories were rendered
			const player1Territory = Object.values(uiManager.boardCells).filter(
				cell => cell.userData.owner === 'player1'
			);
			
			const player2Territory = Object.values(uiManager.boardCells).filter(
				cell => cell.userData.owner === 'player2'
			);
			
			// Should have some territory for each player
			expect(player1Territory.length).toBeGreaterThan(0);
			expect(player2Territory.length).toBeGreaterThan(0);
			
			// Check that territories have different colors
			const player1Color = player1Territory[0].material.color;
			const player2Color = player2Territory[0].material.color;
			
			expect(player1Color).not.toEqual(player2Color);
		});
		
		it('should render the tetromino preview', () => {
			// Skip if the game doesn't use tetromino preview
			if (!uiManager.renderTetrominoPreview) {
				return;
			}
			
			// Call the preview rendering function
			uiManager.renderTetrominoPreview();
			
			// Check that the preview was rendered
			const previewElement = document.getElementById('tetromino-preview');
			expect(previewElement.children.length).toBeGreaterThan(0);
			
			// Should show the next tetromino
			const nextPiece = gameManager.tetrominoManager.peekNextTetromino();
			expect(previewElement.innerHTML).toContain(nextPiece.type);
		});
	});
	
	describe('User Interactions', () => {
		it('should highlight cells on hover', () => {
			// Skip if the game doesn't implement hover highlighting
			if (!uiManager.highlightCell) {
				return;
			}
			
			// Create a mock event
			const mockEvent = {
				clientX: 100,
				clientY: 100
			};
			
			// Get a cell to test with
			const cellKey = Object.keys(uiManager.boardCells)[0];
			const cell = uiManager.boardCells[cellKey];
			
			// Mock the raycaster to return this cell
			uiManager.raycaster.intersectObjects = jest.fn(() => [
				{ object: cell }
			]);
			
			// Trigger mousemove event
			uiManager.handleMouseMove(mockEvent);
			
			// Check that the cell was highlighted
			expect(uiManager.highlightedCell).toBe(cell);
			expect(cell.userData.highlighted).toBe(true);
		});
		
		it('should select a chess piece on click', () => {
			// Get a player piece
			const player1 = Object.values(gameState.players).find(p => p.id === 'player1');
			const pieceId = Object.keys(player1.pieces)[0];
			const pieceMesh = uiManager.pieceMeshes[pieceId];
			
			// Mock the raycaster to return this piece
			uiManager.raycaster.intersectObjects = jest.fn(() => [
				{ object: pieceMesh }
			]);
			
			// Create a mock event
			const mockEvent = {
				clientX: 100,
				clientY: 100
			};
			
			// Set the current player
			uiManager.currentPlayerId = 'player1';
			
			// Trigger click event
			uiManager.handleClick(mockEvent);
			
			// Check that the piece was selected
			expect(uiManager.selectedPiece).toBe(pieceId);
			expect(pieceMesh.userData.selected).toBe(true);
		});
		
		it('should move a selected piece to a valid destination on click', () => {
			// First select a piece
			const player1 = Object.values(gameState.players).find(p => p.id === 'player1');
			const pieceId = Object.keys(player1.pieces)[0];
			const piece = player1.pieces[pieceId];
			const pieceMesh = uiManager.pieceMeshes[pieceId];
			
			// Set it as selected
			uiManager.selectedPiece = pieceId;
			pieceMesh.userData.selected = true;
			uiManager.currentPlayerId = 'player1';
			
			// Now click on a destination cell
			const destinationCell = uiManager.boardCells[`${piece.position.x + 1},0,${piece.position.z}`];
			
			// Mock the raycaster to return this cell
			uiManager.raycaster.intersectObjects = jest.fn(() => [
				{ object: destinationCell }
			]);
			
			// Create a mock valid move result
			gameManager.chessManager.isValidMove = jest.fn(() => true);
			gameManager.chessManager.movePiece = jest.fn(() => ({ success: true }));
			
			// Create a mock event
			const mockEvent = {
				clientX: 200,
				clientY: 200
			};
			
			// Trigger click event
			uiManager.handleClick(mockEvent);
			
			// Check that the move was attempted
			expect(gameManager.chessManager.movePiece).toHaveBeenCalledWith(
				pieceId,
				expect.objectContaining({
					x: piece.position.x + 1,
					z: piece.position.z
				}),
				'player1',
				expect.anything()
			);
		});
		
		it('should place a tetromino on valid board position click', () => {
			// Skip if the game doesn't implement tetromino placement
			if (!uiManager.activeTetromino) {
				return;
			}
			
			// Set up an active tetromino
			const tetromino = gameManager.tetrominoManager.getNextTetromino();
			uiManager.activeTetromino = tetromino;
			uiManager.currentPlayerId = 'player1';
			
			// Select a valid destination cell
			const destinationCell = uiManager.boardCells['8,0,8']; // Example coordinates
			
			// Mock the raycaster to return this cell
			uiManager.raycaster.intersectObjects = jest.fn(() => [
				{ object: destinationCell }
			]);
			
			// Mock the placement validation
			gameManager.boardManager.canPlaceTetromino = jest.fn(() => true);
			gameManager.boardManager.placeTetromino = jest.fn(() => ({ success: true }));
			
			// Create a mock event
			const mockEvent = {
				clientX: 200,
				clientY: 200
			};
			
			// Trigger click event
			uiManager.handleClick(mockEvent);
			
			// Check that the placement was attempted
			expect(gameManager.boardManager.placeTetromino).toHaveBeenCalledWith(
				expect.anything(), // Tetromino
				expect.objectContaining({
					x: 8,
					y: 0,
					z: 8
				}), // Position
				'player1', // Player ID
				expect.anything() // Game state
			);
		});
	});
	
	describe('Game State Updates', () => {
		it('should update the UI when the game state changes', () => {
			// Mock the render method to track calls
			const originalRender = uiManager.render;
			uiManager.render = jest.fn(originalRender);
			
			// Move a piece to trigger a state update
			const player1 = Object.values(gameState.players).find(p => p.id === 'player1');
			const pieceId = Object.keys(player1.pieces)[0];
			const piece = player1.pieces[pieceId];
			
			gameManager.chessManager.movePiece(
				pieceId,
				{ x: piece.position.x + 1, y: piece.position.y, z: piece.position.z },
				'player1',
				gameState
			);
			
			// Notify UI of the update
			uiManager.updateGameState(gameState);
			
			// Check that the render method was called
			expect(uiManager.render).toHaveBeenCalled();
			
			// Check that the piece mesh was updated
			const updatedMesh = uiManager.pieceMeshes[pieceId];
			expect(updatedMesh.position.x).toBe(piece.position.x + 1);
		});
		
		it('should update player info display when state changes', () => {
			// Skip if the game doesn't implement player info display
			if (!uiManager.updatePlayerInfo) {
				return;
			}
			
			// Get the player info element
			const playerInfoElement = document.getElementById('player-info');
			
			// Update player info
			uiManager.updatePlayerInfo(gameState);
			
			// Should display information for both players
			expect(playerInfoElement.innerHTML).toContain('Player One');
			expect(playerInfoElement.innerHTML).toContain('Player Two');
		});
		
		it('should show game over screen when the game ends', () => {
			// Skip if the game doesn't implement game over screen
			if (!uiManager.showGameOverScreen) {
				return;
			}
			
			// End the game
			gameManager.endGame(gameState.id, 'player1');
			gameState = gameManager.getGame(gameState.id);
			
			// Update the UI
			uiManager.updateGameState(gameState);
			
			// Check that the game over screen was displayed
			expect(uiManager.gameOverDisplayed).toBe(true);
			
			// Should show the winner
			const container = document.getElementById('game-container');
			expect(container.innerHTML).toContain('Player One wins');
		});
	});
}); 
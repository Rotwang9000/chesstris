import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import gameService from '../services/GameService';
import GameBoard from './GameBoard';
import TetrominoSystem from './TetrominoSystem';
import TurnIndicator from './TurnIndicator';
import PawnPromotionModal from './PawnPromotionModal';
import RowClearingVisualizer from './RowClearingVisualizer';
import './Game.css';

const Game = ({ playerId, isSpectating = false }) => {
	const { gameId } = useParams();
	const navigate = useNavigate();
	const gameBoardRef = useRef(null);
	
	// Game state
	const [gameState, setGameState] = useState({
		board: {},
		pieces: [],
		homeZones: {},
		activePlayers: [],
		pausedPlayers: [],
		currentTurns: {}
	});
	
	// UI state
	const [selectedPiece, setSelectedPiece] = useState(null);
	const [validMoves, setValidMoves] = useState([]);
	const [error, setError] = useState(null);
	const [spectatingPlayerId, setSpectatingPlayerId] = useState(null);
	const [gameOver, setGameOver] = useState(false);
	const [gameResult, setGameResult] = useState(null);
	const [isConnected, setIsConnected] = useState(false);
	const [rowClearing, setRowClearing] = useState(null);
	const [promotingPawn, setPromotingPawn] = useState(null);
	const [gameStarted, setGameStarted] = useState(false);
	const [isAnimatingCamera, setIsAnimatingCamera] = useState(false);
	
	// Helper functions
	const showError = (message, duration = 5000) => {
		setError(message);
		setTimeout(() => setError(null), duration);
	};
	
	// Start game handler - trigger camera animation and first tetris drop
	const handleStartGame = useCallback(() => {
		if (isSpectating || !gameBoardRef.current || !playerId) return;
		
		// Set game as started and trigger camera animation
		setGameStarted(true);
		setIsAnimatingCamera(true);
		
		// Focus camera on player's home cells
		gameBoardRef.current.focusCameraOnHomeCells(playerId);
		
		// Notify server that game has started
		gameService.startGame()
			.then(response => {
				console.log('Game started successfully:', response);
			})
			.catch(error => {
				console.error('Error starting game:', error);
				showError(`Error starting game: ${error.message || 'Unknown error'}`);
			});
	}, [isSpectating, playerId]);
	
	// Camera animation complete handler - trigger first tetris piece drop
	const handleCameraAnimationComplete = useCallback(() => {
		setIsAnimatingCamera(false);
		
		// Request first tetris piece from server
		gameService.requestTetromino()
			.then(response => {
				console.log('First tetromino received:', response);
			})
			.catch(error => {
				console.error('Error requesting tetromino:', error);
				showError(`Error requesting tetromino: ${error.message || 'Unknown error'}`);
			});
	}, []);
	
	// Connect to the game server
	useEffect(() => {
		if (!gameId) return;
		
		console.log(`Connecting to game server for game ${gameId}, player ${playerId}, spectating: ${isSpectating}`);
		
		// Initialize connection
		gameService.connect()
			.on('connect', () => {
				setIsConnected(true);
				console.log('Connected to game server');
				
				// Join the game or spectate
				if (isSpectating) {
					gameService.requestSpectate(gameId)
						.catch(err => showError(`Error spectating: ${err.message}`));
				} else {
					gameService.joinGame(gameId)
						.catch(err => showError(`Error joining game: ${err.message}`));
				}
			})
			.on('disconnect', () => {
				setIsConnected(false);
				showError('Disconnected from server');
			})
			.on('error', (err) => {
				showError(`Server error: ${err.message}`);
			})
			.on('gameState', (state) => {
				console.log('Received complete game state from server:', state);
				setGameState(state);
			})
			.on('game_update', (updatedState) => {
				console.log('Received game update from server:', updatedState);
				setGameState(prevState => ({
					...prevState,
					...updatedState
				}));
			})
			.on('playerJoined', (data) => {
				console.log('Player joined:', data);
				// Update active players list
				setGameState(prev => ({
					...prev,
					activePlayers: [...(prev.activePlayers || []), data.playerId]
				}));
			})
			.on('playerLeft', (data) => {
				console.log('Player left:', data);
				// Remove from active players list
				setGameState(prev => ({
					...prev,
					activePlayers: (prev.activePlayers || []).filter(id => id !== data.playerId)
				}));
			})
			.on('turnUpdate', (turnInfo) => {
				console.log('Turn update received:', turnInfo);
				// Update current turn information
				setGameState(prev => ({
					...prev,
					currentTurns: {
						...(prev.currentTurns || {}),
						[turnInfo.playerId]: turnInfo
					}
				}));
			})
			.on('tetromino_placed', (data) => {
				console.log('Tetromino placed by another player:', data);
				// If server is sending us updates about other players' actions,
				// we should update our state accordingly
				if (data.playerId !== playerId) {
					// Update with the new board state if provided
					if (data.board) {
						setGameState(prev => ({
							...prev,
							board: data.board
						}));
					}
				}
			})
			.on('chess_move', (data) => {
				console.log('Chess move by another player:', data);
				// If it's another player's move, update our state
				if (data.playerId !== playerId) {
					// Update chess pieces if provided
					if (data.movedPiece) {
						setGameState(prev => {
							const updatedPieces = [...prev.pieces];
							const pieceIndex = updatedPieces.findIndex(p => p.id === data.movedPiece.id);
							
							if (pieceIndex !== -1) {
								updatedPieces[pieceIndex] = data.movedPiece;
							}
							
							// Remove captured piece if any
							if (data.capturedPiece) {
								const capturedIndex = updatedPieces.findIndex(p => p.id === data.capturedPiece.id);
								if (capturedIndex !== -1) {
									updatedPieces.splice(capturedIndex, 1);
								}
							}
							
							return {
								...prev,
								pieces: updatedPieces
							};
						});
					}
				}
			})
			.on('rowCleared', (clearingInfo) => {
				console.log('Row cleared event received:', clearingInfo);
				// Show row clearing animation
				setRowClearing(clearingInfo);
				setTimeout(() => setRowClearing(null), 2000);
			})
			.on('pawnPromoted', (promotion) => {
				console.log('Pawn promotion event received:', promotion);
				// Show promotion animation or UI
				setPromotingPawn(promotion.pawn);
				// Auto-close after 5 seconds if user doesn't select
				setTimeout(() => {
					setPromotingPawn(null);
				}, 5000);
			})
			.on('gameOver', (result) => {
				console.log('Game over event received:', result);
				setGameOver(true);
				setGameResult(result);
			})
			.on('tetrominoFailed', (error) => {
				console.error('Server rejected tetromino placement:', error);
				showError(`Invalid placement: ${error.message || 'Server rejected the move'}`);
			})
			.on('chessFailed', (error) => {
				console.error('Server rejected chess move:', error);
				showError(`Invalid move: ${error.message || 'Server rejected the move'}`);
			});
		
		// Cleanup function
		return () => {
			console.log('Disconnecting from game server');
			gameService.disconnect();
		};
	}, [gameId, isSpectating, playerId, showError]);
	
	// Cell click handler
	const handleCellClick = useCallback((x, y, z) => {
		console.log(`Cell clicked: ${x}, ${y}, ${z}`);
		// Logic for cell click
	}, []);
	
	// Piece click handler
	const handlePieceClick = useCallback((pieceId) => {
		// Don't allow piece selection in spectator mode or before game starts
		if (isSpectating || !gameStarted) return;
		
		// Find the piece
		const piece = gameState.pieces.find(p => p.id === pieceId);
		if (!piece) return;
		
		// Can only select own pieces
		if (piece.playerId !== playerId) return;
		
		// Select or deselect
		if (selectedPiece === pieceId) {
			setSelectedPiece(null);
			setValidMoves([]);
		} else {
			setSelectedPiece(pieceId);
			// Get valid moves from server
			gameService.getValidMoves({ pieceId })
				.then(moves => setValidMoves(moves))
				.catch(err => {
					showError(`Error getting valid moves: ${err.message}`);
					setValidMoves([]);
				});
		}
	}, [gameState.pieces, isSpectating, playerId, selectedPiece, gameStarted]);
	
	// Piece move handler
	const handlePieceMove = useCallback((pieceId, targetPosition) => {
		// Don't allow moves in spectator mode or before game starts
		if (isSpectating || !gameStarted) return;
		
		// Find the piece
		const piece = gameState.pieces.find(p => p.id === pieceId);
		if (!piece) return;
		
		// Can only move own pieces
		if (piece.playerId !== playerId) return;
		
		// Save the previous state in case we need to revert
		const previousState = JSON.parse(JSON.stringify(gameState));
		
		// Optimistically update the UI for responsive feel
		const updatedState = { ...gameState };
		const pieceIndex = updatedState.pieces.findIndex(p => p.id === pieceId);
		
		if (pieceIndex !== -1) {
			// Store the original position
			const originalPosition = { ...updatedState.pieces[pieceIndex].position };
			
			// Update position
			updatedState.pieces[pieceIndex].position = targetPosition;
			
			// Check for piece at the target position (capture)
			const capturedPieceIndex = updatedState.pieces.findIndex(
				p => p.id !== pieceId && 
				p.position.x === targetPosition.x && 
				p.position.y === targetPosition.y
			);
			
			// Remove captured piece
			if (capturedPieceIndex !== -1) {
				updatedState.pieces.splice(capturedPieceIndex, 1);
			}
			
			// Update the state
			setGameState(updatedState);
			
			// Send the move to the server for validation
			gameService.moveChessPiece({
				pieceId,
				targetPosition
			})
			.then(response => {
				// Server accepted the move
				console.log('Server confirmed chess move:', response);
				
				// Update with any additional information from the server
				if (response.capturedPiece) {
					console.log('Captured piece:', response.capturedPiece);
				}
			})
			.catch(error => {
				// Server rejected the move - revert
				console.error('Server rejected chess move:', error);
				showError(`Invalid move: ${error.message || 'Server rejected the move'}`);
				
				// Roll back to previous state
				setGameState(previousState);
			});
		}
		
		// Clear selection
		setSelectedPiece(null);
		setValidMoves([]);
	}, [gameState, isSpectating, playerId, showError, gameStarted]);
	
	// Tetromino placement handler
	const handleTetrominoPlacement = useCallback((position, tetromino) => {
		if (isSpectating || !gameStarted) return;
		
		// Show placeholder immediately for responsive feel
		const placeholderState = { ...gameState };
		
		// Track the state before the change so we can revert if needed
		const previousState = JSON.parse(JSON.stringify(gameState));
		
		// Optimistically update the UI with the placement 
		setGameState(placeholderState);
		
		// Then send to server for validation
		gameService.placeTetromino({
			pieceType: tetromino.type,
			position: position,
			rotation: tetromino.rotation || 0
		})
		.then(response => {
			// Server accepted the move - update with the server's version
			console.log('Server confirmed tetromino placement:', response);
			
			// Handle any additional effects (row clearing, etc.)
			if (response.clearedRows && response.clearedRows.length > 0) {
				// Row clearing will be handled by the server broadcasting a rowCleared event
				console.log(`Server cleared ${response.clearedRows.length} rows`);
			}
		})
		.catch(error => {
			// Server rejected the move - revert to previous state
			console.error('Server rejected tetromino placement:', error);
			showError(`Invalid placement: ${error.message || 'Server rejected the move'}`);
			
			// Roll back to previous state
			setGameState(previousState);
		});
	}, [gameState, isSpectating, showError, gameStarted]);
	
	// Pawn promotion handler
	const handlePawnPromotion = useCallback((pieceType) => {
		if (!promotingPawn || isSpectating || !gameStarted) return;
		
		gameService.promotePawn({
			pawnId: promotingPawn.id,
			promoteTo: pieceType
		}).catch(err => showError(`Error promoting pawn: ${err.message}`));
		
		setPromotingPawn(null);
	}, [promotingPawn, isSpectating, gameStarted]);
	
	// Skip chess move handler
	const handleSkipChessMove = useCallback(() => {
		if (isSpectating || !gameStarted) return;
		
		gameService.skipChessMove()
			.catch(err => showError(`Error skipping move: ${err.message}`));
	}, [isSpectating, gameStarted]);
	
	// Exit game handler
	const handleExitGame = () => {
		navigate('/');
	};
	
	if (!gameId) {
		return <div className="error-message">No game ID provided</div>;
	}
	
	return (
		<div className="game-container">
			{error && <div className="game-error">{error}</div>}
			
			{!gameStarted && !isSpectating && (
				<div className="game-start-overlay">
					<button 
						className="start-game-button"
						onClick={handleStartGame}
						disabled={!isConnected || isAnimatingCamera}
					>
						Start Playing
					</button>
				</div>
			)}
			
			<div className="game-main">
				<div className="game-board-container">
					<GameBoard
						ref={gameBoardRef}
						board={gameState.board}
						pieces={gameState.pieces}
						homeZones={gameState.homeZones}
						selectedPiece={selectedPiece}
						validMoves={validMoves}
						activePieceId={isSpectating ? spectatingPlayerId : playerId}
						activePlayers={gameState.activePlayers}
						pausedPlayers={gameState.pausedPlayers}
						onCellClick={handleCellClick}
						onPieceClick={handlePieceClick}
						onPieceMove={handlePieceMove}
						spectatingPlayerId={spectatingPlayerId}
						playerId={playerId}
						onCameraAnimationComplete={handleCameraAnimationComplete}
					/>
					
					{gameState.currentTurn && (
						<TurnIndicator 
							currentTurn={gameState.currentTurn} 
							isYourTurn={gameState.currentTurn === playerId}
						/>
					)}
				</div>
				
				<div className="game-sidebar">
					<TetrominoSystem
						gameState={gameState}
						activeTetromino={gameState.currentTurns?.[playerId]?.activeTetromino}
						boardCells={gameState.board}
						playerKingPosition={gameState.pieces?.find(p => p.type === 'king' && p.playerId === playerId)}
						onPlaceTetromino={handleTetrominoPlacement}
						gameStarted={gameStarted}
					/>
					
					{!isSpectating && (
						<button className="exit-game-btn" onClick={handleExitGame}>
							Exit Game
						</button>
					)}
				</div>
			</div>
			
			{/* Pawn promotion modal */}
			{promotingPawn && (
				<PawnPromotionModal
					position={promotingPawn.position}
					player={promotingPawn.player}
					onPieceSelect={handlePawnPromotion}
					onCancel={() => setPromotingPawn(null)}
				/>
			)}
			
			{/* Row clearing visualizer */}
			{rowClearing && (
				<RowClearingVisualizer 
					cellPositions={rowClearing.cells}
					direction={rowClearing.direction}
					isAnimating={true}
					onAnimationComplete={() => setRowClearing(null)}
				/>
			)}
			
			{/* Game over overlay */}
			{gameOver && (
				<div className="game-over-overlay">
					<div className="game-over-content">
						<h2>Game Over</h2>
						<p>Winner: {gameResult?.winner}</p>
						<p>Reason: {gameResult?.reason}</p>
						<button onClick={handleExitGame}>Return to Lobby</button>
					</div>
				</div>
			)}
		</div>
	);
};

Game.propTypes = {
	playerId: PropTypes.string.isRequired,
	isSpectating: PropTypes.bool
};

export default Game; 
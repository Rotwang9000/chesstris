import React, { useState, useEffect, useCallback } from 'react';
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
	
	// Helper functions
	const showError = (message, duration = 5000) => {
		setError(message);
		setTimeout(() => setError(null), duration);
	};
	
	// Connect to the game server
	useEffect(() => {
		if (!gameId) return;
		
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
				setGameState(state);
			})
			.on('playerJoined', (data) => {
				// Update active players list
				setGameState(prev => ({
					...prev,
					activePlayers: [...(prev.activePlayers || []), data.playerId]
				}));
			})
			.on('playerLeft', (data) => {
				// Remove from active players list
				setGameState(prev => ({
					...prev,
					activePlayers: (prev.activePlayers || []).filter(id => id !== data.playerId)
				}));
			})
			.on('turnUpdate', (turnInfo) => {
				// Update current turn information
				setGameState(prev => ({
					...prev,
					currentTurns: {
						...(prev.currentTurns || {}),
						[turnInfo.playerId]: turnInfo
					}
				}));
			})
			.on('rowCleared', (clearingInfo) => {
				// Show row clearing animation
				setRowClearing(clearingInfo);
				setTimeout(() => setRowClearing(null), 2000);
			})
			.on('pawnPromoted', (promotion) => {
				// Show promotion animation or UI
				setPromotingPawn(promotion.pawn);
				// Auto-close after 5 seconds if user doesn't select
				setTimeout(() => {
					setPromotingPawn(null);
				}, 5000);
			})
			.on('gameOver', (result) => {
				setGameOver(true);
				setGameResult(result);
			});
		
		// Cleanup function
		return () => {
			gameService.disconnect();
		};
	}, [gameId, isSpectating, playerId]);
	
	// Cell click handler
	const handleCellClick = useCallback((x, y, z) => {
		console.log(`Cell clicked: ${x}, ${y}, ${z}`);
		// Logic for cell click
	}, []);
	
	// Piece click handler
	const handlePieceClick = useCallback((pieceId) => {
		// Don't allow piece selection in spectator mode
		if (isSpectating) return;
		
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
	}, [gameState.pieces, isSpectating, playerId, selectedPiece]);
	
	// Piece move handler
	const handlePieceMove = useCallback((pieceId, toX, toY) => {
		// Don't allow moves in spectator mode
		if (isSpectating) return;
		
		// Find the piece
		const piece = gameState.pieces.find(p => p.id === pieceId);
		if (!piece) return;
		
		// Can only move own pieces
		if (piece.playerId !== playerId) return;
		
		// Check if this is a valid move
		const isValid = validMoves.some(move => move.x === toX && move.y === toY);
		if (!isValid) {
			showError('Invalid move');
			return;
		}
		
		// Send move to server
		gameService.moveChessPiece({
			pieceId,
			fromX: piece.x,
			fromY: piece.y,
			toX,
			toY
		}).catch(err => showError(`Error moving piece: ${err.message}`));
		
		// Clear selection
		setSelectedPiece(null);
		setValidMoves([]);
	}, [gameState.pieces, isSpectating, playerId, validMoves]);
	
	// Tetromino placement handler
	const handleTetrominoPlacement = useCallback((placement) => {
		if (isSpectating) return;
		
		gameService.placeTetromino(placement)
			.catch(err => showError(`Error placing tetromino: ${err.message}`));
	}, [isSpectating]);
	
	// Pawn promotion handler
	const handlePawnPromotion = useCallback((pieceType) => {
		if (!promotingPawn || isSpectating) return;
		
		gameService.promotePawn({
			pawnId: promotingPawn.id,
			promoteTo: pieceType
		}).catch(err => showError(`Error promoting pawn: ${err.message}`));
		
		setPromotingPawn(null);
	}, [promotingPawn, isSpectating]);
	
	// Skip chess move handler
	const handleSkipChessMove = useCallback(() => {
		if (isSpectating) return;
		
		gameService.skipChessMove()
			.catch(err => showError(`Error skipping move: ${err.message}`));
	}, [isSpectating]);
	
	// Exit game handler
	const handleExitGame = () => {
		navigate('/');
	};
	
	if (!gameId) {
		return <div className="error-message">No game ID provided</div>;
	}
	
	return (
		<div className="game-container">
			<div className="game-header">
				<h2>Shaktris</h2>
				{isSpectating && <div className="spectator-badge">Spectator Mode</div>}
			</div>
			
			<div className="game-content">
				<div className="turn-indicators">
					{gameState.activePlayers.map(playerId => {
						const turn = gameState.currentTurns?.[playerId];
						if (!turn) return null;
						
						return (
							<TurnIndicator
								key={playerId}
								playerId={playerId}
								playerName={turn.playerName}
								playerColor={turn.playerColor}
								difficulty={turn.difficulty}
								turnPhase={turn.phase}
								turnStartTime={turn.startTime}
								minTurnTime={turn.minTime}
								isActive={!gameState.pausedPlayers?.includes(playerId)}
								isPaused={gameState.pausedPlayers?.includes(playerId)}
								canSkipChessMove={turn.canSkipChessMove}
								onSkipChessMove={handleSkipChessMove}
							/>
						);
					})}
				</div>
				
				<div className="game-board-container">
					<GameBoard
						board={gameState.board}
						pieces={gameState.pieces}
						homeZones={gameState.homeZones}
						selectedPiece={selectedPiece}
						validMoves={validMoves}
						activePlayers={gameState.activePlayers}
						pausedPlayers={gameState.pausedPlayers}
						onCellClick={handleCellClick}
						onPieceClick={handlePieceClick}
						onPieceMove={handlePieceMove}
						spectatingPlayerId={spectatingPlayerId}
					/>
					
					<TetrominoSystem
						gameState={gameState}
						activeTetromino={gameState.currentTurns?.[playerId]?.activeTetromino}
						boardCells={gameState.board}
						playerKingPosition={gameState.pieces?.find(p => p.type === 'king' && p.playerId === playerId)}
						onTetrominoPlacement={handleTetrominoPlacement}
					/>
					
					{rowClearing && (
						<RowClearingVisualizer
							clearingInfo={rowClearing}
							boardDimensions={gameState.boardDimensions}
						/>
					)}
				</div>
			</div>
			
			{error && (
				<div className="error-message">
					<span>{error}</span>
					<button onClick={() => setError(null)}>Dismiss</button>
				</div>
			)}
			
			{promotingPawn && (
				<PawnPromotionModal
					pawn={promotingPawn}
					options={[
						{ type: 'queen', label: 'Queen' },
						{ type: 'rook', label: 'Rook' },
						{ type: 'bishop', label: 'Bishop' },
						{ type: 'knight', label: 'Knight' }
					]}
					onSelect={handlePawnPromotion}
				/>
			)}
			
			{gameOver && (
				<div className="game-over-overlay">
					<div className="game-over-message">
						<h2>Game Over</h2>
						<p>{gameResult?.message || 'The game has ended.'}</p>
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
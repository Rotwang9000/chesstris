import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './TurnIndicator.css';

/**
 * TurnIndicator Component
 * 
 * Displays the current turn phase (tetromino or chess move) and a timer
 * with difficulty-based duration indicators
 */
const TurnIndicator = ({
	playerId,
	playerName,
	playerColor,
	difficulty = 'medium',
	turnPhase = 'tetromino',
	turnStartTime,
	minTurnTime,
	isActive = false,
	isPaused = false,
	canSkipChessMove = false,
	onSkipChessMove
}) => {
	// Calculate remaining minimum turn time
	const [timeRemaining, setTimeRemaining] = useState(0);
	const [canContinue, setCanContinue] = useState(false);
	
	// Get difficulty-based minimum turn time
	const getDifficultyTime = () => {
		switch (difficulty.toLowerCase()) {
			case 'easy':
				return 15 * 1000; // 15 seconds
			case 'hard':
				return 5 * 1000; // 5 seconds
			case 'medium':
			default:
				return 10 * 1000; // 10 seconds
		}
	};
	
	// Update timer
	useEffect(() => {
		if (!isActive || isPaused) {
			return;
		}
		
		// Calculate actual minimum time based on difficulty
		const actualMinTime = minTurnTime || getDifficultyTime();
		
		// Time elapsed since turn start
		const elapsedTime = turnStartTime ? Date.now() - turnStartTime : 0;
		
		// Calculate remaining time
		const remaining = Math.max(0, actualMinTime - elapsedTime);
		setTimeRemaining(remaining);
		
		// Set can continue flag
		setCanContinue(remaining <= 0);
		
		// Update timer
		const timerId = setInterval(() => {
			const newElapsedTime = turnStartTime ? Date.now() - turnStartTime : 0;
			const newRemaining = Math.max(0, actualMinTime - newElapsedTime);
			
			setTimeRemaining(newRemaining);
			setCanContinue(newRemaining <= 0);
			
			// Clear interval when time is up
			if (newRemaining <= 0) {
				clearInterval(timerId);
			}
		}, 100);
		
		return () => clearInterval(timerId);
	}, [turnStartTime, isActive, isPaused, minTurnTime, difficulty]);
	
	// Format time remaining as seconds
	const formatTimeRemaining = () => {
		const seconds = Math.ceil(timeRemaining / 1000);
		return `${seconds}s`;
	};
	
	// Get progress percentage for timer bar
	const getProgressPercentage = () => {
		if (!turnStartTime) return 0;
		
		const actualMinTime = minTurnTime || getDifficultyTime();
		const elapsed = Date.now() - turnStartTime;
		const percent = Math.min(100, (elapsed / actualMinTime) * 100);
		
		return percent;
	};
	
	// Get turn phase display text
	const getTurnPhaseText = () => {
		if (turnPhase === 'tetromino') {
			return 'Place Tetromino';
		} else if (turnPhase === 'chess') {
			return canSkipChessMove ? 'Move Chess Piece (Optional)' : 'Move Chess Piece';
		}
		return 'Waiting';
	};
	
	// Handle skip chess move button click
	const handleSkipClick = () => {
		if (canSkipChessMove && onSkipChessMove) {
			onSkipChessMove(playerId);
		}
	};
	
	return (
		<div 
			className={`turn-indicator 
				${isActive ? 'active' : 'inactive'} 
				${isPaused ? 'paused' : ''} 
				${difficulty.toLowerCase()} 
				${turnPhase} 
				${canContinue ? 'can-continue' : ''}`
			}
			style={{ '--player-color': playerColor }}
		>
			<div className="player-info">
				<div 
					className="player-color-indicator" 
					style={{ backgroundColor: playerColor }}
				></div>
				<div className="player-name">{playerName}</div>
				<div className="difficulty-badge">{difficulty}</div>
			</div>
			
			<div className="turn-phase">
				<div className="phase-label">{getTurnPhaseText()}</div>
				
				{canSkipChessMove && turnPhase === 'chess' && (
					<button 
						className="skip-button"
						onClick={handleSkipClick}
						disabled={!canContinue}
					>
						Skip
					</button>
				)}
			</div>
			
			<div className="turn-timer">
				<div className="timer-bar-container">
					<div 
						className="timer-bar" 
						style={{ width: `${getProgressPercentage()}%` }}
					></div>
				</div>
				
				<div className="timer-value">
					{timeRemaining > 0 ? (
						<>
							Wait <span className="time">{formatTimeRemaining()}</span>
						</>
					) : (
						<span className="continue-text">Continue</span>
					)}
				</div>
			</div>
			
			{isPaused && (
				<div className="paused-overlay">
					<span className="paused-text">PAUSED</span>
				</div>
			)}
		</div>
	);
};

TurnIndicator.propTypes = {
	playerId: PropTypes.string.isRequired,
	playerName: PropTypes.string.isRequired,
	playerColor: PropTypes.string.isRequired,
	difficulty: PropTypes.oneOf(['easy', 'medium', 'hard', 'Easy', 'Medium', 'Hard']),
	turnPhase: PropTypes.oneOf(['tetromino', 'chess', 'waiting']),
	turnStartTime: PropTypes.number,
	minTurnTime: PropTypes.number,
	isActive: PropTypes.bool,
	isPaused: PropTypes.bool,
	canSkipChessMove: PropTypes.bool,
	onSkipChessMove: PropTypes.func
};

export default TurnIndicator; 
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PauseControl.css';

/**
 * PauseControl component allows players to pause and resume their game
 * 
 * @param {Object} props Component props
 * @param {string} props.gameId The ID of the current game
 * @param {string} props.playerId The ID of the current player
 * @param {function} props.onStatusChange Callback when pause status changes
 * @returns {JSX.Element} The rendered component
 */
const PauseControl = ({ gameId, playerId, onStatusChange }) => {
	const [isPaused, setIsPaused] = useState(false);
	const [remainingTime, setRemainingTime] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [tooltipVisible, setTooltipVisible] = useState(false);
	
	// Format the remaining time as MM:SS
	const formatTime = (ms) => {
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	};
	
	// Check the pause status periodically
	useEffect(() => {
		const checkPauseStatus = async () => {
			try {
				const response = await axios.get(`/api/games/${gameId}/players/${playerId}/pauseStatus`);
				const { isPaused: newIsPaused, remainingTime: newRemainingTime } = response.data;
				
				if (isPaused !== newIsPaused) {
					setIsPaused(newIsPaused);
					if (onStatusChange) {
						onStatusChange(newIsPaused);
					}
				}
				
				setRemainingTime(newRemainingTime);
			} catch (error) {
				console.error('Error checking pause status:', error);
			}
		};
		
		// Check immediately and then every second
		checkPauseStatus();
		const interval = setInterval(checkPauseStatus, 1000);
		
		return () => clearInterval(interval);
	}, [gameId, playerId, isPaused, onStatusChange]);
	
	// Handle pause button click
	const handlePause = async () => {
		setIsLoading(true);
		try {
			const response = await axios.post(`/api/games/${gameId}/players/${playerId}/pause`);
			if (response.data.success) {
				setIsPaused(true);
				if (onStatusChange) {
					onStatusChange(true);
				}
			} else {
				console.error('Error pausing game:', response.data.error);
			}
		} catch (error) {
			console.error('Error pausing game:', error);
		} finally {
			setIsLoading(false);
		}
	};
	
	// Handle resume button click
	const handleResume = async () => {
		setIsLoading(true);
		try {
			const response = await axios.post(`/api/games/${gameId}/players/${playerId}/resume`);
			if (response.data.success) {
				setIsPaused(false);
				if (onStatusChange) {
					onStatusChange(false);
				}
			} else {
				console.error('Error resuming game:', response.data.error);
			}
		} catch (error) {
			console.error('Error resuming game:', error);
		} finally {
			setIsLoading(false);
		}
	};
	
	return (
		<div className="pause-control">
			{isPaused ? (
				<>
					<div className="pause-status">
						<span className="pause-label">PAUSED</span>
						<span className="pause-timer">{formatTime(remainingTime)}</span>
					</div>
					<button 
						className="resume-button"
						onClick={handleResume}
						disabled={isLoading}
					>
						Resume Game
					</button>
				</>
			) : (
				<button 
					className="pause-button"
					onClick={handlePause}
					disabled={isLoading}
				>
					Pause Game
				</button>
			)}
			
			{tooltipVisible && (
				<div className="pause-tooltip">
					<p>Pause your game for up to 15 minutes. Limited to once every 10 minutes.</p>
					<p>Use pause to take a break, but note that your pieces will be vulnerable after 15 minutes!</p>
				</div>
			)}
		</div>
	);
};

export default PauseControl; 
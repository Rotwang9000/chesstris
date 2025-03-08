import React, { useState, useEffect } from 'react';
import { socket } from '../services/socketService';
import './PauseControl.css';

/**
 * Component for controlling game pause functionality
 */
const PauseControl = ({ playerId, gameId }) => {
	const [isPaused, setIsPaused] = useState(false);
	const [pauseExpiry, setPauseExpiry] = useState(null);
	const [cooldownRemaining, setCooldownRemaining] = useState(0);
	const [onCooldown, setOnCooldown] = useState(false);
	const [tooltipVisible, setTooltipVisible] = useState(false);
	
	// Format time remaining in mm:ss format
	const formatTimeRemaining = (ms) => {
		const totalSeconds = Math.ceil(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	};
	
	// Check pause cooldown status
	const checkPauseCooldown = () => {
		socket.emit('checkPauseCooldown', { gameId });
	};
	
	// Handle pause button click
	const handlePauseClick = () => {
		if (isPaused) {
			// Resume game
			socket.emit('resumeGame', { gameId });
		} else {
			// Pause game
			socket.emit('pauseGame', { gameId });
		}
	};
	
	// Setup socket listeners
	useEffect(() => {
		// Check initial pause cooldown status
		checkPauseCooldown();
		
		// Set up interval to check cooldown status
		const intervalId = setInterval(checkPauseCooldown, 5000); // Check every 5 seconds
		
		// Pause response handler
		socket.on('pauseResponse', (data) => {
			if (data.success) {
				setIsPaused(true);
				setPauseExpiry(data.expiryTime);
			} else if (data.reason === 'on_cooldown') {
				setCooldownRemaining(data.remainingTime);
				setOnCooldown(true);
			}
		});
		
		// Resume response handler
		socket.on('resumeResponse', (data) => {
			if (data.success) {
				setIsPaused(false);
				setPauseExpiry(null);
				if (data.cooldownRemaining) {
					setCooldownRemaining(data.cooldownRemaining);
					setOnCooldown(true);
				}
			}
		});
		
		// Handle player paused event (could be from another player)
		socket.on('playerPaused', (data) => {
			if (data.playerId === playerId) {
				setIsPaused(true);
				setPauseExpiry(data.expiryTime);
			}
		});
		
		// Handle player resumed event
		socket.on('playerResumed', (data) => {
			if (data.playerId === playerId) {
				setIsPaused(false);
				setPauseExpiry(null);
				if (data.cooldownRemaining) {
					setCooldownRemaining(data.cooldownRemaining);
					setOnCooldown(true);
				}
			}
		});
		
		// Pause cooldown status handler
		socket.on('pauseCooldownStatus', (data) => {
			if (data.success) {
				setOnCooldown(data.onCooldown);
				setCooldownRemaining(data.remainingTime);
			}
		});
		
		// Set up countdown timers
		let pauseCountdown;
		let cooldownCountdown;
		
		if (isPaused && pauseExpiry) {
			pauseCountdown = setInterval(() => {
				const remaining = pauseExpiry - Date.now();
				if (remaining <= 0) {
					setIsPaused(false);
					setPauseExpiry(null);
					clearInterval(pauseCountdown);
				}
			}, 1000);
		}
		
		if (onCooldown && cooldownRemaining) {
			cooldownCountdown = setInterval(() => {
				setCooldownRemaining(prev => {
					const newRemaining = prev - 1000;
					if (newRemaining <= 0) {
						setOnCooldown(false);
						clearInterval(cooldownCountdown);
						return 0;
					}
					return newRemaining;
				});
			}, 1000);
		}
		
		// Clean up
		return () => {
			clearInterval(intervalId);
			clearInterval(pauseCountdown);
			clearInterval(cooldownCountdown);
			
			socket.off('pauseResponse');
			socket.off('resumeResponse');
			socket.off('playerPaused');
			socket.off('playerResumed');
			socket.off('pauseCooldownStatus');
		};
	}, [playerId, gameId, isPaused, pauseExpiry, onCooldown, cooldownRemaining]);
	
	return (
		<div className="pause-control">
			<button 
				className={`pause-button ${isPaused ? 'paused' : ''} ${onCooldown && !isPaused ? 'on-cooldown' : ''}`}
				onClick={handlePauseClick}
				disabled={onCooldown && !isPaused}
				onMouseEnter={() => setTooltipVisible(true)}
				onMouseLeave={() => setTooltipVisible(false)}
			>
				{isPaused ? 'Resume' : 'Pause'}
			</button>
			
			{isPaused && pauseExpiry && (
				<div className="pause-timer">
					Pause ends in: {formatTimeRemaining(pauseExpiry - Date.now())}
				</div>
			)}
			
			{onCooldown && !isPaused && (
				<div className="cooldown-timer">
					Next pause in: {formatTimeRemaining(cooldownRemaining)}
				</div>
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
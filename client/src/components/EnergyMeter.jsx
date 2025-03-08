import React, { useState, useEffect } from 'react';
import { socket } from '../services/socketService';
import './EnergyMeter.css';

/**
 * Component to display player's energy level
 */
const EnergyMeter = ({ playerId }) => {
	const [energy, setEnergy] = useState({
		current: 10,
		max: 10,
		regenRate: 1,
		regenInterval: 5000,
		costs: {
			pawn: 1,
			knight: 2,
			bishop: 2,
			rook: 3,
			queen: 4,
			king: 1
		}
	});
	
	const [showTooltip, setShowTooltip] = useState(false);
	
	// Calculate energy percentage for display
	const energyPercentage = Math.min(100, Math.max(0, (energy.current / energy.max) * 100));
	
	// Get color based on energy level
	const getEnergyColor = () => {
		if (energyPercentage > 60) return '#27ae60'; // Green
		if (energyPercentage > 30) return '#f39c12'; // Orange
		return '#e74c3c'; // Red
	};
	
	// Format time until next energy point
	const formatTimeUntilNextPoint = () => {
		// Energy regenerates at a constant rate
		const msPerPoint = energy.regenInterval / energy.regenRate;
		
		// If full, return 'Full'
		if (energy.current >= energy.max) {
			return 'Full';
		}
		
		// Calculate time until next point in seconds
		const secondsUntilNext = Math.ceil(msPerPoint / 1000);
		
		// Format as mm:ss
		const minutes = Math.floor(secondsUntilNext / 60);
		const seconds = secondsUntilNext % 60;
		
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	};
	
	// Check energy status when component mounts
	useEffect(() => {
		// Initial energy check
		socket.emit('checkEnergy');
		
		// Set up interval to check energy
		const intervalId = setInterval(() => {
			socket.emit('checkEnergy');
		}, 5000); // Check every 5 seconds
		
		// Listen for energy updates
		socket.on('energyUpdate', (data) => {
			if (data.success !== false) {
				setEnergy({
					current: data.current,
					max: data.max,
					regenRate: data.regenRate,
					regenInterval: data.regenInterval,
					costs: data.costs
				});
			}
		});
		
		// Clean up
		return () => {
			clearInterval(intervalId);
			socket.off('energyUpdate');
		};
	}, [playerId]);
	
	return (
		<div className="energy-meter-container">
			<div 
				className="energy-meter"
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
			>
				<div className="energy-label">Energy</div>
				<div className="energy-bar-container">
					<div 
						className="energy-bar"
						style={{ 
							width: `${energyPercentage}%`,
							backgroundColor: getEnergyColor()
						}}
					/>
				</div>
				<div className="energy-value">
					{energy.current}/{energy.max}
				</div>
				<div className="energy-regen">
					+1 in {formatTimeUntilNextPoint()}
				</div>
			</div>
			
			{showTooltip && (
				<div className="energy-tooltip">
					<h3>Chess Piece Energy Costs</h3>
					<ul>
						{Object.entries(energy.costs).map(([piece, cost]) => (
							<li key={piece}>
								<span className="piece-name">{piece.charAt(0).toUpperCase() + piece.slice(1)}</span>
								<span className="piece-cost">{cost} energy</span>
							</li>
						))}
					</ul>
					<p className="tooltip-info">Energy regenerates at a rate of {energy.regenRate} every {energy.regenInterval / 1000} seconds.</p>
				</div>
			)}
		</div>
	);
};

export default EnergyMeter; 
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Game from './components/Game';
import './App.css';

const App = () => {
	const [playerId, setPlayerId] = useState(null);
	const [loading, setLoading] = useState(true);
	
	// Set a playerId on component mount
	useEffect(() => {
		// Check for an existing playerId in localStorage
		const storedPlayerId = localStorage.getItem('shaktris_player_id');
		
		if (storedPlayerId) {
			setPlayerId(storedPlayerId);
		} else {
			// Generate a temporary ID if none exists
			const tempId = `player_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
			localStorage.setItem('shaktris_player_id', tempId);
			setPlayerId(tempId);
		}
		
		setLoading(false);
	}, []);
	
	if (loading) {
		return (
			<div className="loading-screen">
				<div className="spinner"></div>
				<h2>Loading Shaktris...</h2>
			</div>
		);
	}
	
	return (
		<Router>
			<div className="app-container">
				<Routes>
					{/* Home/Lobby route */}
					<Route path="/" element={
						<div className="home-container">
							<h1>Shaktris</h1>
							<p>Chess meets Tetris in this innovative multiplayer game</p>
							
							<div className="home-actions">
								<button 
									className="action-button primary"
									onClick={() => {
										// Create a new game and navigate to it
										window.location.href = `/game/new`;
									}}
								>
									New Game
								</button>
								
								<button 
									className="action-button"
									onClick={() => {
										// Show join game dialog
										const gameId = prompt('Enter Game ID:');
										if (gameId) {
											window.location.href = `/game/${gameId}`;
										}
									}}
								>
									Join Game
								</button>
								
								<button 
									className="action-button"
									onClick={() => {
										// Show spectate dialog
										const gameId = prompt('Enter Game ID to spectate:');
										if (gameId) {
											window.location.href = `/spectate/${gameId}`;
										}
									}}
								>
									Spectate
								</button>
							</div>
							
							<div className="game-info">
								<h2>How to Play</h2>
								<p>1. Place Tetris pieces to build the board</p>
								<p>2. Move your chess pieces strategically</p>
								<p>3. Capture opponent kings to win</p>
								<p>4. Watch out for row clearing when 8 cells align</p>
								<p>5. Build paths from your king to your pieces</p>
							</div>
						</div>
					} />
					
					{/* New Game route - creates a new game and redirects */}
					<Route path="/game/new" element={<Navigate to={`/game/${Date.now()}`} />} />
					
					{/* Game route */}
					<Route path="/game/:gameId" element={<Game playerId={playerId} />} />
					
					{/* Spectate route */}
					<Route path="/spectate/:gameId" element={<Game playerId={playerId} isSpectating={true} />} />
					
					{/* 404 route */}
					<Route path="*" element={<Navigate to="/" />} />
				</Routes>
			</div>
		</Router>
	);
};

export default App; 
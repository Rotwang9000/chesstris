/**
 * Test Utilities
 * 
 * This file provides utility functions and imports for tests.
 * It helps avoid duplicate imports across test files.
 */

// Import the player controls module functions directly
import {
    handlePlayerPause, 
    handlePlayerResume, 
    isPlayerPaused,
    isPlayerOnPauseCooldown,
    getPauseCooldownRemaining,
    setPauseCooldown,
    setGameState
} from '../src/playerControls.mjs';

// Re-export the functions
export {
    handlePlayerPause, 
    handlePlayerResume, 
    isPlayerPaused,
    isPlayerOnPauseCooldown,
    getPauseCooldownRemaining,
    setPauseCooldown,
    setGameState
};

// Add any other test utilities here
export const createMockGameState = () => {
    const mockState = {
        players: [
            { id: 'player1', name: 'Player 1', isPaused: false, pauseCooldown: 0 },
            { id: 'player2', name: 'Player 2', isPaused: false, pauseCooldown: 0 },
            { id: 'player3', name: 'Player 3', isPaused: false, pauseCooldown: Date.now() + 60000 }
        ],
        board: [],
        fallingPiece: null
    };
    
    // Update the game state in the player controls module
    setGameState(mockState);
    
    return mockState;
};

export const createMockSocket = (sandbox) => {
    return {
        id: 'socket1',
        join: sandbox.stub(),
        emit: sandbox.stub(),
        on: sandbox.stub()
    };
};

export const createMockIO = (sandbox) => {
    return {
        to: sandbox.stub().returnsThis(),
        emit: sandbox.stub()
    };
}; 
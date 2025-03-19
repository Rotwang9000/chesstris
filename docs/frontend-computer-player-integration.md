# Frontend Computer Player Integration Guide

This document outlines how the frontend should integrate with the computer player system in Shaktris.

## Overview

The Shaktris game supports two types of computer players:
1. **Built-in computer players** - Run directly on the server
2. **External computer players** - Connect via the RESTful API

The frontend needs to handle displaying computer player actions, managing turn transitions, and providing appropriate UI elements for player management.

## Computer Player Identification

Computer players can be identified by:
- Player ID prefix: `ext-ai-` for external computer players, `int-ai-` for built-in ones
- `isComputerPlayer` flag in player objects
- Custom avatars and styling for computer players

## Frontend Requirements

### UI Components

1. **Player Roster**
   - Display computer players with a distinct visual style
   - Show connection status for external computer players
   - Indicate computer player difficulty level

2. **Game Controls**
   - Add/remove computer player buttons
   - Computer player difficulty selector
   - Option to pause/resume computer players

3. **Game Board**
   - Visual indication of computer player moves
   - Animation timing for computer player actions
   - Highlight current active computer player

4. **Spectator Mode**
   - Allow spectating computer player games
   - Display computer player statistics and strategy information

### State Management

The frontend should track:
- Which players are computer-controlled
- Current turn status (human vs computer)
- Computer player move history
- Computer player performance metrics

## API Integration

### Endpoints to Consume

1. **Get Computer Players**
   ```
   GET /api/computer-players
   ```
   Returns a list of available computer players, both built-in and external.

2. **Add Computer Player to Game**
   ```
   POST /api/games/:gameId/add-computer-player
   ```
   Request body:
   ```json
   {
     "difficulty": "easy|medium|hard",
     "type": "built-in|external",
     "externalId": "optional-external-player-id"
   }
   ```

3. **Remove Computer Player**
   ```
   DELETE /api/games/:gameId/players/:playerId
   ```

4. **Get Computer Player Status**
   ```
   GET /api/games/:gameId/computer-players/:playerId/status
   ```
   Returns status information about a computer player, including connection status, move queue, and performance metrics.

### Websocket Events

The frontend should listen for these Socket.IO events:

1. `computer_player_joined` - A computer player has joined the game
2. `computer_player_left` - A computer player has left the game
3. `computer_player_move_start` - A computer player is about to make a move
4. `computer_player_move_end` - A computer player has completed a move
5. `computer_player_status_change` - A computer player's status has changed

## Rendering Computer Player Actions

### Tetromino Placement

1. Receive tetromino placement data from server
2. Animate tetromino falling from above
3. Apply placement with standard visual effects
4. Use a slightly faster animation speed than human players

### Chess Piece Movement

1. Receive chess move data from server
2. Highlight the piece being moved
3. Animate movement along the path
4. Apply capture effects if applicable
5. Use a slightly faster animation speed than human players

## Turn Management

1. Display "Computer player thinking..." indicator during computer turns
2. Enforce minimum 10-second delay between computer player moves
3. Allow human players to pause the game during their turn
4. Provide option to skip computer player turns for testing

## Error Handling

1. Display connection status for external computer players
2. Show error messages if a computer player fails to make a valid move
3. Provide reconnection options for disconnected external computer players
4. Allow replacing a malfunctioning computer player

## Testing Tools

The frontend should include:

1. **Computer Player Debugger**
   - View computer player decision-making process
   - See available moves being considered
   - Track performance metrics

2. **Move Simulator**
   - Test how computer players would respond to specific board states
   - Simulate multiple turns ahead

## Implementation Example

Here's an example of how to handle computer player moves in the frontend:

```javascript
// Listen for computer player move events
socket.on('computer_player_move_start', (data) => {
	const { playerId, moveType } = data;
	
	// Show thinking indicator
	ui.showThinkingIndicator(playerId);
	
	// Disable user input during computer move
	game.disableUserInput();
});

socket.on('computer_player_move_end', (data) => {
	const { playerId, moveType, moveData, gameState } = data;
	
	// Hide thinking indicator
	ui.hideThinkingIndicator(playerId);
	
	// Animate the move
	if (moveType === 'tetromino') {
		game.animateTetrominoPlacement(moveData.shape, moveData.rotation, moveData.x, moveData.y);
	} else if (moveType === 'chess') {
		game.animateChessMove(moveData.pieceId, moveData.fromX, moveData.fromY, moveData.toX, moveData.toY);
	}
	
	// Update game state
	game.updateState(gameState);
	
	// Re-enable user input if it's a human player's turn
	if (!gameState.currentPlayer.isComputerPlayer) {
		game.enableUserInput();
	}
});
```

## Design Considerations

1. **Visual Distinction**
   - Use different colors or icons for computer players
   - Show computer player difficulty level
   - Indicate external vs built-in computer players

2. **Animation Timing**
   - Computer player moves should be slightly faster than human moves
   - Add small random delays to make computer player moves feel more natural
   - Ensure animations complete before the next move begins

3. **User Experience**
   - Provide clear indication of whose turn it is
   - Allow users to adjust computer player speed
   - Enable/disable computer player move animations

## Conclusion

Proper integration of computer players in the frontend is crucial for a seamless gaming experience. By following these guidelines, the frontend team can ensure that computer players are properly represented in the UI and that their actions are displayed in a way that enhances the gameplay experience. 
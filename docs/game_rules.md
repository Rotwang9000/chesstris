# Shaktris Game Rules

## Overview

Shaktris is a unique multiplayer game that combines elements of chess and Tetris on a dynamically expanding board. Players must strategically place tetromino pieces to build paths for their chess pieces, while also using chess tactics to capture opponent pieces.

## Game Setup

1. **Board**: The game starts with each player having a "home zone" where their chess pieces are initially placed.
2. **Chess Pieces**: Each player starts with a standard set of chess pieces arranged in the traditional starting formation.
3. **Tetromino Queue**: Each player has their own queue of upcoming tetromino pieces.

## Core Mechanics

### Tetromino Placement

1. **Falling Pieces**: Tetromino pieces fall from above the board, similar to Tetris.
2. **Connectivity Rule**: Tetromino pieces will only stick to the board if:
   - At least one block lands adjacent to an existing cell
   - There is a continuous path back to the player's king
3. **Orphaned Pieces**: When a row is cleared, any pieces that become disconnected from the path to the king will fall back towards the king's position.
4. **Rotation and Movement**: Players can rotate and move tetromino pieces as they fall, following standard Tetris controls.

### Chess Movement

1. **Standard Chess Rules**: Chess pieces move according to standard chess rules, with a few modifications.
2. **Movement Restrictions**: Chess pieces can only move on cells that are part of the board (i.e., cells that have been created by placing tetromino pieces).
3. **Pawn Promotion**: Pawns are automatically promoted to knights once they have moved 8 spaces forward.
4. **Check and Checkmate**: Standard chess check and checkmate rules apply. If a player's king is captured, they lose the game.

### Turn Structure

1. **Asynchronous Turns**: Each player has their own gameplay cycle:
   - A tetromino piece falls for the player to place
   - After placing the piece, they can move one of their chess pieces
   - Players don't need to wait for other players' turns
2. **Minimum Turn Length**: A minimum 10-second turn length helps human players compete with others, especially computer-controlled opponents.

### Board Expansion

1. **Dynamic Board**: The board expands as players place tetromino pieces.
2. **Row Clearing**: When a complete row of cells is formed (8 cells in a row), the row is cleared, and all pieces above it fall down.
3. **Home Zone Protection**: Cells in a "safe" home zone that still has at least one piece are not cleared when a row is completed.
4. **Home Zone Degradation**: Empty home zones degrade over time to encourage movement and clear abandoned zones.

## Winning Conditions

1. **King Capture**: A player wins if they capture their opponent's king.
2. **Disconnection**: If a player's king becomes completely isolated with no valid moves and no way to place tetromino pieces, they lose the game.
3. **Time Limit**: In timed games, the player with the highest score when the time limit is reached wins.

## Scoring System

1. **Tetromino Placement**: Points are awarded for successfully placing tetromino pieces.
2. **Row Clearing**: Additional points are awarded for clearing rows.
3. **Chess Captures**: Points are awarded for capturing opponent chess pieces, with different values for different piece types.
4. **Special Moves**: Bonus points are awarded for special moves like castling or en passant.

## Game Modes

1. **Standard Mode**: The default game mode with all rules as described above.
2. **Timed Mode**: Players have a limited amount of time to make their moves.
3. **Survival Mode**: The game speed increases over time, making it more challenging to place tetromino pieces.
4. **Practice Mode**: A single-player mode where players can practice without an opponent.

## Special Features

1. **Power-ups**: Occasionally, special power-up blocks appear that provide temporary advantages when collected.
2. **Special Tetromino Pieces**: Rare special tetromino pieces with unique properties can appear in the queue.
3. **Board Events**: Random events can affect the board, such as earthquakes that shift pieces or storms that temporarily obscure parts of the board.

## Advanced Strategies

1. **Building Bridges**: Create paths for your chess pieces to reach opponent territory.
2. **Defensive Walls**: Build walls to protect your king and important pieces.
3. **Tetromino Traps**: Place tetromino pieces to limit opponent movement options.
4. **Chess Tactics**: Use standard chess tactics like forks, pins, and skewers to gain an advantage.
5. **Resource Management**: Balance between expanding your territory and developing your chess pieces.

## Accessibility Features

1. **Color Blind Mode**: Alternative color schemes for players with color blindness.
2. **Sound Cues**: Audio feedback for important game events.
3. **Zoom Controls**: Ability to zoom in and out of the board for better visibility.
4. **Customizable Controls**: Players can customize keyboard and mouse controls to suit their preferences. 
# Shaktris Axis Change Summary

## Critical Issue

The current implementation uses an incorrect axis orientation:
- Chess board is on the XY plane (horizontal)
- Tetris pieces fall along the Z-axis (vertical)

According to the intended design, the correct orientation should be:
- Chess board should be on the XZ plane (horizontal)
- Tetris pieces should fall along the Y-axis (vertical)

This is a fundamental architectural issue that affects core gameplay mechanics.

## Impact

This incorrect orientation affects:
1. Movement and placement of tetrominos
2. Board representation and connectivity checks
3. Chess piece movement
4. Row clearing logic

## Key Changes Required

A comprehensive reorientation is needed throughout the codebase:

1. **Variable Renaming**: All instances of board coordinates need to be renamed:
   - `y` coordinates on the board → `z` (depth on the horizontal plane)
   - `z` height coordinates → `y` (vertical height)

2. **Data Structures**: Board representation needs to be changed from `board[y][x]` to `board[z][x]`.

3. **Tetromino Logic**: Change the tetromino placement to check:
   - Tetrominos explode if at Y=1 with a cell underneath
   - Tetrominos stick if at Y=0 with an adjacent cell and path to king

4. **Chess Movement**: Update all chess movement to use XZ coordinates rather than XY.

5. **Row Clearing**: Update to clear rows in the XZ plane rather than XY plane.

6. **API Interface**: Update all API endpoint parameters to use the new coordinate system.

## Development Approach

A complete refactoring is necessary rather than incremental changes. The detailed implementation guide in `axis-reorientation-guide.md` contains specific instructions for each component that needs to be updated.

Due to the extent of these changes and their impact on both backend and frontend, this should be treated as a high-priority architectural change required for the game to function as intended. 
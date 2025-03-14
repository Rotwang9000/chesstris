Shaktris:
## Core Gameplay Mechanics
A multiplayer game that combines elements of chess and Tetris on a dynamically expanding board.

Shaktris is a multiplayer prototype that fuses elements of chess and Tetris on a dynamically expanding 2D board rendered in 3D. In this game, each player is assigned a unique "home zone" (an 8×2 area randomly placed, although within 8 to 12 squares of another home zone) where their chess pieces reside. 
Tetromino pieces fall from the sky (along the Z‑axis) and stick to the board only if at least one block lands adjacent to an existing cell which has a route back to the players king. The chess pieces can then use this as part of the board. So they need to build up the board towards their opponent to be able to move pieces into a place where they can attack.
 Full rows (any 8 in a line) are cleared, including any pieces on them, except for cells in a "safe" home zone that still has at least one piece. To encourage movement and clear abandoned zones, empty home zones degrade over time.

- **Tetris Piece Connectivity Rules:**  
  Tetris pieces will only stick to the board if:
  1. They are connected to other existing pieces
  2. There is a continuous path back to the player's king
  This forces players to build strategically from their king's position, preventing disconnected "islands" of pieces.
  When a row is cleared, orphaned pieces will drop back, towards the player's king.

- **Pawn Promotion:**  
  Pawns are automatically promoted to knights once they have moved 8 spaces forward, increasing their utility in the late game.

- **Asynchronous Turns:**  
  Each player has their own gameplay cycle:
  1. A tetris piece falls for the player to place
  2. After placing the piece, they can move one of their chess pieces
  3. Players don't need to wait for other players' turns
  4. A minimum 10-second turn length helps human players compete with others, especially computer-controlled opponents
  5. Different difficulty worlds adjust this timing to accommodate various skill levels

- **Piece Acquisition:**  
  Players can purchase additional pieces at any time using Solana:
  - 0.1 SOL for a pawn
  - 0.5 SOL for rooks, knights, or bishops
  - 1.0 SOL for a queen
  - Kings cannot be purchased


- **King Capture Mechanics:**  
  When a player captures an opponent's king:
  1. The victor gains ownership of all the opponent's remaining pieces
  2. 50% of the fees paid by the defeated player for extra pieces is awarded to the victor
  3. This represents a "ransom" to allow the king to escape (and the defeated player to start a new game)

- **Player Pause System:**  
  Players can temporarily pause the game:
  1. A player can freeze their pieces for up to 15 minutes
  2. During the pause, their pieces cannot be captured and their cells won't be cleared
  3. Their home zone is protected regardless of whether it contains pieces
  4. Players can resume their game at any time during the pause period
  5. If a player doesn't return within 15 minutes:
     - Their main island (connected to king) is removed from the board
     - Cells owned by other players on this island are reassigned based on proximity to kings
     - Equidistant cells become neutral "no-man's land" (grey cells)
     - Pieces not on the main island are returned to the home zone
     - The home zone is expanded if needed to accommodate all returning pieces
     - Any pieces that can't fit in the expanded home zone are lost
  6. The pause system allows for natural breaks while preventing disruption to other players
Tetches:
## Core Gameplay Mechanics
A massive multiplayer online game that combines elements of chess and Tetris on a dynamically expanding board.

Tetches is a multiplayer prototype that fuses elements of chess and Tetris on a dynamically expanding 2D board rendered in 3D. In this game, each player is assigned a unique "home zone" (an 8×2 area randomly placed, although within 8 to 12 squares of another home zone) where their chess pieces reside. 

Chess pieces move on the X-Z plane (X is horizontal, Z is vertical), while tetromino pieces fall from above along the Y-axis. The tetrominos stick to the board only if at least one block lands adjacent to an existing cell which has a route back to the player's king. The chess pieces can then use these cells as part of the board. Players need to build up the board towards their opponent to be able to move pieces into a place where they can attack.

Full rows (any 8 in a line) are cleared, including any pieces on them, except for cells in a "safe" home zone that still has at least one piece. To encourage movement and clear abandoned zones, empty home zones degrade over time.

All players play in the same world in a seeming infinite sky (new worlds will come later)
The default world should have a faux historical Russian Theme.
There will be computer players and the ability to play by API so you can have your own computer player. 
A spectator view will allow you to see from that player's, or other players' view. 


- **Tetris Piece Connectivity Rules:**  
  Tetris pieces will only stick to the board if:
  1. They are connected to other existing pieces. They have magnetic edges, so as they go past a cell, they will stick and become cells themselves at the same level as other cells.
  That is: imagine a playing surface is X/Z plane. Vertically up is Y. Chess plays on X/Z at Y=0. Tetris pieces fall down on Y.
  When a Tetris piece gets to Y=1, if there is a cell underneath, the tetris piece explodes to nothing.
  When the Tetris piece gets to Y=0, if there is a cell next to it (and a path to king) it stays where it is and becomes 4 cells.
  Otherwise it just keeps falling, burning up in the atmosphere.
    
  2. There is a continuous path back to the player's king.
  This forces players to build strategically from their king's position, preventing disconnected "islands" of pieces.
  When a row is cleared, orphaned pieces will drop back, towards the player's king.
  If any part of the tetris piece lands ON another cell, the whole piece will disintegrate to nothing.
  If it is not adjacent to a cell as it reaches board height it will just fall through the sky and fade away.

- **Pawn Promotion:**  
  Once a pawn has made 8 squares of net forward progress it **freezes in place** and its cell becomes home-like (it can't be cleared or decayed). Click the frozen pawn to open the deployment dialog and swap it for a **Queen, Rook, Bishop or Knight that you have previously captured** (your "captured basket"). Deploying is optional — the pawn stays put until you promote it or an enemy captures it.

- **Check (king-capture grace):**  
  Kings aren't taken instantly. When a move *would* capture an enemy king, the capture is deferred: the defender gets one timed move (20 seconds) to move the king to safety or capture the attacker, with an on-screen alert and a camera fly-to. Run out of time and the king falls. The same attacking piece only offers this grace twice — its third attack takes the king outright, so you can't stall forever.

- **Real-time Actions (Global World):**  
  All players act in the same world at the same time. The server enforces per-action cooldowns so spamming gets rate-limited:
  - Chess move cooldown: ~0.5s
  - Tetromino placement cooldown: ~0.8s
  
  The UI may still show “Tetris” vs “Chess” phases for clarity, but the server is authoritative.

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
  Players can temporarily freeze their own footprint so they can step away without coming back to a wiped board:
  1. While paused, your pieces **cannot be captured**, your cells are skipped by line clears, and your home zone is protected.
  2. Other players keep playing — it's not a world pause, only your footprint becomes inert.
  3. Pauses are **limited per session** (a handful of uses, a per-pause time cap and a total-time budget) so they can't be abused; the button shows how many uses and minutes you have left.
  4. You can resume at any time, and the server auto-resumes you if a single pause runs past its cap.
  5. **Auto-pause when idle (optional):** tick the box under the Pause button and, after ~5 minutes with no input, the game will spend one of your pauses for you and lift it the moment you return. It's off-by-choice because it consumes a pause from your limited budget.
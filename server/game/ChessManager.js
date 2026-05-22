/**
 * ChessManager.js - Manages chess piece movement, validation, and related logic
 * This module contains functionality for chess operations in the XZ-Y coordinate system
 */

const { CHESS_PIECE_POSITIONS, PIECE_PRICES, GAME_RULES } = require('./Constants');
const { log } = require('./GameUtilities');
const cells = require('./cells');
// `pieces` module is the single mutation point for `world.chessPieces`.
// Every removal *must* go through it so the activity log gets a
// `chess_piece_lost` / `chess_piece_captured` / `chess_piece_detonated`
// entry — otherwise a piece can vanish without leaving any trace, which
// is the bug the user has hit multiple times.
const pieceLifecycle = require('./pieces');
// Move validation is a hefty self-contained piece of logic (~400
// LOC) — extracted to `./chess/moveValidation.js` to keep this file
// under the 1500-line refactor threshold and to give the move-rules
// surface a clear, testable boundary.
const moveValidation = require('./chess/moveValidation.js');

class ChessManager {
	constructor(boardManager, islandManager) {
		this.boardManager = boardManager;
		this.islandManager = islandManager;
	}
	
	/**
	 * Initialize chess pieces for a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} homeZone - The home zone coordinates
	 * @returns {Array} The initialized chess pieces
	 */
	initializeChessPieces(game, playerId, homeZone) {
		const pieces = [];
		const playerColor = game.players[playerId].color;
		
		log(`ChessManager: Initialising chess pieces for player ${playerId} with home zone orientation ${homeZone.orientation}`);
		
		// Determine layout based on orientation (not just dimensions)
		// Horizontal layout for orientation 0 (facing up) and 2 (facing down)
		// Vertical layout for orientation 1 (facing right) and 3 (facing left)
		const isHorizontal = homeZone.orientation === 0 || homeZone.orientation === 2;
		
		// Initialize pieces based on home zone orientation
		if (isHorizontal) {
			// Horizontal home zone for orientation 0 or 2
			// Place pieces in traditional chess order: Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// For orientation 0 (facing up), pieces are at bottom and pawns above
			// For orientation 2 (facing down), pieces are at top and pawns below
			const isBottomOriented = homeZone.orientation === 0;
			
			// Place main row pieces
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = homeZone.x + i;
				const z = isBottomOriented ? homeZone.z : homeZone.z + 1;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the other row
			for (let i = 0; i < 8; i++) {
				const x = homeZone.x + i;
				const z = isBottomOriented ? homeZone.z + 1 : homeZone.z;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
		} else {
			// Vertical home zone for orientation 1 or 3
			// Place pieces in a vertical arrangement
			const pieceOrder = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
			
			// For orientation 1 (facing right), pieces are at left and pawns to the right
			// For orientation 3 (facing left), pieces are at right and pawns to the left
			const isLeftOriented = homeZone.orientation === 1;
			
			// Place main column pieces
			for (let i = 0; i < pieceOrder.length; i++) {
				const x = isLeftOriented ? homeZone.x : homeZone.x + 1;
				const z = homeZone.z + i;
				const pieceType = pieceOrder[i];
				
				// Create the chess piece
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
			
			// Place pawns in the other column
			for (let i = 0; i < 8; i++) {
				const x = isLeftOriented ? homeZone.x + 1 : homeZone.x;
				const z = homeZone.z + i;
				const pieceType = 'PAWN';
				
				// Create the pawn
				const piece = {
					id: `${playerId}-${pieceType}-${Date.now()}-${pieces.length}`,
					type: pieceType,
					player: playerId,
					position: { x, z },
					color: playerColor,
					hasMoved: false,
					moveCount: 0,
					forwardDistance: 0,
					orientation: homeZone.orientation
				};
				
				pieces.push(piece);
				
				// Create chess cell object
				const chessPieceObj = {
					type: 'chess',
					pieceType: pieceType.toLowerCase(),
					player: playerId,
					color: playerColor,
					pieceId: piece.id,
					orientation: homeZone.orientation
				};
				
				// Create home zone marker
				const homeZoneObj = {
					type: 'home',
					player: playerId,
					color: playerColor,
					orientation: homeZone.orientation
				};
				
				// Add both objects to the cell
				this.boardManager.setCell(game.board, x, z, [homeZoneObj, chessPieceObj]);
			}
		}
		
		return pieces;
	}
	
	/**
	 * Validate and process chess piece purchase
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} purchaseData - Data about the purchase
	 * @returns {Object} Result of the purchase
	 */
	processPiecePurchase(game, playerId, purchaseData) {
		try {
			const { pieceType, x, z } = purchaseData;
			const player = game.players[playerId];
			
			// Check if the piece type is valid
			if (!PIECE_PRICES[pieceType]) {
				return {
					success: false,
					error: `Invalid piece type: ${pieceType}`
				};
			}
			
			// Check if the player has enough funds
			const price = PIECE_PRICES[pieceType];
			if (player.balance < price) {
				return {
					success: false,
					error: `Insufficient funds to purchase ${pieceType}. Required: ${price}, Available: ${player.balance}`
				};
			}
			
			// Check if the position is occupied using our sparse board structure
			if (this.boardManager.getCell(game.board, x, z) !== null) {
				return {
					success: false,
					error: `Position (${x}, ${z}) is already occupied`
				};
			}
			
			// Check if the position is in a safe home zone
			if (this.boardManager.isCellInSafeHomeZone(game, x, z)) {
				// Allow placing in any home zone that has at least one piece
				// Further validation may be needed
			} else {
				// For positions outside the home zone, check for adjacent cells
				const adjacentResult = this._hasAdjacentCell(game, x, z, playerId);
				if (!adjacentResult.hasAdjacent) {
					return {
						success: false,
						error: `Position (${x}, ${z}) is not adjacent to any of your cells`
					};
				}
				
				// Check if there's a path to the king
				if (!this.islandManager.hasPathToKing(game, adjacentResult.x, adjacentResult.z, playerId)) {
					return {
						success: false,
						error: `No valid path to your king from position (${x}, ${z})`
					};
				}
			}
			
			// Deduct the price from the player's balance
			player.balance -= price;
			
			// Create the chess piece
			const piece = {
				id: `${playerId}-${pieceType}-${Date.now()}`,
				type: pieceType,
				player: playerId,
				position: { x, z },
				color: player.color,
				hasMoved: false
			};
			
			// Add the piece to the game
			game.chessPieces.push(piece);
			
			// Mark the cell as occupied using our sparse board structure
			this.boardManager.setCell(game.board, x, z, {
				type: 'chess',
				player: playerId,
				chessPiece: piece,
				color: player.color
			});
			
			log(`Player ${playerId} purchased ${pieceType} at (${x}, ${z})`);
			
			return {
				success: true,
				piece,
				newBalance: player.balance
			};
		} catch (error) {
			log(`Error processing piece purchase: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Check if a cell has an adjacent cell that belongs to the player
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Result of the check
	 * @private
	 */
	_hasAdjacentCell(game, x, z, playerId) {
		// Orthogonal only — must match island/tetromino adjacency rules
		const directions = [
			{ x: 0, z: -1 },  // North
			{ x: 1, z: 0 },   // East
			{ x: 0, z: 1 },   // South
			{ x: -1, z: 0 },  // West
		];
		
		for (const dir of directions) {
			const pos = {
				x: x + dir.x,
				z: z + dir.z
			};
			
			// Check if there's a cell at this position using the sparse board structure
			const cell = this.boardManager.getCell(game.board, pos.x, pos.z);
			if (cell && Array.isArray(cell) && cell.some(item => item && item.player === playerId)) {
				return {
					hasAdjacent: true,
					x: pos.x,
					z: pos.z
				};
			}
		}
		
		return { hasAdjacent: false };
	}
	
	/**
	 * Build an "obstructor view" of the board — a single function that
	 * returns the canonical occupant of any cell, agreeing with the
	 * client move generator about what blocks a slide.
	 *
	 * The previous validators walked cell markers and chessPieces
	 * separately, so a phantom piece in chessPieces (no matching
	 * marker) or a stale marker (no live piece) would make the two
	 * sides disagree and surface as "Invalid chess move" toasts. This
	 * helper is the single source of truth.
	 *
	 * Priority:
	 *   1. `game.chessPieces` — every live piece's position is occupied.
	 *   2. Legacy cell markers that have NO `pieceId` (older migration
	 *      data the user can't easily clear). Markers with a pieceId
	 *      that no longer corresponds to a live piece are treated as
	 *      ghosts and ignored.
	 *
	 * Returns a `pieceAt(x, z)` function returning either `null` or
	 * `{ player, pieceType, pieceId, piece }` (piece is the live
	 * `chessPieces` entry, or `null` for legacy-marker blockers).
	 *
	 * @param {Object} game
	 * @returns {(x: number, z: number) => Object|null}
	 * @private
	 */
	_buildPieceLocator(game) {
		const pieceIndex = new Map();
		const activePieces = Array.isArray(game.chessPieces) ? game.chessPieces : [];
		for (const p of activePieces) {
			if (!p || !p.position) continue;
			const x = Number(p.position.x);
			const z = Number(p.position.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
			pieceIndex.set(`${x},${z}`, p);
		}
		return (x, z) => {
			const live = pieceIndex.get(`${x},${z}`);
			if (live) {
				return {
					player: live.player,
					pieceType: String(live.type || '').toLowerCase(),
					pieceId: live.id,
					piece: live,
				};
			}
			const cell = this.boardManager.getCell(game.board, x, z);
			if (!Array.isArray(cell)) return null;
			for (const item of cell) {
				if (!item || item.type !== 'chess') continue;
				if (item.pieceId == null) {
					return {
						player: item.player,
						pieceType: item.pieceType,
						pieceId: null,
						piece: null,
					};
				}
			}
			return null;
		};
	}

	/**
	 * Validate a chess piece move
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the validation
	 */
	validateChessMove(game, playerId, moveData) {
		return moveValidation.validateChessMove(this._validationCtx(), game, playerId, moveData);
	}

	/**
	 * Shared "context" object passed to the extracted move-validation
	 * helpers. Bundles the board lookup + piece-locator builder so
	 * those functions don't need to import `World`.
	 * @private
	 */
	_validationCtx() {
		if (!this._cachedValidationCtx) {
			this._cachedValidationCtx = {
				boardManager: this.boardManager,
				buildPieceLocator: (game) => this._buildPieceLocator(game),
			};
		}
		return this._cachedValidationCtx;
	}
	
	// Validation helpers — implementations live in
	// `./chess/moveValidation.js`. These thin delegates are kept so
	// any existing internal caller / test stub that goes through
	// `this._validate*` still works.
	_validateMoveByPieceType(game, piece, toX, toZ, pieceAt) {
		return moveValidation.validateMoveByPieceType(this._validationCtx(), game, piece, toX, toZ, pieceAt);
	}

	_validateCastle(game, king, toX, toZ, pieceAt) {
		return moveValidation.validateCastle(this._validationCtx(), game, king, toX, toZ, pieceAt);
	}

	_checkPathObstruction(game, piece, toX, toZ, pieceAt) {
		return moveValidation.checkPathObstruction(piece, toX, toZ, pieceAt || this._buildPieceLocator(game));
	}
	
	/**
	 * Execute a validated chess move
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of executing the move
	 */
	executeChessMove(game, playerId, moveData) {
		try {
			// Validate the move first
			const validation = this.validateChessMove(game, playerId, moveData);
			if (!validation.valid) {
				return {
					success: false,
					error: validation.error
				};
			}
			
			const { piece, fromX, fromZ, toX, toZ, targetCell } = validation;
			
			// Check for capture
			let capture = false;
			let capturedPiece = null;
			
			// Find an enemy chess piece at the target position
			for (let i = game.chessPieces.length - 1; i >= 0; i--) {
				const p = game.chessPieces[i];
				if (!p || !p.position) continue;
				if (p.position.x === toX && p.position.z === toZ && p.player !== playerId) {
					capture = true;
					capturedPiece = p;

					log(`${piece.type} captures ${p.type} at (${toX}, ${toZ})`);
					pieceLifecycle.removePiece(game, p, {
						reason: pieceLifecycle.REMOVAL_REASONS.CAPTURED,
						activityLog: this.activityLog,
						capturedBy: {
							playerId,
							pieceId: piece.id,
							pieceType: String(piece.type || '').toLowerCase(),
						},
					});

					if (p.type === 'KING') {
						this._handleKingCapture(game, p.player, playerId);
					}
					break;
				}
			}
			
			// Remove only the chess-piece entry from the source cell — preserve
			// tetromino / home-zone content so the board surface stays intact.
			const fromKey = `${fromX},${fromZ}`;
			const fromCell = game.board.cells[fromKey];
			if (Array.isArray(fromCell)) {
				const remaining = fromCell.filter(
					item => !(item && item.type === 'chess' && String(item.player) === String(playerId))
				);
				if (remaining.length > 0) {
					game.board.cells[fromKey] = remaining;
				} else {
					delete game.board.cells[fromKey];
				}
			} else {
				delete game.board.cells[fromKey];
			}
			
			// Update the piece position
			piece.position.x = toX;
			piece.position.z = toZ;
			piece.hasMoved = true;
			piece.moveCount = (piece.moveCount || 0) + 1;

			// Track net forward distance for pawn promotion
			if (piece.type === 'PAWN') {
				this._updatePawnForwardDistance(piece, fromX, fromZ, toX, toZ);
			}
			
			// If capturing, also strip the captured piece's cell entry at the destination
			if (capture) {
				const destCell = game.board.cells[`${toX},${toZ}`];
				if (Array.isArray(destCell)) {
					game.board.cells[`${toX},${toZ}`] = destCell.filter(
						item => !(item && item.type === 'chess' && String(item.player) !== String(playerId))
					);
				}
			}
			
			// ── Cell ownership transfer ──────────────────────────────────────
			// Landing on an enemy cell claims its non-home content for the
			// mover. Home markers are intrinsic to the original owner and
			// are never transferred.
			this._transferCellOwnership(game, toX, toZ, playerId);

			// Append the chess-piece marker to the destination cell without
			// destroying existing tetromino / home content.
			this.boardManager.addToCellContents(game.board, toX, toZ, {
				type: 'chess',
				player: playerId,
				chessPiece: piece,
				pieceType: piece.type,
				color: game.players[playerId]?.color
			});
			
			// Handle castling: move the rook as well
			if (validation.castling && validation.castling.rookId) {
				const c = validation.castling;
				const rook = game.chessPieces.find(p => p && p.id === c.rookId);
				if (rook) {
					// Remove rook from old cell
					const rookKey = `${c.rookFromX},${c.rookFromZ}`;
					const rookCell = game.board.cells[rookKey];
					if (Array.isArray(rookCell)) {
						const remaining = rookCell.filter(
							item => !(item && item.type === 'chess' && item.pieceId === c.rookId)
						);
						if (remaining.length > 0) {
							game.board.cells[rookKey] = remaining;
						} else {
							delete game.board.cells[rookKey];
						}
					}

					rook.position.x = c.rookToX;
					rook.position.z = c.rookToZ;
					rook.hasMoved = true;

					this.boardManager.addToCellContents(game.board, c.rookToX, c.rookToZ, {
						type: 'chess',
						player: playerId,
						pieceId: rook.id,
						pieceType: 'rook',
						color: game.players[playerId]?.color
					});
					log(`Castling: rook ${c.rookId} moved to (${c.rookToX}, ${c.rookToZ})`);
				}
			}

			// Check for pawn promotion (returns pending info if eligible)
			const promotionPending = this._checkPawnPromotion(game, piece);
			
			// Update island connectivity after the move
			this.islandManager.checkForIslandsAfterRowClear(game);
			
			return {
				success: true,
				piece,
				capture,
				capturedPiece,
				promotionPending
			};
		} catch (error) {
			log(`Error executing chess move: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Transfer cell content ownership when a chess piece lands on an enemy cell.
	 * Home markers are never transferred (they belong to the zone owner).
	 * After transfer, island detection runs for each affected former owner.
	 *
	 * @param {Object} game - The game object
	 * @param {number} x - Target cell X
	 * @param {number} z - Target cell Z
	 * @param {string} newOwner - The player claiming the cell
	 * @private
	 */
	_transferCellOwnership(game, x, z, newOwner) {
		const key = `${x},${z}`;
		const cell = game.board.cells[key];
		if (!Array.isArray(cell)) return;

		const affectedOwners = new Set();
		for (const item of cell) {
			if (!item || !item.player) continue;
			if (String(item.player) === String(newOwner)) continue;
			if (item.type === cells.HOME_TYPE) continue;
			affectedOwners.add(String(item.player));
		}

		const playerColor = game.players[newOwner]?.color;
		cells.transferOwnership(cell, newOwner, playerColor);

		for (const prevOwner of affectedOwners) {
			log(`Cell (${x},${z}) ownership transferred from ${prevOwner} to ${newOwner}`);
		}
	}

	/**
	 * Handle king capture — per the bible:
	 * 1. Non-pawn pieces transfer to the captor.
	 * 2. Pawns become "suicidal" (3 s delay, then one per 0.5 s, destroying cells).
	 * 3. Island decay runs after all suicidal pawns detonate.
	 * 4. Defeated player is eliminated; their territory transfers.
	 * 5. Captured king goes to prison.
	 *
	 * @param {Object} game - The game object
	 * @param {string} defeatedId - The player who lost their king
	 * @param {string} captorId - The player who captured the king
	 * @private
	 */
	_handleKingCapture(game, defeatedId, captorId) {
		log(`Player ${defeatedId} lost their king to ${captorId}!`);

		const defeated = game.players[defeatedId];
		const captor = game.players[captorId];
		if (!defeated || !captor) return;

		// ── 1. Transfer non-pawn pieces to the captor ───────────────────────
		const suicidalPawns = [];
		for (const piece of game.chessPieces) {
			if (!piece || piece.player !== defeatedId) continue;
			if (piece.type === 'KING') continue;

			if (piece.type === 'PAWN') {
				suicidalPawns.push(piece);
			} else {
				piece.player = captorId;
				piece.color = captor.color;

				// Update cell entry ownership
				const key = `${piece.position.x},${piece.position.z}`;
				const cell = game.board.cells[key];
				if (Array.isArray(cell)) {
					const entry = cell.find(
						it => it && it.type === 'chess' && String(it.player) === String(defeatedId)
					);
					if (entry) {
						entry.player = captorId;
						entry.color = captor.color;
					}
				}
				log(`Transferred ${piece.type} at (${piece.position.x}, ${piece.position.z}) to ${captorId}`);
			}
		}

		// ── 2. Suicidal pawns — schedule detonation ─────────────────────────
		const detonateAt = Date.now() + GAME_RULES.SUICIDAL_PAWN_DELAY_MS;
		for (let i = 0; i < suicidalPawns.length; i++) {
			suicidalPawns[i]._suicidalDetonateAt =
				detonateAt + i * GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS;
			suicidalPawns[i]._suicidal = true;
		}

		if (suicidalPawns.length > 0) {
			const totalTime =
				GAME_RULES.SUICIDAL_PAWN_DELAY_MS +
				suicidalPawns.length * GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS;

			log(`${suicidalPawns.length} suicidal pawns will detonate over ${totalTime} ms`);

			this._scheduleSuicidalPawns(game, suicidalPawns, captorId, defeatedId);
		} else {
			this._finaliseKingCapture(game, defeatedId, captorId);
		}
	}

	/**
	 * Tick through suicidal pawns one at a time, destroying cells.
	 * @private
	 */
	_scheduleSuicidalPawns(game, pawns, captorId, defeatedId) {
		let idx = 0;

		const detonateNext = () => {
			if (idx >= pawns.length) {
				this.islandManager.checkForIslandsAfterRowClear(game);
				this._finaliseKingCapture(game, defeatedId, captorId);
				return;
			}

			const pawn = pawns[idx];
			idx++;

			if (!pawn || !pawn.position) {
				detonateNext();
				return;
			}

			const px = pawn.position.x;
			const pz = pawn.position.z;
			log(`Suicidal pawn detonates at (${px}, ${pz})`);

			pieceLifecycle.removePiece(game, pawn, {
				reason: pieceLifecycle.REMOVAL_REASONS.SUICIDAL_PAWN,
				activityLog: this.activityLog,
			});

			const key = `${px},${pz}`;
			delete game.board.cells[key];

			setTimeout(detonateNext, GAME_RULES.SUICIDAL_PAWN_INTERVAL_MS);
		};

		setTimeout(detonateNext, GAME_RULES.SUICIDAL_PAWN_DELAY_MS);
	}

	/**
	 * Finalise king capture after suicidal pawns have detonated.
	 * @private
	 */
	_finaliseKingCapture(game, defeatedId, captorId) {
		const defeated = game.players[defeatedId];
		const captor = game.players[captorId];

		// ── 3. Transfer remaining territory to captor ────────────────────────
		for (const key in game.board.cells) {
			const cell = game.board.cells[key];
			if (!Array.isArray(cell)) continue;
			for (const item of cell) {
				if (item && String(item.player) === String(defeatedId)) {
					item.player = captorId;
					item.color = captor ? captor.color : item.color;
				}
			}
		}

		if (!Array.isArray(game.kingPrison)) game.kingPrison = [];
		game.kingPrison.push({
			playerId: defeatedId,
			capturedBy: captorId,
			capturedAt: Date.now(),
		});

		// ── 5. Track captured styles ────────────────────────────────────────
		if (!captor.capturedStyles) captor.capturedStyles = [];
		captor.capturedStyles.push({
			playerId: defeatedId,
			color: defeated ? defeated.color : null,
		});

		// ── 6. Eliminate the defeated player ─────────────────────────────────
		if (defeated) {
			defeated.eliminated = true;
			defeated.eliminatedAt = Date.now();
		}

		// Check if only one player remains
		const remainingPlayers = Object.values(game.players)
			.filter(p => !p.eliminated && !p.isObserver);

		if (remainingPlayers.length === 1) {
			game.status = 'completed';
			game.winnerId = remainingPlayers[0].id;
			game.completedAt = Date.now();
			log(`Game over! Player ${game.winnerId} wins!`);
		}

		log(`King capture finalised: ${captorId} defeated ${defeatedId}`);
	}
	
	/**
	 * Update the pawn's net forward distance from its start position.
	 * @private
	 */
	_updatePawnForwardDistance(piece, fromX, fromZ, toX, toZ) {
		const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
		let forwardDelta = 0;
		switch (orientation) {
			case 0: forwardDelta = toZ - fromZ; break;
			case 1: forwardDelta = toX - fromX; break;
			case 2: forwardDelta = fromZ - toZ; break;
			case 3: forwardDelta = fromX - toX; break;
		}
		piece.forwardDistance = (piece.forwardDistance || 0) + forwardDelta;
	}

	/**
	 * Check for pawn promotion — triggers after 9 squares forward
	 * from starting position (net forward distance, not total moves).
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece (pawn)
	 * @private
	 */
	_checkPawnPromotion(game, piece) {
		if (piece.type !== 'PAWN') return null;

		const distance = piece.forwardDistance || 0;
		if (distance < GAME_RULES.PAWN_PROMOTION_DISTANCE) return null;

		return { pieceId: piece.id, playerId: piece.player };
	}

	promotePawn(game, pieceId, playerId, chosenType) {
		const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
		const promotionPiece = validTypes.includes(String(chosenType).toUpperCase())
			? String(chosenType).toUpperCase()
			: 'QUEEN';

		const piece = game.chessPieces.find(
			p => p.id === pieceId && p.player === playerId && p.type === 'PAWN'
		);
		if (!piece) return { success: false, error: 'Pawn not found' };

		piece.type = promotionPiece;

		const cellContents = this.boardManager.getCell(
			game.board, piece.position.x, piece.position.z
		);
		if (Array.isArray(cellContents)) {
			const chessItem = cellContents.find(
				item => item && item.type === 'chess' && item.player === playerId
			);
			if (chessItem) {
				chessItem.pieceType = promotionPiece.toLowerCase();
			}
		}

		log(`Pawn ${pieceId} promoted to ${promotionPiece} at (${piece.position.x}, ${piece.position.z})`);
		return { success: true, pieceType: promotionPiece, piece };
	}

	/**
	 * Voluntarily detonate one of the player's own pieces.
	 * - Pawn: always destroys the detonated coordinate entirely.
	 * - King: allowed only if it is the player's final remaining piece; this
	 *   triggers a full self-destruct of all that player's territory.
	 *
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player requesting detonation
	 * @param {string} pieceId - Piece to detonate
	 * @returns {Object} Result with success flag and payload
	 */
	detonatePawn(game, playerId, pieceId) {
		if (!game || !game.board || !game.board.cells || !Array.isArray(game.chessPieces)) {
			return { success: false, error: 'Invalid game state' };
		}
		
		const pieceIdx = game.chessPieces.findIndex(
			p => p && p.id === pieceId && p.player === playerId
		);
		if (pieceIdx === -1) {
			return { success: false, error: 'Piece not found or not yours' };
		}
		
		const piece = game.chessPieces[pieceIdx];
		const pieceType = String(piece.type || '').toUpperCase();
		const piecePos = piece.position || piece;
		if (!piecePos || !Number.isFinite(piecePos.x) || !Number.isFinite(piecePos.z)) {
			return { success: false, error: 'Invalid piece position' };
		}
		const px = piecePos.x;
		const pz = piecePos.z;
		
		if (pieceType === 'KING') {
			const ownPieces = game.chessPieces.filter(
				p => p && String(p.player) === String(playerId)
			);
			if (ownPieces.length > 1) {
				return { success: false, error: 'King can only be detonated when it is your last piece' };
			}
			
			const ownedCells = [];
			const ownedCellSet = new Set();
			for (const [key, contents] of Object.entries(game.board.cells)) {
				if (!Array.isArray(contents) || contents.length === 0) continue;
				const hasOwnedContent = contents.some(
					item => item && String(item.player) === String(playerId)
				);
				if (!hasOwnedContent) continue;
				const [x, z] = key.split(',').map(Number);
				const cell = { x, z };
				ownedCells.push(cell);
				ownedCellSet.add(`${x},${z}`);
			}
			
			// Compute orthogonal path length layers from the king through owned cells.
			const distanceMap = new Map();
			if (ownedCellSet.has(`${px},${pz}`)) {
				const queue = [{ x: px, z: pz, d: 0 }];
				distanceMap.set(`${px},${pz}`, 0);
				
				while (queue.length > 0) {
					const current = queue.shift();
					const adjacent = [
						{ x: current.x - 1, z: current.z },
						{ x: current.x + 1, z: current.z },
						{ x: current.x, z: current.z - 1 },
						{ x: current.x, z: current.z + 1 },
					];
					
					for (const next of adjacent) {
						const key = `${next.x},${next.z}`;
						if (!ownedCellSet.has(key)) continue;
						if (distanceMap.has(key)) continue;
						const nextDistance = current.d + 1;
						distanceMap.set(key, nextDistance);
						queue.push({ x: next.x, z: next.z, d: nextDistance });
					}
				}
			}
			
			let maxDistance = 0;
			for (const d of distanceMap.values()) {
				if (d > maxDistance) maxDistance = d;
			}
			
			const explosionSequence = ownedCells.map(cell => {
				const key = `${cell.x},${cell.z}`;
				if (distanceMap.has(key)) {
					return { ...cell, distance: distanceMap.get(key) };
				}
				
				// Fallback for stale/disconnected remnants: still explode first.
				const manhattan = Math.abs(cell.x - px) + Math.abs(cell.z - pz);
				return { ...cell, distance: maxDistance + 1 + manhattan };
			}).sort((a, b) => {
				if (a.distance !== b.distance) return b.distance - a.distance;
				if (a.x !== b.x) return a.x - b.x;
				return a.z - b.z;
			});
			
			for (const cell of explosionSequence) {
				const key = `${cell.x},${cell.z}`;
				const cellContents = game.board.cells[key];
				if (!Array.isArray(cellContents) || cellContents.length === 0) continue;
				
				const remaining = cellContents.filter(
					item => !(item && String(item.player) === String(playerId))
				);
				if (remaining.length > 0) {
					game.board.cells[key] = remaining;
				} else {
					delete game.board.cells[key];
				}
			}
			
			pieceLifecycle.removePiece(game, piece, {
				reason: pieceLifecycle.REMOVAL_REASONS.DETONATED,
				activityLog: this.activityLog,
				note: 'final_king_self_destruct',
			});
			this.boardManager.recalculateBoardBoundaries(game.board);
			this.islandManager.checkForIslandsAfterRowClear(game);

			log(`Player ${playerId} detonated their final KING at (${px}, ${pz})`);
			return {
				success: true,
				detonatedAt: { x: px, z: pz },
				pieceType: 'KING',
				endedGame: true,
				layerIntervalMs: 500,
				explosionSequence,
			};
		}

		if (pieceType !== 'PAWN') {
			return { success: false, error: 'Only pawns can be detonated (except final king self-destruct)' };
		}

		// The pawn detonation socket handler in `server/sockets/chess.js`
		// emits its own `chess_piece_detonated` activity event with the
		// detonation reason; suppress this helper's automatic event so
		// the log doesn't carry a duplicate entry.
		pieceLifecycle.removePiece(game, piece, {
			reason: pieceLifecycle.REMOVAL_REASONS.DETONATED,
			silent: true,
		});
		delete game.board.cells[`${px},${pz}`];

		log(`Player ${playerId} detonated pawn at (${px}, ${pz})`);
		this.islandManager.checkForIslandsAfterRowClear(game);
		
		return {
			success: true,
			detonatedAt: { x: px, z: pz },
			pieceType: 'PAWN',
		};
	}
	
	/**
	 * Process a chess piece move from the client
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move
	 */
	processChessMove(game, playerId, moveData) {
		// Execute the move
		return this.executeChessMove(game, playerId, moveData);
	}
	
	/**
	 * Fast yes/no validity check used by the socket server and AI.
	 * Implementation lives in `./chess/moveValidation.js`.
	 */
	isValidChessMove(game, piece, toX, toZ) {
		return moveValidation.isValidChessMove(this._validationCtx(), game, piece, toX, toZ);
	}

	/**
	 * Does the player have any legal move? Falls through to the
	 * tetromino phase when false so the round doesn't deadlock.
	 * Implementation lives in `./chess/moveValidation.js`.
	 */
	hasValidChessMoves(game, playerId) {
		return moveValidation.hasValidChessMoves(this._validationCtx(), game, playerId);
	}
}

module.exports = ChessManager; 
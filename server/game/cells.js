/**
 * Cell-level helpers — the single place that knows what an "item" inside
 * `board.cells[key]` means.
 *
 * A cell is stored as an array of `item` objects on `board.cells`. Items
 * carry a `type` (one of `home`, `tetromino`, `chess`, `specialMarker`,
 * `boardCentre`), an owner `player` (except for `boardCentre` which is
 * the world centre marker and intentionally ownerless), and type-
 * specific extras. The schema is historical — splitting it out into
 * this module lets the rest of the codebase reason about cells without
 * having to know the array shape.
 *
 * Cardinal invariants enforced by callers (NOT by this module):
 *
 *   • A cell has **at most one home marker**.
 *   • A cell has **at most one chess marker**.
 *   • All non-home items in a cell share the same `player`. Captures
 *     and placements transfer ownership of any non-home items to the
 *     new owner, so the "single owner" rule holds outside the home
 *     overlay.
 *
 * Cells that violate the invariant are treated as **un-owned for
 * gravity / clear purposes** so the engine fails safe rather than
 * picking a random winner.
 */

const HOME_TYPE = 'home';
const CHESS_TYPE = 'chess';
const TETROMINO_TYPE = 'tetromino';
const SPECIAL_TYPE = 'specialMarker';
const CENTRE_TYPE = 'boardCentre';

function asArray(items) {
	return Array.isArray(items) ? items : [];
}

function findItem(items, predicate) {
	const arr = asArray(items);
	for (const item of arr) {
		if (item && predicate(item)) return item;
	}
	return null;
}

function findHome(items) {
	return findItem(items, item => item.type === HOME_TYPE);
}

function findChess(items) {
	return findItem(items, item => item.type === CHESS_TYPE);
}

function findCentre(items) {
	return findItem(items, item => item.type === CENTRE_TYPE);
}

function hasItemType(items, type) {
	return asArray(items).some(item => item && item.type === type);
}

function hasHome(items) {
	return hasItemType(items, HOME_TYPE);
}

/**
 * Does this cell hold a "degraded home" remnant — terrain that used to
 * be a home cell before idle degradation stripped its home marker?
 *
 * These cells are treated as gaps for line-clear purposes (so a player
 * returning from being away doesn't lose everything in one placement
 * when their old home-row totals 8 cells already), but still count as
 * the player's owned territory for gravity, capture, and island-decay.
 */
function hasDegradedHomeRemnant(items) {
	return asArray(items).some(item => item && item.fromHomeZone === true);
}

/**
 * Is every non-marker piece of content in this cell either
 *   • a home / centre / special marker, or
 *   • a degraded home remnant?
 *
 * Used by the line-clear scan to decide whether the cell should be
 * treated as empty space (breaking the consecutive run).
 */
function onlyDegradedOrMarkers(items) {
	const arr = asArray(items);
	if (arr.length === 0) return false;
	let hasAny = false;
	for (const item of arr) {
		if (!item) continue;
		hasAny = true;
		if (item.type === HOME_TYPE || item.type === SPECIAL_TYPE || item.type === CENTRE_TYPE) continue;
		if (item.fromHomeZone === true) continue;
		return false;
	}
	return hasAny;
}

function hasChess(items) {
	return hasItemType(items, CHESS_TYPE);
}

function hasTerrain(items) {
	return hasItemType(items, TETROMINO_TYPE);
}

function hasBoardCentre(items) {
	return hasItemType(items, CENTRE_TYPE);
}

/**
 * The cell's single non-home owner — the player who "controls" the
 * cell for gravity / decay purposes. Returns null if the cell is empty,
 * has only home / centre / special markers, or has conflicting owners
 * (multi-player non-home contents).
 */
function getOwner(items) {
	const arr = asArray(items);
	let owner = null;
	for (const item of arr) {
		if (!item || item.player == null) continue;
		if (item.type === HOME_TYPE) continue;
		const candidate = String(item.player);
		if (owner === null) {
			owner = candidate;
		} else if (owner !== candidate) {
			// Multi-owner cell — treat as un-owned, the engine refuses
			// to guess. See module header.
			return null;
		}
	}
	return owner;
}

/**
 * The owner of the home marker on this cell, or null if there isn't one.
 */
function getHomeOwner(items) {
	const home = findHome(items);
	return home && home.player != null ? String(home.player) : null;
}

function getChessPieceId(items) {
	const chess = findChess(items);
	if (!chess) return null;
	const id = chess.pieceId != null ? chess.pieceId
		: (chess.chessPiece && chess.chessPiece.id != null ? chess.chessPiece.id : null);
	return id != null ? String(id) : null;
}

function getChessOwner(items) {
	const chess = findChess(items);
	return chess && chess.player != null ? String(chess.player) : null;
}

/**
 * Will the **legacy** line-clear actually strip anything from this cell?
 * Used by `BoardManager.stripClearableFromCell` and other internal
 * helpers that haven't been migrated to the new chess-lift behaviour
 * yet. Home, chess and degraded-home-remnant cells are protected; centre
 * / special markers are also preserved. Anything else (regular tetromino
 * terrain) counts.
 *
 * Prefer `isLineClearTarget` for the new airborne-piece-aware behaviour.
 */
function isClearable(items) {
	if (hasHome(items)) return false;
	if (hasChess(items)) return false;
	return asArray(items).some(item => {
		if (!item) return false;
		if (item.fromHomeZone === true) return false;
		return item.type !== HOME_TYPE
			&& item.type !== SPECIAL_TYPE
			&& item.type !== CENTRE_TYPE;
	});
}

/**
 * Would the **new** line-clear modify this cell?  Per the bible's
 * updated §15.2, chess cells are *no longer* shielded — when a row
 * clears they lose their chess marker and the piece becomes airborne
 * (it grows wings, hovers, then attempts to land — see the bible for
 * the full rule).  Home / centre / special markers are still
 * preserved.  Anything else (tetromino terrain, chess markers, etc.)
 * makes this cell a clear target.
 *
 * Always returns false for cells carrying a home marker because the
 * home overlay still breaks runs and protects whatever sits on it.
 * Cells that only carry a degraded-home remnant (no live tetromino /
 * chess content) are also preserved so a returning idle player isn't
 * wiped out by their own decayed home zone the moment they place a
 * tetromino.
 */
function isLineClearTarget(items) {
	if (hasHome(items)) return false;
	if (onlyDegradedOrMarkers(items)) return false;
	return asArray(items).some(item => {
		if (!item) return false;
		return item.type !== HOME_TYPE
			&& item.type !== SPECIAL_TYPE
			&& item.type !== CENTRE_TYPE;
	});
}

/**
 * Strip terrain **and chess markers** for the new line-clear behaviour.
 * Returns `{ preserved, lifted }` where `preserved` is the cell's new
 * contents (home / centre / special / degraded-home remnants) and
 * `lifted` is the chess marker that was removed (or null).
 *
 * Degraded-home remnants survive the clear so the cell still renders
 * (the player's pre-idle footprint stays visible), matching the
 * `isLineClearTarget` treatment that already prevents the run from
 * counting them.
 */
function stripForLineClear(items) {
	const preserved = [];
	let lifted = null;
	for (const item of asArray(items)) {
		if (!item) continue;
		if (item.type === HOME_TYPE || item.type === SPECIAL_TYPE || item.type === CENTRE_TYPE) {
			preserved.push(item);
			continue;
		}
		if (item.fromHomeZone === true) {
			preserved.push(item);
			continue;
		}
		if (item.type === CHESS_TYPE && !lifted) {
			lifted = item;
		}
	}
	return { preserved, lifted };
}

/**
 * Should this cell participate in clearing-driven gravity? Per the
 * bible's rewritten §8, gravity applies to cells with a **single
 * owner** (path back to that player's king and no other king) plus
 * cells with a chess piece on them (always treated as part of the
 * piece-owner's territory). Cells with conflicting non-home owners
 * stay put — the engine refuses to guess which way to drift them.
 *
 * Bare home cells (no non-home content) stay put because the home
 * marker itself isn't movable — moving it would scramble the player's
 * spawn footprint.
 *
 * @returns {{ movable: boolean, owner: string|null }}
 */
function gravityAnchor(items) {
	const chessOwner = getChessOwner(items);
	if (chessOwner) {
		return { movable: true, owner: chessOwner };
	}
	const owner = getOwner(items);
	if (!owner) {
		return { movable: false, owner: null };
	}
	// Bare home cells (only [home] and nothing else) have `owner === null`
	// because we explicitly skip home items in `getOwner`. So if we
	// reach here, there's at least one non-home item belonging to
	// `owner` — gravity applies.
	return { movable: true, owner };
}

/**
 * Transfer ownership of every non-home item in this cell to `newOwner`.
 * Mutates the items in place (each item is a plain object that's part
 * of the cell array). Home markers are left untouched.
 *
 * @param {Array} items
 * @param {string} newOwner
 * @param {number} [newColor] Optional new color to stamp on transferred items.
 */
function transferOwnership(items, newOwner, newColor) {
	const arr = asArray(items);
	for (const item of arr) {
		if (!item) continue;
		if (item.type === HOME_TYPE) continue;
		if (item.type === CENTRE_TYPE) continue;
		if (String(item.player) === String(newOwner)) continue;
		item.player = newOwner;
		if (newColor !== undefined) item.color = newColor;
	}
}

/**
 * Strip everything that the row-clear would remove, returning the
 * cell's leftover contents as a new array. Home / chess / centre /
 * special markers and degraded-home remnants are preserved (the latter
 * mirror the bible's "decayed home zones don't trigger clears" rule
 * from §15.2).
 */
function stripClearable(items) {
	return asArray(items).filter(item => {
		if (!item) return false;
		if (item.fromHomeZone === true) return true;
		return item.type === HOME_TYPE
			|| item.type === CHESS_TYPE
			|| item.type === CENTRE_TYPE
			|| item.type === SPECIAL_TYPE;
	});
}

module.exports = {
	HOME_TYPE,
	CHESS_TYPE,
	TETROMINO_TYPE,
	SPECIAL_TYPE,
	CENTRE_TYPE,

	hasHome,
	hasChess,
	hasTerrain,
	hasBoardCentre,
	hasDegradedHomeRemnant,
	onlyDegradedOrMarkers,
	isClearable,
	isLineClearTarget,

	getOwner,
	getHomeOwner,
	getChessOwner,
	getChessPieceId,

	gravityAnchor,
	transferOwnership,
	stripClearable,
	stripForLineClear,
};

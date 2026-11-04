/**
 * Piece and player deltas in `game_update`.
 *
 * Clients that connect with `query.proto = '2'` get only the pieces and
 * player summaries that changed (`pieceChanges` / `playerChanges`) and
 * the ids that went (`removedPieceIds` / `removedPlayerIds`), instead of
 * every piece and player on every update. These rebuild the full lists
 * so the rest of the client still sees `state.chessPieces` and
 * `state.players`. Nothing changed: the field is left out, and the
 * client keeps what it has.
 */

/** Protocol version sent in the socket handshake. */
export const CLIENT_PROTO = '2';

/**
 * @param {Array} current - the client's current chessPieces
 * @param {Array} [pieceChanges] - new or changed pieces (upserts)
 * @param {Array} [removedPieceIds]
 * @returns {Array} a new chessPieces array
 */
export function mergePieceDelta(current, pieceChanges, removedPieceIds) {
	const byId = new Map();
	for (const piece of Array.isArray(current) ? current : []) {
		if (piece && piece.id != null) byId.set(String(piece.id), piece);
	}
	for (const id of Array.isArray(removedPieceIds) ? removedPieceIds : []) byId.delete(String(id));
	for (const piece of Array.isArray(pieceChanges) ? pieceChanges : []) {
		if (piece && piece.id != null) byId.set(String(piece.id), piece);
	}
	return [...byId.values()];
}

/**
 * If `state` is a piece delta, replace it in place with a full
 * `chessPieces` list built on `currentPieces`.
 */
export function expandPieceDelta(state, currentPieces) {
	if (!state || (!Array.isArray(state.pieceChanges) && !Array.isArray(state.removedPieceIds))) return state;
	const changed = (state.pieceChanges?.length || 0) + (state.removedPieceIds?.length || 0);
	// Nothing moved: leave chessPieces out so the pieces aren't re-rendered.
	if (changed > 0) state.chessPieces = mergePieceDelta(currentPieces, state.pieceChanges, state.removedPieceIds);
	delete state.pieceChanges;
	delete state.removedPieceIds;
	return state;
}

/**
 * Same for player summaries. `currentPlayers` may be the client's
 * id -> player map or an array; `state.players` comes back as an array,
 * which is what a full update carries.
 */
export function expandPlayerDelta(state, currentPlayers) {
	if (!state || (!Array.isArray(state.playerChanges) && !Array.isArray(state.removedPlayerIds))) return state;
	const changed = (state.playerChanges?.length || 0) + (state.removedPlayerIds?.length || 0);
	if (changed > 0) {
		const current = Array.isArray(currentPlayers)
			? currentPlayers
			: Object.entries(currentPlayers || {}).map(([id, p]) => ({ ...p, id: p?.id ?? id }));
		state.players = mergePieceDelta(current, state.playerChanges, state.removedPlayerIds);
	}
	delete state.playerChanges;
	delete state.removedPlayerIds;
	return state;
}

/**
 * `disconnectedSince` (per-cell island-decay timers) as a map delta:
 * `disconnectedChanges` { key: value } and `disconnectedRemoved` [key].
 * Unchanged: neither field arrives and the client keeps its map.
 */
export function expandDisconnectedDelta(state, currentMap) {
	if (!state || (!state.disconnectedChanges && !Array.isArray(state.disconnectedRemoved))) return state;
	const merged = { ...(currentMap || {}) };
	for (const key of state.disconnectedRemoved || []) delete merged[key];
	Object.assign(merged, state.disconnectedChanges || {});
	state.disconnectedSince = merged;
	delete state.disconnectedChanges;
	delete state.disconnectedRemoved;
	return state;
}

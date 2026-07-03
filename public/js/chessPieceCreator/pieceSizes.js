/**
 * Shared per-type piece SIZE map — the single source of truth for how
 * chess rank maps to on-board scale.
 *
 * Size is the oldest, most legible "tell them apart at a glance" cue
 * there is: pawns shrink, royalty grows. Both the detailed Russian set
 * (`buildRussianPiece`) and the cute set (`createCutePiece`) scale every
 * piece by this factor so the two render profiles agree on silhouette
 * hierarchy. Footprints stay well inside a cell (max radius ≈ 0.28 ×
 * 1.24 ≈ 0.35 < 0.5).
 *
 * Deliberately dependency-free (no THREE, no game context) so it can be
 * unit-tested directly and imported by either piece family without
 * coupling them to each other.
 */
export const PIECE_SIZE_BY_TYPE = Object.freeze({
	1: 0.82, // pawn   — clearly the smallest
	2: 0.96, // rook   — short and stout
	3: 1.02, // knight
	4: 1.08, // bishop — taller
	5: 1.16, // queen
	6: 1.24, // king   — towers over the rest
});

/**
 * Look up the scale for a numeric piece type (1-6), defaulting to the
 * pawn's size for anything unrecognised.
 *
 * @param {number} pieceTypeNum
 * @returns {number}
 */
export function pieceSizeFor(pieceTypeNum) {
	return PIECE_SIZE_BY_TYPE[pieceTypeNum] || PIECE_SIZE_BY_TYPE[1];
}

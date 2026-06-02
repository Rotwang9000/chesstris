/**
 * Static-pieces render optimisation — freeze settled chess pieces.
 *
 * A graphics stress test pinned `scene.updateMatrixWorld` (the per-frame
 * scene-graph walk that rebuilds every node's matrix) as a dominant CPU
 * cost over a crowded board. Chess pieces are static the vast majority of
 * the time — they only move on a chess move or a row-clear — yet every
 * piece recomputed its local matrix every frame (`matrixAutoUpdate` on).
 *
 * Setting `matrixAutoUpdate = false` (after one `updateMatrix()` to bake
 * the current transform) stops that per-frame `compose()`. The scene root
 * still auto-updates, so the world-matrix multiply is forced regardless —
 * what we reclaim is the per-node local-matrix compose, applied to:
 *
 *   - the merged body mesh and the raycast hitbox, which NEVER move
 *     relative to their piece group → frozen for life at creation; and
 *   - the outer piece group, frozen only while the piece is SETTLED and
 *     flipped back to dynamic by the animation owners while it animates.
 *
 * FROZEN-PIECE FAILURE MODE: any code that writes a frozen object's
 * position/rotation/scale must either set it dynamic first or call
 * `bakePieceMatrixIfStatic` afterwards, or the write will not render.
 * The reconciler (`updateChessPieces`), `wingAnimations`,
 * `chessInteraction` and `pieceHighlightManager` all honour this.
 *
 * Dependency-free by design (no `THREE` import) so it can't create import
 * cycles with the renderer modules that consume it.
 */

/**
 * Freeze or thaw an object's per-frame local-matrix recompute.
 *
 * @param {object} object3D a THREE.Object3D (piece group, body mesh, …)
 * @param {boolean} isStatic true to freeze (bake current transform, then
 *   stop recomputing it); false to resume per-frame recompute
 */
export function setPieceMatrixStatic(object3D, isStatic) {
	if (!object3D) return;
	if (isStatic) {
		// Bake the current pos/quat/scale into `matrix` once, then stop
		// three.js recomposing it every frame. `updateMatrix()` also
		// flags `matrixWorldNeedsUpdate`, so the renderer still places
		// the node correctly on the next frame.
		object3D.updateMatrix();
		object3D.matrixAutoUpdate = false;
	} else {
		object3D.matrixAutoUpdate = true;
	}
}

/**
 * Re-bake a frozen object's matrix after an external transform write so
 * the change actually renders. No-op for dynamic objects — the renderer
 * recomputes those for free next frame.
 *
 * @param {object} object3D a THREE.Object3D whose transform just changed
 */
export function bakePieceMatrixIfStatic(object3D) {
	if (!object3D) return;
	if (object3D.matrixAutoUpdate === false) {
		object3D.updateMatrix();
	}
}

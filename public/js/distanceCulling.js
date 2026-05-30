/**
 * Distance (view-distance) culling.
 *
 * Why this exists: the stress test (29 May 2026) showed THREE's built-in
 * frustum culling already keeps zoomed-in draw calls low, but a *zoomed-out*
 * view of a large shared world submits thousands of draw calls (8 000+ at 43
 * players) because every distant piece and cell is in-frustum. This pass hides
 * whole pieces and cells beyond a radius of the camera's focal point so the
 * amount drawn stays bounded as the world grows — the "limit the amount on
 * screen" the brief asked for.
 *
 * Design choices (deliberate):
 *  - Radius is tied to how far the camera is from its target (zoom), NOT to the
 *    measured FPS. FPS-gating would oscillate: culling lifts FPS past the
 *    governor's high-water mark, which switches culling off, which drops FPS
 *    again — pieces would visibly pop in and out. A zoom-relative radius is
 *    stable because the camera moves smoothly.
 *  - The radius is GENEROUS: at normal close play it is larger than the
 *    on-screen area (frustum culling does the real work there), so play looks
 *    identical. It only bites when you pull the camera right out, or once a
 *    world grows past the cap.
 *  - We only ever un-hide objects WE hid (tracked in a WeakSet), so we never
 *    fight other visibility logic (capture fades, decaying cells, ghosts).
 *  - WeakSet (not a strong Set) so removed/disposed meshes are still GC-able.
 *
 * Toggle: set `gameState.distanceCullDisabled = true` to switch it off; any
 * objects we'd hidden are restored on the next pass.
 */

import { getCamera, getControls, getScene } from './gameContext.js';

// Radius = clamp(cameraDistanceToTarget * ZOOM_FACTOR, MIN_R, MAX_R), in world
// units (1 unit ≈ 1 board cell).
//
// Tuning rationale (measured 29 May 2026): the DEFAULT/reset camera frames the
// whole world, and the on-screen spread scales with camera distance — measured
// ratio (farthest piece distance ÷ camDist) ≈ 1.78 at the default zoom. To
// NEVER clip something the player can legitimately see at the overview, R must
// stay above that spread at every framing, so ZOOM_FACTOR (2.3) is set
// comfortably above 1.78. Consequence (intended): at any overview framing —
// today's board or a much larger future one — nothing is culled (frustum
// culling does the real work, and you asked to see the whole board). Culling
// only bites when you ZOOM IN on a world bigger than your view: distant pieces
// beyond R then drop out, bounding the draw load while you focus locally.
// MAX_R is a high sanity ceiling, deliberately NOT an everyday limiter — a low
// cap would clip a large world's overview and cause popping.
const MIN_R = 55;
const MAX_R = 600;
const ZOOM_FACTOR = 2.3;

// Objects this module has hidden. WeakSet ⇒ no GC retention.
const _culled = new WeakSet();
// True while at least one object is currently hidden by us — lets the "off"
// path early-out once everything has been restored.
let _anyCulled = false;

function distanceSq(obj, tx, tz) {
	// matrixWorld is refreshed by the renderer each frame; reading its
	// translation is cheaper and more correct (handles parent transforms)
	// than the object's local position.
	const e = obj.matrixWorld && obj.matrixWorld.elements;
	const ox = e ? e[12] : (obj.position ? obj.position.x : 0);
	const oz = e ? e[14] : (obj.position ? obj.position.z : 0);
	const dx = ox - tx;
	const dz = oz - tz;
	return dx * dx + dz * dz;
}

/**
 * Run one culling pass. Cheap (a few thousand squared-distance checks);
 * the caller throttles how often this is invoked.
 *
 * @param {Object} gameState live game state (for boardGroup + the toggle)
 */
export function applyDistanceCulling(gameState) {
	const scene = getScene();
	const camera = getCamera();
	if (!scene || !camera) return;

	const disabled = !!(gameState && gameState.distanceCullDisabled);

	// Nothing hidden and culling is off (or no work to do): early-out.
	if (disabled && !_anyCulled) return;

	const controls = getControls();
	const target = (controls && controls.target)
		? controls.target
		: (gameState && gameState.boardCenter) || { x: 0, y: 0, z: 0 };
	const tx = target.x || 0;
	const tz = target.z || 0;

	let radiusSq = Infinity;
	if (!disabled) {
		const cd = Math.hypot(
			camera.position.x - tx,
			camera.position.y - (target.y || 0),
			camera.position.z - tz,
		);
		const r = Math.min(MAX_R, Math.max(MIN_R, cd * ZOOM_FACTOR));
		radiusSq = r * r;
	}

	let anyCulled = false;

	const pass = (group) => {
		if (!group || !group.children) return;
		const kids = group.children;
		for (let i = 0; i < kids.length; i++) {
			const obj = kids[i];
			if (!obj) continue;

			if (disabled) {
				// Restore only what we hid; leave everything else alone.
				if (_culled.has(obj)) { obj.visible = true; _culled.delete(obj); }
				continue;
			}

			if (distanceSq(obj, tx, tz) > radiusSq) {
				if (obj.visible) { obj.visible = false; _culled.add(obj); }
				anyCulled = true;
			} else if (_culled.has(obj)) {
				obj.visible = true;
				_culled.delete(obj);
			}
		}
	};

	pass(scene.getObjectByName('chessPieces'));
	pass(gameState && gameState.boardGroup);

	_anyCulled = disabled ? false : anyCulled;
}

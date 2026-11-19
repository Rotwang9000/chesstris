/**
 * Camera near plane that follows the zoom.
 *
 * The near plane sits at 1 for depth precision: 16-bit mobile depth
 * buffers z-fight the sea against the foam discs under every cell when
 * it is lower. That is fine at normal viewing distances, but once the
 * player zooms right in (orbit distance below ~8) a piece between the
 * camera and the target can come within 1 unit and get sliced open.
 *
 * So the near plane scales with the orbit distance: 1 from 8 units out,
 * down to a floor of 0.3 at the closest zoom. Up close, everything far
 * enough away to z-fight is already in the fog.
 */

/** Closest the orbit camera may get to its target. */
export const MIN_ORBIT_DISTANCE = 3;

const NEAR_MAX = 1;
const NEAR_MIN = 0.3;
const NEAR_PER_UNIT = 1 / 8;

/** The near plane to use at this orbit distance. */
export function nearPlaneFor(distance) {
	if (!(distance > 0)) return NEAR_MAX;
	return Math.min(NEAR_MAX, Math.max(NEAR_MIN, distance * NEAR_PER_UNIT));
}

/**
 * Point the camera's near plane at the right value for its current
 * distance from the orbit target. Only touches the projection matrix
 * when the value actually changes.
 */
export function adaptNearPlane(camera, controls) {
	if (!camera?.position || !controls?.target || typeof camera.updateProjectionMatrix !== 'function') return;
	const near = nearPlaneFor(camera.position.distanceTo(controls.target));
	if (Math.abs(camera.near - near) < 0.01) return;
	camera.near = near;
	camera.updateProjectionMatrix();
}

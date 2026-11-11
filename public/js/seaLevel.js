/**
 * Height of the sea surface in the normal render profile.
 *
 * Cells are 0.94 cubes centred on y=0 (bottom face at -0.47). Each one
 * rides on a few cloud puffs that bulge out below it, so the sea sits a
 * good way further down: the islands float on cloud above the water.
 *
 * Boats keep their server height (`BOAT_SEA_Y` in server/world/boats.js,
 * relative to the old surface at -0.5); the client adds
 * `BOAT_SEA_OFFSET` so their hulls sit on this surface instead.
 */
export const SEA_SURFACE_Y = -1.5;
export const BOAT_SEA_OFFSET = SEA_SURFACE_Y - -0.5;

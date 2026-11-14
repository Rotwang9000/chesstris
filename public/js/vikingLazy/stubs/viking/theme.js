/**
 * Bundle stub of viking/theme.js (see vikingLazy/runtime.js). Called
 * every frame, so it is also the surest trigger for the Viking chunk:
 * the moment `vikingActive` holds, the chunk is fetched.
 */
import { vk, wantViking } from '../../runtime.js';

export function updateVikingTheme(scene, gameState, time) {
	const m = vk('theme');
	if (m) m.updateVikingTheme(scene, gameState, time);
	else wantViking(gameState);
}

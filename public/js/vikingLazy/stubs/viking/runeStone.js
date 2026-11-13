/** Bundle stub of viking/runeStone.js (see vikingLazy/runtime.js). */
import { vk } from '../../runtime.js';

export function dressRuneStone(THREE, visual) {
	const m = vk('runeStone');
	return m ? m.dressRuneStone(THREE, visual) : false;
}

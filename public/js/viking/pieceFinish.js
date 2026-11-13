/**
 * Viking chess pieces: carved bone, soapstone and wood, not glossy
 * plastic (Viking edition, normal render profile only).
 *
 * The standard pieces are polished: a low roughness and a touch of metal
 * that, under the fjord's low sun, turned white pieces into glare and
 * coloured ones into shiny toys against the weathered stone. In a Viking
 * game each piece wears matte copies of its materials:
 *
 *   whites    warmed to old bone / ivory;
 *   colours   a little deeper and duller, like stained wood or soapstone;
 *   trim      gilt and silver keep some metal but lose the mirror shine.
 *
 * The originals are kept on the mesh and put back if the piece is seen
 * outside a Viking game. Called by the piece reconciler for every piece;
 * a flag makes the repeat calls free.
 */

const SKIP = /highlight|indicator|hitbox|halo|vk-outline/i;

function finishOf(mat) {
	if (!mat || !mat.isMaterial || typeof mat.clone !== 'function') return mat;
	const m = mat.clone();
	const metal = Number.isFinite(m.metalness) ? m.metalness : 0;
	const isTrim = metal >= 0.4;
	if ('roughness' in m) m.roughness = Math.max(isTrim ? 0.5 : 0.7, m.roughness || 0);
	if ('metalness' in m) m.metalness = isTrim ? Math.min(0.45, metal) : 0;
	if ('shininess' in m) m.shininess = Math.min(m.shininess || 0, 8);
	if (m.specular && m.specular.setScalar) m.specular.setScalar(0.05);
	if ('clearcoat' in m) m.clearcoat = 0;
	if ('envMapIntensity' in m) m.envMapIntensity = Math.min(0.35, m.envMapIntensity == null ? 1 : m.envMapIntensity);
	if (m.color && !isTrim) {
		const c = m.color;
		const lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
		if (lum > 0.62) {
			// bone: warm, a little yellowed, never paper white
			c.setRGB(c.r * 0.9, c.g * 0.84, c.b * 0.7);
		} else {
			// soapstone / stained wood: deeper and less saturated
			const k = 0.22;
			c.setRGB((c.r + (lum - c.r) * k) * 0.9, (c.g + (lum - c.g) * k) * 0.88, (c.b + (lum - c.b) * k) * 0.84);
		}
	}
	m.userData = { ...(m.userData || {}), vikingFinish: true };
	return m;
}

/**
 * Dress a piece for the Viking game (`on`), or put its own finish back.
 * @param {THREE.Object3D} piece
 * @param {boolean} on
 */
export function vikingPieceFinish(piece, on) {
	if (!piece || !piece.traverse || !piece.userData) return;
	if (!!piece.userData.vkFinish === !!on) return;
	if (on) {
		piece.traverse((o) => {
			if (!o.isMesh || !o.material || SKIP.test(o.name || '')) return;
			if (o.userData && (o.userData.vkStdMat || o.userData.vkOutline)) return;
			// a passenger wears a matte stand-in already: dress what is under it
			const owner = o.userData && o.userData.vkOrigMat ? 'vkOrigMat' : null;
			const src = owner ? o.userData.vkOrigMat : o.material;
			const dressed = Array.isArray(src) ? src.map(finishOf) : finishOf(src);
			o.userData.vkStdMat = src;
			if (owner) o.userData.vkOrigMat = dressed; else o.material = dressed;
		});
		piece.userData.vkFinish = true;
	} else {
		piece.traverse((o) => {
			if (!o.userData || !o.userData.vkStdMat) return;
			const own = o.userData.vkStdMat;
			const cur = o.userData.vkOrigMat || o.material;
			const list = Array.isArray(cur) ? cur : [cur];
			for (const m of list) if (m && m.userData && m.userData.vikingFinish && m.dispose) m.dispose();
			if (o.userData.vkOrigMat) o.userData.vkOrigMat = own; else o.material = own;
			delete o.userData.vkStdMat;
		});
		piece.userData.vkFinish = false;
	}
}

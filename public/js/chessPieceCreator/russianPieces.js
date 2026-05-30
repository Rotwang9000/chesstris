/**
 * Russian-themed chess pieces.
 *
 * Each builder returns a `THREE.Group` for the given piece type, using a
 * shared material trio (primary / secondary / accent). Local-player
 * pieces get the full imperial detailing; opponents get a simpler
 * silhouette for clarity at distance.
 */

import { getTHREE } from '../gameContext.js';
import { createSafeMaterials } from './materials.js';

function resolveMaterials(materialKey, customMaterials) {
	return customMaterials || createSafeMaterials(materialKey);
}

export function createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 12;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.10, seg), materials.primary);
	base.position.y = 0.05;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 0.30, seg), materials.primary);
	body.position.y = 0.25;
	body.castShadow = true;
	body.receiveShadow = true;
	group.add(body);

	if (isLocalPlayer) {
		const collar = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 32), materials.accent);
		collar.rotation.x = Math.PI / 2;
		collar.position.y = 0.38;
		collar.castShadow = true;
		collar.receiveShadow = true;
		group.add(collar);

		const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), materials.secondary);
		head.scale.set(1, 0.85, 1);
		head.position.y = 0.48;
		head.castShadow = true;
		head.receiveShadow = true;
		group.add(head);

		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.accent);
		finial.scale.set(1, 1.6, 1);
		finial.position.y = 0.59;
		finial.castShadow = true;
		finial.receiveShadow = true;
		group.add(finial);

		const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 32), materials.accent);
		baseRing.rotation.x = Math.PI / 2;
		baseRing.position.y = 0.02;
		baseRing.castShadow = true;
		baseRing.receiveShadow = true;
		group.add(baseRing);
	} else {
		const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, seg, seg), materials.primary);
		head.position.y = 0.45;
		head.castShadow = true;
		head.receiveShadow = true;
		group.add(head);
	}

	return group;
}

export function createRussianRookPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 12;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.22, 0.40, seg), materials.primary);
	tower.position.y = 0.32;
	tower.castShadow = true;
	tower.receiveShadow = true;
	group.add(tower);

	if (isLocalPlayer) {
		const parapet = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.08, 16), materials.secondary);
		parapet.position.y = 0.56;
		parapet.castShadow = true;
		parapet.receiveShadow = true;
		group.add(parapet);

		const merlonCount = 8;
		for (let i = 0; i < merlonCount; i++) {
			const angle = (i / merlonCount) * Math.PI * 2;
			const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.055), materials.accent);
			merlon.position.set(Math.cos(angle) * 0.20, 0.66, Math.sin(angle) * 0.20);
			merlon.castShadow = true;
			merlon.receiveShadow = true;
			group.add(merlon);
		}

		const domePoints = [];
		for (let i = 0; i <= 14; i++) {
			const t = i / 14;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.10 * (1.2 - 0.6 * bulge), 0.14 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 24), materials.secondary);
		dome.position.y = 0.70;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.10, 8), materials.accent);
		spire.position.y = 0.88;
		spire.castShadow = true;
		spire.receiveShadow = true;
		group.add(spire);

		for (let side = -1; side <= 1; side += 2) {
			const slit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), materials.accent);
			slit.position.set(0, 0.34, side * 0.19);
			slit.castShadow = true;
			slit.receiveShadow = true;
			group.add(slit);
		}

		const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 32), materials.accent);
		band.rotation.x = Math.PI / 2;
		band.position.y = 0.14;
		band.castShadow = true;
		band.receiveShadow = true;
		group.add(band);
	} else {
		const crenelCount = 4;
		for (let i = 0; i < crenelCount; i++) {
			const angle = (i / crenelCount) * Math.PI * 2;
			const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.06), materials.accent);
			crenel.position.set(Math.cos(angle) * 0.17, 0.58, Math.sin(angle) * 0.17);
			crenel.castShadow = true;
			crenel.receiveShadow = true;
			group.add(crenel);
		}
	}

	return group;
}

export function createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 18 : 10;

	// ── Plinth (matches the other pieces for a consistent footprint) ──
	const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.29, 0.10, seg), materials.primary);
	plinth.position.y = 0.05;
	plinth.castShadow = true;
	plinth.receiveShadow = true;
	group.add(plinth);

	const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 8, 24), materials.accent);
	band.rotation.x = Math.PI / 2;
	band.position.y = 0.11;
	group.add(band);

	// ── Body / withers ──────────────────────────────────────────────
	// Broad tapered base supporting the head. Slightly tapered up to
	// give a "stout cavalry horse" look rather than a delicate column.
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.18, 0.24, seg), materials.primary);
	body.position.set(0, 0.22, 0);
	body.castShadow = true;
	body.receiveShadow = true;
	group.add(body);

	// Small chest disc to soften the body-to-head transition.
	const withers = new THREE.Mesh(new THREE.SphereGeometry(0.20, seg, 12), materials.primary);
	withers.scale.set(1.0, 0.55, 1.05);
	withers.position.set(0, 0.36, 0.02);
	withers.castShadow = true;
	withers.receiveShadow = true;
	group.add(withers);

	// ── Neck + head as proper 3D primitives ─────────────────────────
	// Previous attempts used a 2D extruded silhouette which read as
	// a thin slab and made the head look like a paper cut-out from
	// every non-side angle. Users called it "silly", "demented",
	// "not round". We now build the head as a stout 3D sphere with
	// a chubby muzzle ball, the neck as a cylinder, and the mane as
	// a slim curved slab tucked behind the head. Everything stays
	// pulled in close to the column — no racehorse lunge.

	// Short arched neck. A simple cylinder tilted slightly forward.
	const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.155, 0.22, seg), materials.primary);
	neck.position.set(0.04, 0.46, 0);
	neck.rotation.z = -0.28;            // tilt forward, gentle
	neck.castShadow = true;
	neck.receiveShadow = true;
	group.add(neck);

	// Main cranium — a fat sphere, slightly squashed top-to-bottom
	// so it looks like a pony skull, not an egg.
	const HEAD_CENTRE = { x: 0.16, y: 0.66, z: 0 };
	const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.16, seg, 12), materials.primary);
	cranium.scale.set(1.05, 0.95, 0.95); // a touch wider than tall
	cranium.position.set(HEAD_CENTRE.x, HEAD_CENTRE.y, HEAD_CENTRE.z);
	cranium.castShadow = true;
	cranium.receiveShadow = true;
	group.add(cranium);

	// Muzzle / nose — a smaller sphere fused to the front of the
	// cranium. Sits low (mid-face) and forward, but never beyond
	// x≈0.34 so the head never "pokes out".
	const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.105, seg, 12), materials.primary);
	muzzle.scale.set(1.0, 0.78, 0.85);
	muzzle.position.set(0.27, 0.58, 0);
	muzzle.castShadow = true;
	muzzle.receiveShadow = true;
	group.add(muzzle);

	// Nose tip in the secondary palette so the muzzle reads as a
	// separate feature from distance.
	const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, seg, 10), materials.secondary);
	noseTip.scale.set(0.95, 0.75, 0.85);
	noseTip.position.set(0.33, 0.555, 0);
	noseTip.castShadow = true;
	group.add(noseTip);

	// Cheek roundness — pair of small spheres on either side of the
	// head, blending into the cranium. Gives the side profile some
	// volume so the head reads round from every angle.
	for (let side = -1; side <= 1; side += 2) {
		const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, seg, 10), materials.primary);
		cheek.scale.set(0.9, 0.85, 1.05);
		cheek.position.set(0.20, 0.61, side * 0.10);
		cheek.castShadow = true;
		group.add(cheek);
	}

	// ── Eyes + nostrils (local only) ─────────────────────────────────
	if (isLocalPlayer) {
		for (let side = -1; side <= 1; side += 2) {
			const eye = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 10), materials.accent);
			eye.position.set(0.22, 0.70, side * 0.118);
			group.add(eye);

			const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), materials.accent);
			nostril.position.set(0.33, 0.555, side * 0.040);
			group.add(nostril);
		}
	}

	// ── Ears ────────────────────────────────────────────────────────
	// Small, pulled inwards, tilted forward — sit ON the cranium
	// rather than projecting like rabbit ears.
	for (let side = -1; side <= 1; side += 2) {
		const ear = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.09, 6), materials.primary);
		ear.position.set(0.13, 0.81, side * 0.088);
		ear.rotation.z = -0.15;
		ear.rotation.x = side * 0.18;
		ear.castShadow = true;
		group.add(ear);
	}

	// ── Mane ─────────────────────────────────────────────────────────
	// Curved thin slab tucked behind the cranium and along the
	// neck. Slim enough to not obscure the head profile but thick
	// enough to read as hair at distance.
	const maneShape = new THREE.Shape();
	maneShape.moveTo(0.08, 0.80);
	maneShape.quadraticCurveTo(-0.02, 0.74, -0.06, 0.62);
	maneShape.quadraticCurveTo(-0.10, 0.50, -0.08, 0.36);
	maneShape.quadraticCurveTo(-0.04, 0.32, 0.00, 0.34);
	maneShape.quadraticCurveTo(-0.02, 0.46, 0.04, 0.56);
	maneShape.quadraticCurveTo(0.08, 0.66, 0.12, 0.78);
	maneShape.closePath();

	const maneGeo = new THREE.ExtrudeGeometry(maneShape, {
		depth: 0.11,
		bevelEnabled: true,
		bevelSize: 0.02,
		bevelThickness: 0.02,
		bevelSegments: 2,
		curveSegments: isLocalPlayer ? 14 : 7,
	});
	maneGeo.translate(0, 0, -0.055);
	const mane = new THREE.Mesh(maneGeo, materials.accent);
	mane.castShadow = true;
	mane.receiveShadow = true;
	group.add(mane);

	// Forelock — small tuft between the ears.
	const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 6), materials.accent);
	forelock.position.set(0.17, 0.79, 0);
	forelock.rotation.z = -0.25;
	forelock.castShadow = true;
	group.add(forelock);

	return group;
}

export function createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 12;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.32, seg), materials.primary);
	column.position.y = 0.28;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	if (isLocalPlayer) {
		const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 32), materials.accent);
		collar.rotation.x = Math.PI / 2;
		collar.position.y = 0.43;
		collar.castShadow = true;
		collar.receiveShadow = true;
		group.add(collar);

		const domePoints = [];
		for (let i = 0; i <= 20; i++) {
			const t = i / 20;
			const sinT = Math.sin(t * Math.PI);
			const bulge = t < 0.3 ? 1.3 * sinT : 0.7 * sinT;
			domePoints.push(new THREE.Vector2(0.14 * (1.0 - 0.55 * bulge), 0.30 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 32), materials.secondary);
		dome.position.y = 0.44;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		const slit = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.04), materials.accent);
		slit.position.set(0, 0.60, 0.10);
		slit.rotation.z = Math.PI / 6;
		slit.castShadow = true;
		group.add(slit);

		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.20, 8), materials.accent);
		crossV.position.y = 0.84;
		crossV.castShadow = true;
		crossV.receiveShadow = true;
		group.add(crossV);

		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), materials.accent);
		crossH.position.y = 0.82;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		crossH.receiveShadow = true;
		group.add(crossH);

		const crossLow = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.10, 8), materials.accent);
		crossLow.position.y = 0.76;
		crossLow.rotation.z = Math.PI / 2 + 0.25;
		crossLow.castShadow = true;
		crossLow.receiveShadow = true;
		group.add(crossLow);

		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), materials.accent);
		orb.position.y = 0.74;
		orb.castShadow = true;
		group.add(orb);

		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 10), materials.accent);
		finial.position.y = 0.95;
		finial.castShadow = true;
		group.add(finial);
	} else {
		const domePoints = [];
		for (let i = 0; i <= 10; i++) {
			const t = i / 10;
			domePoints.push(new THREE.Vector2(0.14 * (1.1 - 0.5 * Math.sin(t * Math.PI)), 0.22 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 16), materials.secondary);
		dome.position.y = 0.44;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), materials.accent);
		crossV.position.y = 0.70;
		crossV.castShadow = true;
		group.add(crossV);
		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.10, 8), materials.accent);
		crossH.position.y = 0.67;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		group.add(crossH);
	}

	return group;
}

export function createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 12;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.36, seg), materials.primary);
	column.position.y = 0.30;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, seg === 16 ? 32 : 16), materials.secondary);
	ring.rotation.x = Math.PI / 2;
	ring.position.y = 0.47;
	ring.castShadow = true;
	ring.receiveShadow = true;
	group.add(ring);

	if (isLocalPlayer) {
		const kokoshnik = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.10, 16), materials.secondary);
		kokoshnik.position.y = 0.54;
		kokoshnik.castShadow = true;
		kokoshnik.receiveShadow = true;
		group.add(kokoshnik);

		const pointCount = 8;
		for (let i = 0; i < pointCount; i++) {
			const angle = (i / pointCount) * Math.PI * 2;
			const r = 0.17;
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.14, 8), materials.accent);
			point.position.set(Math.cos(angle) * r, 0.66, Math.sin(angle) * r);
			point.castShadow = true;
			group.add(point);

			const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), materials.accent);
			pearl.position.set(Math.cos(angle) * r, 0.74, Math.sin(angle) * r);
			group.add(pearl);
		}

		const domePoints = [];
		for (let i = 0; i <= 16; i++) {
			const t = i / 16;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.09 * (1.3 - 0.7 * bulge), 0.18 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 24), materials.secondary);
		dome.position.y = 0.62;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), materials.accent);
		orb.position.y = 0.82;
		orb.castShadow = true;
		group.add(orb);

		const miniCrossV = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), materials.accent);
		miniCrossV.position.y = 0.90;
		miniCrossV.castShadow = true;
		group.add(miniCrossV);
		const miniCrossH = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.05, 6), materials.accent);
		miniCrossH.position.y = 0.89;
		miniCrossH.rotation.z = Math.PI / 2;
		miniCrossH.castShadow = true;
		group.add(miniCrossH);

		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const stud = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), materials.accent);
			stud.position.set(Math.cos(angle) * 0.23, 0.06, Math.sin(angle) * 0.23);
			group.add(stud);
		}
	} else {
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.08, seg), materials.secondary);
		crownBase.position.y = 0.53;
		crownBase.castShadow = true;
		group.add(crownBase);

		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.10, 6), materials.accent);
			point.position.set(Math.cos(angle) * 0.13, 0.62, Math.sin(angle) * 0.13);
			point.castShadow = true;
			group.add(point);
		}

		const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), materials.secondary);
		dome.position.y = 0.62;
		dome.castShadow = true;
		group.add(dome);
	}

	return group;
}

export function createRussianKingPiece(materialKey, isLocalPlayer, customMaterials = null) {
	const THREE = getTHREE();
	const group = new THREE.Group();
	const materials = resolveMaterials(materialKey, customMaterials);
	const seg = isLocalPlayer ? 16 : 12;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const column = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.42, seg), materials.primary);
	column.position.y = 0.33;
	column.castShadow = true;
	column.receiveShadow = true;
	group.add(column);

	const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, seg === 16 ? 32 : 16), materials.secondary);
	neckRing.rotation.x = Math.PI / 2;
	neckRing.position.y = 0.53;
	neckRing.castShadow = true;
	neckRing.receiveShadow = true;
	group.add(neckRing);

	if (isLocalPlayer) {
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.10, 16), materials.secondary);
		crownBase.position.y = 0.59;
		crownBase.castShadow = true;
		crownBase.receiveShadow = true;
		group.add(crownBase);

		const tiers = [
			{ count: 8, y: 0.68, r: 0.20, h: 0.16 },
			{ count: 8, y: 0.74, r: 0.15, h: 0.12 },
		];
		for (const tier of tiers) {
			for (let i = 0; i < tier.count; i++) {
				const angle = (i / tier.count) * Math.PI * 2 + (tier.r < 0.18 ? Math.PI / tier.count : 0);
				const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, tier.h, 8), materials.accent);
				point.position.set(Math.cos(angle) * tier.r, tier.y, Math.sin(angle) * tier.r);
				point.castShadow = true;
				group.add(point);

				const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), materials.accent);
				pearl.position.set(Math.cos(angle) * tier.r, tier.y + tier.h / 2 + 0.01, Math.sin(angle) * tier.r);
				group.add(pearl);
			}
		}

		const domePoints = [];
		for (let i = 0; i <= 20; i++) {
			const t = i / 20;
			const bulge = Math.sin(t * Math.PI);
			domePoints.push(new THREE.Vector2(0.13 * (1.35 - 0.8 * bulge), 0.22 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 32), materials.secondary);
		dome.position.y = 0.66;
		dome.castShadow = true;
		dome.receiveShadow = true;
		group.add(dome);

		const orb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), materials.accent);
		orb.position.y = 0.90;
		orb.castShadow = true;
		group.add(orb);

		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), materials.accent);
		crossV.position.y = 1.04;
		crossV.castShadow = true;
		crossV.receiveShadow = true;
		group.add(crossV);

		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), materials.accent);
		crossH.position.y = 1.02;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		crossH.receiveShadow = true;
		group.add(crossH);

		const crossH2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.10, 8), materials.accent);
		crossH2.position.y = 0.96;
		crossH2.rotation.z = Math.PI / 2;
		crossH2.castShadow = true;
		group.add(crossH2);

		const finial = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), materials.accent);
		finial.position.y = 1.16;
		group.add(finial);

		const baseBand = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.018, 8, 32), materials.accent);
		baseBand.rotation.x = Math.PI / 2;
		baseBand.position.y = 0.04;
		baseBand.castShadow = true;
		group.add(baseBand);

		const midBand = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 8, 32), materials.accent);
		midBand.rotation.x = Math.PI / 2;
		midBand.position.y = 0.34;
		midBand.castShadow = true;
		group.add(midBand);
	} else {
		const crownBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.20, 0.10, seg), materials.secondary);
		crownBase.position.y = 0.59;
		crownBase.castShadow = true;
		group.add(crownBase);

		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const point = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 6), materials.accent);
			point.position.set(Math.cos(angle) * 0.18, 0.68, Math.sin(angle) * 0.18);
			point.castShadow = true;
			group.add(point);
		}

		const domePoints = [];
		for (let i = 0; i <= 12; i++) {
			const t = i / 12;
			domePoints.push(new THREE.Vector2(0.13 * (1.3 - 0.7 * Math.sin(t * Math.PI)), 0.16 * t));
		}
		const dome = new THREE.Mesh(new THREE.LatheGeometry(domePoints, 20), materials.secondary);
		dome.position.y = 0.63;
		dome.castShadow = true;
		group.add(dome);

		const crossV = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 8), materials.accent);
		crossV.position.y = 0.86;
		crossV.castShadow = true;
		group.add(crossV);
		const crossH = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), materials.accent);
		crossH.position.y = 0.83;
		crossH.rotation.z = Math.PI / 2;
		crossH.castShadow = true;
		group.add(crossH);
	}

	return group;
}

/**
 * Per-type uniform size, encoding chess rank as scale — the oldest,
 * most legible "tell them apart at a glance" cue there is, and the one
 * the cute set was missing (every piece shared the same ~0.5-unit
 * footprint, so a field of one player's pieces read as identical green
 * blobs). Pawns shrink, royalty grows; the base stays seated on the
 * cell because every builder grows upward from y=0. Footprints stay
 * well inside a cell (max radius ≈ 0.29 × 1.24 ≈ 0.36 < 0.5).
 */
const PIECE_SIZE_BY_TYPE = Object.freeze({
	1: 0.82, // pawn   — clearly the smallest
	2: 0.96, // rook   — short and stout
	3: 1.02, // knight
	4: 1.08, // bishop — taller
	5: 1.16, // queen
	6: 1.24, // king   — towers over the rest
});

/**
 * Map a numeric piece type to the matching Russian builder, then apply
 * the per-type size cue. Defaults to pawn for unknown types.
 */
export function buildRussianPiece(pieceTypeNum, materialKey, isLocalPlayer, customMaterials = null) {
	let piece;
	switch (pieceTypeNum) {
		case 6: piece = createRussianKingPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 5: piece = createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 4: piece = createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 3: piece = createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 2: piece = createRussianRookPiece(materialKey, isLocalPlayer, customMaterials); break;
		case 1:
		default: piece = createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials); break;
	}
	const size = PIECE_SIZE_BY_TYPE[pieceTypeNum] || PIECE_SIZE_BY_TYPE[1];
	piece.scale.setScalar(size);
	return piece;
}

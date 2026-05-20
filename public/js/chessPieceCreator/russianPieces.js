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
	const seg = isLocalPlayer ? 16 : 10;

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.26, 0.12, seg), materials.primary);
	base.position.y = 0.06;
	base.castShadow = true;
	base.receiveShadow = true;
	group.add(base);

	const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.18, seg), materials.primary);
	pedestal.position.y = 0.21;
	pedestal.castShadow = true;
	pedestal.receiveShadow = true;
	group.add(pedestal);

	const neckSteps = isLocalPlayer ? 7 : 4;
	for (let i = 0; i < neckSteps; i++) {
		const t = i / neckSteps;
		const botR = 0.13 - t * 0.04;
		const topR = 0.12 - t * 0.04;
		const h = 0.05;
		const section = new THREE.Mesh(
			new THREE.CylinderGeometry(topR, botR, h, seg > 10 ? 10 : seg),
			materials.primary,
		);
		const arch = Math.sin(t * Math.PI * 0.6) * 0.12;
		section.position.set(0, 0.33 + i * 0.05, arch);
		section.rotation.x = -(t * 0.5);
		section.castShadow = true;
		section.receiveShadow = true;
		group.add(section);
	}

	const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.10, seg, seg > 10 ? 10 : seg), materials.secondary);
	cranium.scale.set(0.85, 1.1, 1.5);
	cranium.position.set(0, 0.64, 0.14);
	cranium.rotation.x = -0.4;
	cranium.castShadow = true;
	cranium.receiveShadow = true;
	group.add(cranium);

	const muzzleGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.22, 8);
	const muzzle = new THREE.Mesh(muzzleGeo, materials.secondary);
	muzzle.position.set(0, 0.54, 0.26);
	muzzle.rotation.x = -Math.PI / 3;
	muzzle.castShadow = true;
	muzzle.receiveShadow = true;
	group.add(muzzle);

	for (let side = -1; side <= 1; side += 2) {
		const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), materials.accent);
		nostril.position.set(side * 0.03, 0.46, 0.35);
		group.add(nostril);
	}

	const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.14), materials.secondary);
	jaw.position.set(0, 0.50, 0.22);
	jaw.rotation.x = -Math.PI / 4;
	jaw.castShadow = true;
	group.add(jaw);

	if (isLocalPlayer) {
		for (let side = -1; side <= 1; side += 2) {
			const ear = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 6), materials.accent);
			ear.position.set(side * 0.055, 0.74, 0.09);
			ear.rotation.x = -0.2;
			ear.rotation.z = side * 0.2;
			ear.castShadow = true;
			group.add(ear);
		}

		for (let i = 0; i < 5; i++) {
			const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.025), materials.accent);
			const t = i / 5;
			ridge.position.set(0, 0.52 + i * 0.045, -0.03 - t * 0.04);
			ridge.rotation.x = 0.25;
			ridge.castShadow = true;
			group.add(ridge);
		}

		for (let side = -1; side <= 1; side += 2) {
			const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), materials.accent);
			eye.position.set(side * 0.07, 0.63, 0.22);
			group.add(eye);
		}
	}

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
 * Map a numeric piece type to the matching Russian builder.
 * Defaults to pawn for unknown types.
 */
export function buildRussianPiece(pieceTypeNum, materialKey, isLocalPlayer, customMaterials = null) {
	switch (pieceTypeNum) {
		case 6: return createRussianKingPiece(materialKey, isLocalPlayer, customMaterials);
		case 5: return createRussianQueenPiece(materialKey, isLocalPlayer, customMaterials);
		case 4: return createRussianBishopPiece(materialKey, isLocalPlayer, customMaterials);
		case 3: return createRussianKnightPiece(materialKey, isLocalPlayer, customMaterials);
		case 2: return createRussianRookPiece(materialKey, isLocalPlayer, customMaterials);
		case 1:
		default: return createRussianPawnPiece(materialKey, isLocalPlayer, customMaterials);
	}
}

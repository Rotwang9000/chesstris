/**
 * Retro CRT-style letter pieces and cute 8-bit voxel pieces.
 *
 * These are the two non-Russian renderings of chess pieces. They share
 * very little with the detailed Russian set, so they live in their own
 * file to keep the main module focused on the imperial geometry.
 */

// Letters used for each piece type in retro mode.
// The bible specifies "Cyrillic text sprites" for retro, but standard
// chess initials (K/Q/R/B/N/P) keep it universally readable while still
// feeling retro.
const RETRO_PIECE_LETTERS = {
	6: 'K',
	5: 'Q',
	4: 'B',
	3: 'N',
	2: 'R',
	1: 'P',
};

// 8-bit colour palette per piece type — bright arcade colours.
const CUTE_PIECE_COLOURS = {
	6: 0xFFD700,
	5: 0xFF69B4,
	4: 0x8B5CF6,
	3: 0x22D3EE,
	2: 0xF97316,
	1: 0x4ADE80,
};

/**
 * Create a flat letter-on-disc piece for retro/CRT mode.
 * Green phosphor for the local player, amber for opponents.
 */
export function createRetroLetterPiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const group = new THREE.Group();

	const discColor = 0x0A0A0A;
	const rimColor = customColor || (isLocalPlayer ? 0x00FF00 : 0xFF8800);
	const letterFill = '#FFFFFF';
	const letterStroke = customColor
		? `#${Number(customColor).toString(16).padStart(6, '0')}`
		: (isLocalPlayer ? '#00FF00' : '#FF8800');

	const discGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.10, 16);
	const discMat = new THREE.MeshBasicMaterial({ color: discColor, transparent: false });
	const disc = new THREE.Mesh(discGeo, discMat);
	disc.position.y = 0.05;
	group.add(disc);

	const rimGeo = new THREE.TorusGeometry(0.34, 0.04, 6, 20);
	const rimMat = new THREE.MeshBasicMaterial({ color: rimColor });
	const rim = new THREE.Mesh(rimGeo, rimMat);
	rim.rotation.x = -Math.PI / 2;
	rim.position.y = 0.10;
	group.add(rim);

	const letter = RETRO_PIECE_LETTERS[pieceTypeNum] || '?';
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, 128, 128);
	ctx.font = 'bold 96px monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.strokeStyle = letterStroke;
	ctx.lineWidth = 14;
	ctx.strokeText(letter, 64, 64);
	ctx.fillStyle = letterFill;
	ctx.fillText(letter, 64, 64);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const spriteMat = new THREE.SpriteMaterial({
		map: texture, transparent: true, depthTest: true, depthWrite: false,
	});
	const sprite = new THREE.Sprite(spriteMat);
	sprite.scale.set(0.75, 0.75, 1);
	sprite.position.y = 0.55;
	group.add(sprite);

	if (pieceTypeNum >= 5) {
		const ringGeo = new THREE.TorusGeometry(0.26, 0.025, 6, 16);
		const ringMat = new THREE.MeshBasicMaterial({ color: rimColor });
		const ring = new THREE.Mesh(ringGeo, ringMat);
		ring.rotation.x = -Math.PI / 2;
		ring.position.y = 0.10;
		group.add(ring);
	}

	group.userData = {
		type: 'chess',
		pieceType: pieceTypeName,
		pieceTypeNum,
		player,
		position: { x, z },
		originalPosition: { x, z },
		color: customColor,
		retroMode: true,
	};
	group.visible = true;
	return group;
}

/**
 * 8-bit voxel-style piece for cute/arcade mode.
 * Blocky geometry, flat shading, bright colours, with a dark wireframe
 * outline overlay for crispness.
 */
export function createCutePiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const group = new THREE.Group();
	const baseCol = customColor || CUTE_PIECE_COLOURS[pieceTypeNum] || 0xffffff;
	const mat = new THREE.MeshLambertMaterial({ color: baseCol });

	const box = (w, h, d, yOff) => {
		const geo = new THREE.BoxGeometry(w, h, d);
		const mesh = new THREE.Mesh(geo, mat);
		mesh.position.y = yOff;
		mesh.castShadow = false;
		group.add(mesh);
		return mesh;
	};

	switch (pieceTypeNum) {
		case 6: // King
			box(0.5, 0.12, 0.5, 0.06);
			box(0.35, 0.4, 0.35, 0.32);
			box(0.25, 0.25, 0.25, 0.645);
			box(0.08, 0.18, 0.08, 0.86);
			box(0.18, 0.08, 0.08, 0.82);
			break;
		case 5: // Queen
			box(0.5, 0.12, 0.5, 0.06);
			box(0.35, 0.4, 0.35, 0.32);
			box(0.3, 0.2, 0.3, 0.62);
			box(0.08, 0.14, 0.08, 0.79);
			box(0.3, 0.08, 0.08, 0.75);
			break;
		case 4: // Bishop
			box(0.45, 0.12, 0.45, 0.06);
			box(0.3, 0.35, 0.3, 0.295);
			box(0.2, 0.2, 0.2, 0.57);
			box(0.08, 0.12, 0.08, 0.73);
			break;
		case 3: { // Knight
			box(0.45, 0.12, 0.45, 0.06);
			box(0.25, 0.3, 0.25, 0.27);
			const head = box(0.2, 0.22, 0.18, 0.53);
			head.position.z = 0.04;
			const snout = box(0.14, 0.12, 0.22, 0.44);
			snout.position.z = 0.16;
			const earL = box(0.06, 0.1, 0.06, 0.68);
			earL.position.x = -0.06;
			const earR = box(0.06, 0.1, 0.06, 0.68);
			earR.position.x = 0.06;
			break;
		}
		case 2: // Rook
			box(0.5, 0.12, 0.5, 0.06);
			box(0.38, 0.35, 0.38, 0.295);
			box(0.42, 0.1, 0.42, 0.52);
			box(0.12, 0.12, 0.12, 0.63);
			{
				const c2 = box(0.12, 0.12, 0.12, 0.63);
				c2.position.x = 0.15;
				const c3 = box(0.12, 0.12, 0.12, 0.63);
				c3.position.x = -0.15;
			}
			break;
		default: // Pawn
			box(0.4, 0.1, 0.4, 0.05);
			box(0.22, 0.25, 0.22, 0.225);
			box(0.16, 0.16, 0.16, 0.43);
			break;
	}

	// Outline pass — dark wireframe overlay for 8-bit crispness.
	group.traverse(child => {
		if (child.isMesh && child.geometry) {
			const wireGeo = new THREE.EdgesGeometry(child.geometry);
			const wireMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
			const wire = new THREE.LineSegments(wireGeo, wireMat);
			wire.position.copy(child.position);
			group.add(wire);
		}
	});

	group.userData = {
		type: 'chess',
		pieceType: pieceTypeName,
		pieceTypeNum,
		player,
		position: { x, z },
		originalPosition: { x, z },
		color: customColor,
		cuteMode: true,
	};
	group.visible = true;
	return group;
}

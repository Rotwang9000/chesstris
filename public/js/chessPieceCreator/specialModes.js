/**
 * Retro CRT-style letter pieces and cute 8-bit voxel pieces.
 *
 * These are the two non-Russian renderings of chess pieces. They share
 * very little with the detailed Russian set, so they live in their own
 * file to keep the main module focused on the imperial geometry.
 */

// Cyrillic single-letter initials in the style of the Russian original
// Tetris chess set. Direct translations chosen to avoid two pieces
// sharing the same letter:
//   К (Korol')   — King
//   Ф (Ferz')    — Queen / Vizier
//   Г (Grach)    — Rook (literally "rook bird", avoids Л clash with Knight)
//   С (Slon)     — Bishop (elephant)
//   Л (Loshad')  — Knight (horse)
//   П (Peshka)   — Pawn
const RETRO_PIECE_LETTERS = {
	6: '\u041A', // К
	5: '\u0424', // Ф
	4: '\u0421', // С
	3: '\u041B', // Л
	2: '\u0413', // Г
	1: '\u041F', // П
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
 * Cute-mode chess piece: low-poly rounded blobs with a smiley face and a
 * little hat / crown / scarf that says which piece it is. Designed to
 * read clearly at distance and feel friendly, not blocky.
 *
 * Geometry budget per piece is intentionally small (~ 8-12 meshes) so we
 * still hit the "low-spec / fast" performance goal of cute mode.
 */
export function createCutePiece(THREE, pieceTypeNum, pieceTypeName, player, x, z, isLocalPlayer, customColor) {
	const group = new THREE.Group();
	const baseCol = customColor || CUTE_PIECE_COLOURS[pieceTypeNum] || 0xffffff;
	const seg = isLocalPlayer ? 16 : 10;

	const bodyMat = new THREE.MeshLambertMaterial({ color: baseCol });
	const trimMat = new THREE.MeshLambertMaterial({ color: lightenColour(baseCol, 0.4) });
	const darkMat = new THREE.MeshLambertMaterial({ color: lightenColour(baseCol, -0.25) });
	const accentMat = new THREE.MeshLambertMaterial({ color: 0xFFE07A });
	const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
	const eyeShineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

	const add = (mesh) => { group.add(mesh); return mesh; };

	// Disc base — common to every piece, gives a stable footprint.
	const base = new THREE.Mesh(
		new THREE.CylinderGeometry(0.30, 0.34, 0.10, seg),
		trimMat,
	);
	base.position.y = 0.05;
	add(base);

	// Squashed sphere body — wider and rounder than before for a cuter,
	// "matryoshka" feel. Now sits a bit lower so the head/face is at a
	// comfortable reading height.
	const body = new THREE.Mesh(
		new THREE.SphereGeometry(0.30, seg, Math.max(8, seg - 2)),
		bodyMat,
	);
	body.scale.set(1.05, 1.05, 1.05);
	body.position.y = 0.38;
	add(body);

	// Small "belly" highlight in the trim colour for a doll-like feel.
	const belly = new THREE.Mesh(
		new THREE.SphereGeometry(0.14, seg, 8),
		trimMat,
	);
	belly.scale.set(1.2, 1.0, 0.4);
	belly.position.set(0, 0.32, 0.20);
	add(belly);

	// Face — large oval eyes with a sparkle highlight.
	const eyeY = 0.45;
	for (let side = -1; side <= 1; side += 2) {
		const eye = new THREE.Mesh(
			new THREE.SphereGeometry(0.040, 10, 8),
			eyeMat,
		);
		eye.scale.set(0.85, 1.0, 0.6);
		eye.position.set(side * 0.10, eyeY, 0.27);
		add(eye);

		// Eye sparkle (only on local player — saves draw calls for crowds).
		if (isLocalPlayer) {
			const shine = new THREE.Mesh(
				new THREE.SphereGeometry(0.014, 6, 6),
				eyeShineMat,
			);
			shine.position.set(side * 0.10 + 0.012, eyeY + 0.012, 0.30);
			add(shine);
		}
	}

	// Half-torus arc for the smile. Default arc goes through +Y; rotate
	// 180° around Z to flip into -Y for a grin.
	const mouth = new THREE.Mesh(
		new THREE.TorusGeometry(0.06, 0.013, 6, 14, Math.PI),
		eyeMat,
	);
	mouth.position.set(0, 0.37, 0.275);
	mouth.rotation.z = Math.PI;
	add(mouth);

	// Cheek blush only for the local player — keeps opponent count low.
	if (isLocalPlayer) {
		const blushMat = new THREE.MeshBasicMaterial({
			color: 0xFFB0B0, transparent: true, opacity: 0.75,
		});
		for (let side = -1; side <= 1; side += 2) {
			const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), blushMat);
			cheek.position.set(side * 0.16, 0.37, 0.275);
			add(cheek);
		}
	}

	// Tiny stubby arms peeking out of the sides — these were the
	// missing ingredient that made the bodies feel inert. Kept very
	// small so they don't dominate the silhouette.
	if (pieceTypeNum !== 1 || isLocalPlayer) {
		for (let side = -1; side <= 1; side += 2) {
			const arm = new THREE.Mesh(
				new THREE.SphereGeometry(0.06, 8, 6),
				bodyMat,
			);
			arm.scale.set(0.7, 0.9, 0.7);
			arm.position.set(side * 0.30, 0.34, 0.04);
			add(arm);
		}
	}

	// Per-piece topper — small accessory that signals the piece type.
	switch (pieceTypeNum) {
		case 6: { // King — five-point crown
			const crown = new THREE.Mesh(
				new THREE.CylinderGeometry(0.16, 0.20, 0.08, 5),
				accentMat,
			);
			crown.position.y = 0.66;
			add(crown);
			for (let i = 0; i < 5; i++) {
				const angle = (i / 5) * Math.PI * 2;
				const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.10, 4), accentMat);
				spike.position.set(Math.cos(angle) * 0.16, 0.74, Math.sin(angle) * 0.16);
				add(spike);
			}
			const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.10, 0.04), accentMat);
			cross.position.y = 0.85;
			add(cross);
			const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.04), accentMat);
			cross2.position.y = 0.86;
			add(cross2);
			break;
		}
		case 5: { // Queen — tiara with a single jewel
			const tiara = new THREE.Mesh(
				new THREE.TorusGeometry(0.14, 0.025, 6, 16, Math.PI),
				accentMat,
			);
			tiara.position.set(0, 0.66, 0);
			tiara.rotation.x = -Math.PI / 2;
			add(tiara);
			const gem = new THREE.Mesh(
				new THREE.OctahedronGeometry(0.05),
				new THREE.MeshLambertMaterial({ color: 0xFF66AA }),
			);
			gem.position.set(0, 0.70, 0.10);
			add(gem);
			break;
		}
		case 4: { // Bishop — pointy hat with a slit
			const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.30, seg), bodyMat);
			mitre.position.y = 0.74;
			add(mitre);
			const slit = new THREE.Mesh(
				new THREE.BoxGeometry(0.04, 0.16, 0.045),
				trimMat,
			);
			slit.position.set(0, 0.74, 0.15);
			add(slit);
			break;
		}
		case 3: { // Knight — pony ears, snout and flowing forelock
			// Snout: small rounded box poking out the front, with a
			// nostril dot. Gives the cute knight an unmistakable horse
			// face instead of "blob with ears".
			const snout = new THREE.Mesh(
				new THREE.SphereGeometry(0.10, seg, 8),
				trimMat,
			);
			snout.scale.set(1.0, 0.7, 1.2);
			snout.position.set(0, 0.40, 0.34);
			add(snout);

			// Pony ears with inner pink lining.
			const earInnerMat = new THREE.MeshLambertMaterial({ color: 0xFFB0C0 });
			for (let side = -1; side <= 1; side += 2) {
				const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), bodyMat);
				ear.position.set(side * 0.10, 0.66, 0.05);
				ear.rotation.z = side * 0.25;
				add(ear);
				const earInner = new THREE.Mesh(
					new THREE.ConeGeometry(0.025, 0.07, 6),
					earInnerMat,
				);
				earInner.position.set(side * 0.10, 0.67, 0.07);
				earInner.rotation.z = side * 0.25;
				add(earInner);
			}

			// Forelock — three soft tufts hanging between the ears.
			for (let i = -1; i <= 1; i++) {
				const tuft = new THREE.Mesh(
					new THREE.ConeGeometry(0.035, 0.13, 6),
					darkMat,
				);
				tuft.position.set(i * 0.05, 0.62, 0.18);
				tuft.rotation.x = -0.4;
				tuft.rotation.z = i * 0.3;
				add(tuft);
			}

			// Mane — a couple of short tufts curling backwards.
			for (let i = -1; i <= 1; i += 2) {
				const mane = new THREE.Mesh(
					new THREE.ConeGeometry(0.04, 0.18, 6),
					darkMat,
				);
				mane.position.set(i * 0.06, 0.58, -0.16);
				mane.rotation.x = 0.6;
				mane.rotation.z = i * 0.3;
				add(mane);
			}
			break;
		}
		case 2: { // Rook — battlement / chef's-hat ring
			const cap = new THREE.Mesh(
				new THREE.CylinderGeometry(0.18, 0.18, 0.10, seg),
				bodyMat,
			);
			cap.position.y = 0.66;
			add(cap);
			for (let i = 0; i < 4; i++) {
				const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
				const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), bodyMat);
				merlon.position.set(Math.cos(angle) * 0.13, 0.74, Math.sin(angle) * 0.13);
				add(merlon);
			}
			break;
		}
		default: { // Pawn — tiny bobble cap
			const stalk = new THREE.Mesh(
				new THREE.CylinderGeometry(0.025, 0.025, 0.07, 6),
				accentMat,
			);
			stalk.position.y = 0.66;
			add(stalk);
			const bobble = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), accentMat);
			bobble.position.y = 0.74;
			add(bobble);
			break;
		}
	}

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

function lightenColour(hex, amount) {
	const r = (hex >> 16) & 0xff;
	const g = (hex >> 8) & 0xff;
	const b = hex & 0xff;
	const blend = amount >= 0 ? 255 : 0;
	const t = Math.min(1, Math.abs(amount));
	const nr = Math.round(r + (blend - r) * t);
	const ng = Math.round(g + (blend - g) * t);
	const nb = Math.round(b + (blend - b) * t);
	return (nr << 16) | (ng << 8) | nb;
}

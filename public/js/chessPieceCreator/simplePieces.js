/**
 * Simple geometric chess pieces used by the legacy `createPiece` entry
 * point and the AI debug / placeholder rendering path. These take a
 * pre-built material rather than the imperial `{ primary, secondary,
 * accent }` trio.
 */

function applyShadows(group) {
	group.traverse(child => {
		if (child.isMesh) {
			child.castShadow = true;
			child.receiveShadow = true;
		}
	});
	return group;
}

export function createKingPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16), material);
	body.position.y = 0.45;
	group.add(body);

	const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.2, 16), material);
	top.position.y = 0.8;
	group.add(top);

	const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.2, 16), material);
	crown.position.y = 1.0;
	group.add(crown);

	const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), material);
	crossVertical.position.y = 1.25;
	group.add(crossVertical);

	const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), material);
	crossHorizontal.position.y = 1.2;
	group.add(crossHorizontal);

	return applyShadows(group);
}

export function createQueenPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.5, 16), material);
	body.position.y = 0.45;
	group.add(body);

	const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.2, 16), material);
	top.position.y = 0.8;
	group.add(top);

	const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 0.2, 16), material);
	crown.position.y = 1.0;
	group.add(crown);

	const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), material);
	ball.position.y = 1.15;
	group.add(ball);

	return applyShadows(group);
}

export function createBishopPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 16), material);
	body.position.y = 0.5;
	group.add(body);

	const top = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), material);
	top.position.y = 0.9;
	group.add(top);

	const slit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.01), material);
	slit.position.y = 1.0;
	slit.rotation.x = Math.PI / 2;
	group.add(slit);

	return applyShadows(group);
}

export function createKnightPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.4, 16), material);
	body.position.y = 0.4;
	group.add(body);

	const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.25), material);
	headBase.position.y = 0.7;
	group.add(headBase);

	const headTop = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.25), material);
	headTop.position.y = 0.95;
	headTop.position.x = 0.1;
	group.add(headTop);

	const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 16), material);
	ear.position.y = 1.1;
	ear.position.x = -0.1;
	ear.rotation.z = -Math.PI / 4;
	group.add(ear);

	return applyShadows(group);
}

export function createRookPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), material);
	body.position.y = 0.5;
	group.add(body);

	const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.2, 16), material);
	top.position.y = 0.9;
	group.add(top);

	for (let i = 0; i < 4; i++) {
		const angle = (i / 4) * Math.PI * 2;
		const battlement = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.1), material);
		battlement.position.y = 1.075;
		battlement.position.x = Math.sin(angle) * 0.25;
		battlement.position.z = Math.cos(angle) * 0.25;
		group.add(battlement);
	}

	return applyShadows(group);
}

export function createPawnPieceMesh(THREE, material) {
	const group = new THREE.Group();

	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.2, 16), material);
	base.position.y = 0.1;
	group.add(base);

	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.4, 16), material);
	body.position.y = 0.4;
	group.add(body);

	const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), material);
	head.position.y = 0.7;
	group.add(head);

	return applyShadows(group);
}

/**
 * Create a simple geometric chess piece using the supplied material or
 * colour. Used by the AI piece pipeline that wants a plain coloured
 * mesh without the imperial detailing.
 */
export function createPiece(newType, newColor, orientation, THREE) {
	let material;
	if (typeof newColor === 'object' && newColor !== null) {
		material = newColor;
	} else {
		const colorValue = typeof newColor === 'number' ? newColor : 0xCCCCCC;
		material = new THREE.MeshStandardMaterial({
			color: colorValue, roughness: 0.7, metalness: 0.3,
		});
	}

	let piece;
	switch (String(newType).toUpperCase()) {
		case 'KING': piece = createKingPieceMesh(THREE, material); break;
		case 'QUEEN': piece = createQueenPieceMesh(THREE, material); break;
		case 'BISHOP': piece = createBishopPieceMesh(THREE, material); break;
		case 'KNIGHT': piece = createKnightPieceMesh(THREE, material); break;
		case 'ROOK': piece = createRookPieceMesh(THREE, material); break;
		case 'PAWN': piece = createPawnPieceMesh(THREE, material); break;
		default:
			console.error(`Unknown piece type: ${newType}`);
			piece = createPawnPieceMesh(THREE, material);
			break;
	}

	if (!piece) {
		console.error(`Failed to create piece of type ${newType}`);
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, material);
		piece = new THREE.Group();
		piece.add(fallbackMesh);
		fallbackMesh.position.y = 0.4;
	}

	piece.userData = { type: newType, color: newColor };
	if (orientation !== undefined) piece.rotation.y = orientation * Math.PI / 2;
	return applyShadows(piece);
}

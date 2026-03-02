/**
 * Chess Piece Highlight Manager
 *
 * Minimal highlight approach: thin coloured ring only on selection.
 * Current-player pieces get a very faint floor marker.
 */

import { getTHREE } from './gameContext.js';

let chessPiecesGroup = null;
const highlightAnimations = [];
let animLoopRunning = false;

function ensureAnimLoop() {
	if (animLoopRunning) return;
	animLoopRunning = true;
	function loop() {
		for (let i = highlightAnimations.length - 1; i >= 0; i--) {
			try { highlightAnimations[i](); } catch (_) { highlightAnimations.splice(i, 1); }
		}
		requestAnimationFrame(loop);
	}
	requestAnimationFrame(loop);
}

export function setChessPiecesGroup(group) {
	chessPiecesGroup = group;
}

// Current-player pieces get a faint ring so the player knows which are theirs
export function highlightCurrentPlayerPieces(currentPlayerId) {
	const THREE = getTHREE();
	if (!chessPiecesGroup || !THREE) return;
	removePlayerPiecesHighlight();

	chessPiecesGroup.children.forEach(piece => {
		if (!piece.userData || String(piece.userData.player) !== String(currentPlayerId)) return;
		try {
			const ring = createRing(THREE, {
				innerRadius: 0.36, outerRadius: 0.40,
				colour: 0xFFD700, opacity: 0.35,
				name: 'hover-highlight'
			});
			piece.add(ring);
		} catch (_) { /* best effort */ }
	});
}

export function highlightPlayerPieces(playerId) {
	if (!chessPiecesGroup) return;
	chessPiecesGroup.children.forEach(piece => {
		if (piece.userData && String(piece.userData.player) === String(playerId)) {
			highlightSinglePiece(piece);
		}
	});
}

export function removePlayerPiecesHighlight() {
	if (!chessPiecesGroup) return;
	chessPiecesGroup.children.forEach(piece => {
		removeHighlightMeshes(piece, ['hover-highlight']);
		const hasSelected = !!piece.getObjectByName('selected-highlight') ||
			!!piece.getObjectByName('selected-indicator');
		if (!hasSelected && !(piece.userData?._isSelected)) {
			piece.scale.set(1, 1, 1);
		}
	});
}

export function highlightSinglePiece(piece, options = {}) {
	const THREE = getTHREE();
	if (!THREE || !piece) return;

	const mode = options.mode || 'hover';
	const isSelected = mode === 'selected';
	const ringColour = options.color ?? (isSelected ? 0xFFD200 : 0xFFD700);
	const pieceScale = options.scale ?? (isSelected ? 1.12 : 1.0);

	removeHighlightMeshes(piece, [
		'hover-highlight', 'selected-highlight', 'selected-indicator'
	]);

	try {
		const ring = createRing(THREE, {
			innerRadius: isSelected ? 0.30 : 0.36,
			outerRadius: isSelected ? 0.42 : 0.40,
			colour: ringColour,
			opacity: isSelected ? 0.8 : 0.4,
			name: isSelected ? 'selected-highlight' : 'hover-highlight'
		});
		piece.add(ring);

		if (isSelected) {
			piece.userData = piece.userData || {};
			piece.userData._isSelected = true;

			const coneGeom = new THREE.ConeGeometry(0.10, 0.25, 8);
			const coneMat = new THREE.MeshBasicMaterial({
				color: ringColour, transparent: true, opacity: 0.85,
				depthTest: false, depthWrite: false
			});
			const indicator = new THREE.Mesh(coneGeom, coneMat);
			indicator.name = 'selected-indicator';
			indicator.position.y = 1.1;
			indicator.rotation.x = Math.PI;
			indicator.renderOrder = 1001;
			piece.add(indicator);

			const baseY = indicator.position.y;
			const bobFn = () => {
				indicator.position.y = baseY + Math.sin(performance.now() * 0.003) * 0.06;
			};
			indicator.userData = { animFn: bobFn };
			highlightAnimations.push(bobFn);
			ensureAnimLoop();
		} else if (piece.userData?._isSelected) {
			delete piece.userData._isSelected;
		}

		piece.scale.set(pieceScale, pieceScale, pieceScale);
	} catch (_) { /* best effort */ }
}

export function clearSinglePieceHighlight(piece) {
	if (!piece) return;
	removeHighlightMeshes(piece, [
		'hover-highlight', 'selected-highlight', 'selected-indicator'
	]);
	if (piece.userData?._isSelected) delete piece.userData._isSelected;
	piece.scale.set(1, 1, 1);
}

function createRing(THREE, { innerRadius, outerRadius, colour, opacity, name }) {
	const tubeRadius = (outerRadius - innerRadius) / 2;
	const torusRadius = innerRadius + tubeRadius;
	const geometry = new THREE.TorusGeometry(torusRadius, tubeRadius, 8, 32);
	const material = new THREE.MeshBasicMaterial({
		color: colour, transparent: true, opacity,
		side: THREE.DoubleSide, depthTest: true, depthWrite: false
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = name;
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = 0.12;
	mesh.renderOrder = 999;
	return mesh;
}

function removeHighlightMeshes(piece, names) {
	for (const name of names) {
		const obj = piece.getObjectByName(name);
		if (!obj) continue;
		if (obj.userData?.animFn) {
			const idx = highlightAnimations.indexOf(obj.userData.animFn);
			if (idx > -1) highlightAnimations.splice(idx, 1);
		}
		piece.remove(obj);
		if (obj.geometry) obj.geometry.dispose();
		if (obj.material) obj.material.dispose();
	}
}

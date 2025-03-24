import { models } from './enhanced-gameCore.js';
import * as THREE from './utils/three.module.js';

/**
 * Create fallback models using basic THREE.js geometry
 */
export function createFallbackModels(models) {
	// Create models for players
	for (let playerId = 1; playerId <= 2; playerId++) {
		if (!models.pieces[playerId]) {
			models.pieces[playerId] = {};
		}

		// Define piece colors
		const pieceColor = playerId === 1 ? 0x3377ff : 0xff7700;
		const accentColor = playerId === 1 ? 0x1155dd : 0xcc5500;

		// Create materials
		const pieceMaterial = new THREE.MeshStandardMaterial({
			color: pieceColor,
			metalness: 0.2,
			roughness: 0.5
		});

		const accentMaterial = new THREE.MeshStandardMaterial({
			color: accentColor,
			metalness: 0.5,
			roughness: 0.2
		});

		// Create pawn - simple cylinder with sphere top
		const pawnGroup = new THREE.Group();
		const pawnBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8),
			pieceMaterial
		);
		pawnBase.position.y = 0.15;

		const pawnBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.25, 0.3, 0.7, 8),
			pieceMaterial
		);
		pawnBody.position.y = 0.65;

		const pawnHead = new THREE.Mesh(
			new THREE.SphereGeometry(0.25, 16, 16),
			pieceMaterial
		);
		pawnHead.position.y = 1.15;

		pawnGroup.add(pawnBase, pawnBody, pawnHead);
		models.pieces[playerId]['PAWN'] = pawnGroup;

		// Create rook - cylinder with blocky top
		const rookGroup = new THREE.Group();
		const rookBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		rookBase.position.y = 0.2;

		const rookBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8),
			pieceMaterial
		);
		rookBody.position.y = 0.8;

		const rookTop = new THREE.Mesh(
			new THREE.BoxGeometry(0.8, 0.3, 0.8),
			pieceMaterial
		);
		rookTop.position.y = 1.35;

		rookGroup.add(rookBase, rookBody, rookTop);
		models.pieces[playerId]['ROOK'] = rookGroup;

		// Create knight - cylinder with angled top
		const knightGroup = new THREE.Group();
		const knightBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		knightBase.position.y = 0.2;

		const knightBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8),
			pieceMaterial
		);
		knightBody.position.y = 0.8;

		const knightHead = new THREE.Mesh(
			new THREE.ConeGeometry(0.25, 0.6, 8),
			pieceMaterial
		);
		knightHead.position.y = 1.4;
		knightHead.rotation.z = Math.PI / 4;

		knightGroup.add(knightBase, knightBody, knightHead);
		models.pieces[playerId]['KNIGHT'] = knightGroup;

		// Create bishop - cylinder with pointed top
		const bishopGroup = new THREE.Group();
		const bishopBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		bishopBase.position.y = 0.2;

		const bishopBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8),
			pieceMaterial
		);
		bishopBody.position.y = 0.9;

		const bishopTop = new THREE.Mesh(
			new THREE.ConeGeometry(0.3, 0.6, 16),
			pieceMaterial
		);
		bishopTop.position.y = 1.7;

		bishopGroup.add(bishopBase, bishopBody, bishopTop);
		models.pieces[playerId]['BISHOP'] = bishopGroup;

		// Create queen - cylinder with crown
		const queenGroup = new THREE.Group();
		const queenBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
			pieceMaterial
		);
		queenBase.position.y = 0.2;

		const queenBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8),
			pieceMaterial
		);
		queenBody.position.y = 1.0;

		const queenCrown = new THREE.Mesh(
			new THREE.SphereGeometry(0.4, 16, 16),
			accentMaterial
		);
		queenCrown.position.y = 1.8;

		queenGroup.add(queenBase, queenBody, queenCrown);
		models.pieces[playerId]['QUEEN'] = queenGroup;

		// Create king - cylinder with cross
		const kingGroup = new THREE.Group();
		const kingBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
			pieceMaterial
		);
		kingBase.position.y = 0.2;

		const kingBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8),
			pieceMaterial
		);
		kingBody.position.y = 1.0;

		const kingCrown = new THREE.Mesh(
			new THREE.SphereGeometry(0.3, 16, 16),
			accentMaterial
		);
		kingCrown.position.y = 1.8;

		const kingCrossV = new THREE.Mesh(
			new THREE.BoxGeometry(0.1, 0.5, 0.1),
			accentMaterial
		);
		kingCrossV.position.y = 2.2;

		const kingCrossH = new THREE.Mesh(
			new THREE.BoxGeometry(0.4, 0.1, 0.1),
			accentMaterial
		);
		kingCrossH.position.y = 2.1;

		kingGroup.add(kingBase, kingBody, kingCrown, kingCrossV, kingCrossH);
		models.pieces[playerId]['KING'] = kingGroup;

		if (!models.defaultPieces) {
			models.defaultPieces = {};
		}
		if (!models.defaultPieces['PAWN']) {
			models.defaultPieces['PAWN'] = pawnGroup;
		}
		if (!models.defaultPieces['ROOK']) {
			models.defaultPieces['ROOK'] = rookGroup;
		}
		if (!models.defaultPieces['KNIGHT']) {
			models.defaultPieces['KNIGHT'] = knightGroup;
		}
		if (!models.defaultPieces['BISHOP']) {
			models.defaultPieces['BISHOP'] = bishopGroup;
		}
		if (!models.defaultPieces['QUEEN']) {
			models.defaultPieces['QUEEN'] = queenGroup;
		}
		if (!models.defaultPieces['KING']) {
			models.defaultPieces['KING'] = kingGroup;
		}
	}

}

import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import './ChessPiece.css';

const ChessPiece = ({
	id,
	type,
	color,
	x,
	y,
	isSelected,
	isActive,
	moveCount,
	isEligibleForPromotion,
	onClick,
	onDragStart,
	onDragEnd
}) => {
	const meshRef = useRef(null);
	const pieceModelRef = useRef(null);
	
	// Create the 3D mesh for the piece
	useEffect(() => {
		if (!meshRef.current) return;
		
		// Create a group for the piece
		const pieceGroup = new THREE.Group();
		pieceModelRef.current = pieceGroup;
		
		// Create the piece based on type
		createPieceModel(type, color, pieceGroup);
		
		// Position the piece based on grid coordinates
		pieceGroup.position.set(x - 3.5, 0.3, y - 3.5);
		
		// Scale the piece appropriately
		pieceGroup.scale.set(0.4, 0.4, 0.4);
		
		// Add selection indicator
		if (isSelected) {
			addSelectionRing(pieceGroup, color);
		}
		
		// Add promotion eligibility indicator
		if (isEligibleForPromotion) {
			addPromotionIndicator(pieceGroup);
		}
		
		// Set up interaction events
		pieceGroup.userData = {
			id,
			type,
			position: { x, y },
			isDragging: false
		};
		
		// Make the piece interactive
		pieceGroup.traverse((object) => {
			object.userData = pieceGroup.userData;
		});
		
		// Add event listeners
		const handleClick = (event) => {
			// Prevent event bubbling to board
			event.stopPropagation();
			if (onClick) onClick({ id, type, color, x, y });
		};
		
		const handleDragStart = (event) => {
			event.stopPropagation();
			pieceGroup.userData.isDragging = true;
			if (onDragStart) onDragStart({ id, type, color, x, y });
		};
		
		const handleDragEnd = (event) => {
			event.stopPropagation();
			pieceGroup.userData.isDragging = false;
			if (onDragEnd) onDragEnd({ id, type, color, x, y });
		};
		
		pieceGroup.addEventListener('click', handleClick);
		pieceGroup.addEventListener('mousedown', handleDragStart);
		pieceGroup.addEventListener('mouseup', handleDragEnd);
		
		// Add to the scene
		meshRef.current.add(pieceGroup);
		
		// Animate entrance
		animatePieceEntrance(pieceGroup);
		
		// Cleanup
		return () => {
			pieceGroup.removeEventListener('click', handleClick);
			pieceGroup.removeEventListener('mousedown', handleDragStart);
			pieceGroup.removeEventListener('mouseup', handleDragEnd);
			
			if (meshRef.current) {
				meshRef.current.remove(pieceGroup);
			}
			
			// Dispose of geometries and materials
			pieceGroup.traverse((object) => {
				if (object.geometry) object.geometry.dispose();
				if (object.material) {
					if (Array.isArray(object.material)) {
						object.material.forEach(material => material.dispose());
					} else {
						object.material.dispose();
					}
				}
			});
		};
	}, [id, type, color, x, y, isSelected, isActive, isEligibleForPromotion, onClick, onDragStart, onDragEnd]);
	
	// Update piece when move count changes (for pawn promotion tracking)
	useEffect(() => {
		if (!pieceModelRef.current) return;
		
		// Update promotion indicator
		if (isEligibleForPromotion && !pieceModelRef.current.userData.promotionIndicator) {
			addPromotionIndicator(pieceModelRef.current);
		} else if (!isEligibleForPromotion && pieceModelRef.current.userData.promotionIndicator) {
			removePromotionIndicator(pieceModelRef.current);
		}
		
	}, [moveCount, isEligibleForPromotion]);
	
	// Create appropriate piece geometry based on piece type
	const createPieceModel = (type, color, group) => {
		const pieceColor = new THREE.Color(color.toLowerCase() === 'white' ? 0xf0f0f0 : 0x333333);
		
		// Basic material for all pieces
		const material = new THREE.MeshStandardMaterial({
			color: pieceColor,
			metalness: 0.1,
			roughness: 0.8
		});
		
		let pieceGeometry;
		
		// Create different geometries based on piece type
		switch (type.toLowerCase()) {
			case 'pawn':
				pieceGeometry = createPawnGeometry();
				break;
			case 'rook':
				pieceGeometry = createRookGeometry();
				break;
			case 'knight':
				pieceGeometry = createKnightGeometry();
				break;
			case 'bishop':
				pieceGeometry = createBishopGeometry();
				break;
			case 'queen':
				pieceGeometry = createQueenGeometry();
				break;
			case 'king':
				pieceGeometry = createKingGeometry();
				break;
			default:
				// Fallback to a simple cylinder for unknown pieces
				pieceGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1, 16);
		}
		
		const pieceMesh = new THREE.Mesh(pieceGeometry, material);
		pieceMesh.castShadow = true;
		pieceMesh.receiveShadow = true;
		
		// Add a base to the piece
		const baseGeometry = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16);
		const baseMaterial = new THREE.MeshStandardMaterial({
			color: pieceColor,
			metalness: 0.2,
			roughness: 0.7
		});
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.y = -0.5;
		base.castShadow = true;
		base.receiveShadow = true;
		
		group.add(pieceMesh);
		group.add(base);
		
		return group;
	};
	
	// Simple geometric representations of chess pieces
	const createPawnGeometry = () => {
		const geometry = new THREE.Group();
		
		// Body of the pawn
		const body = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.25, 0.6, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		body.position.y = -0.2;
		
		// Head of the pawn
		const head = new THREE.Mesh(
			new THREE.SphereGeometry(0.25, 16, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		head.position.y = 0.2;
		
		geometry.add(body);
		geometry.add(head);
		
		return geometry;
	};
	
	const createRookGeometry = () => {
		const geometry = new THREE.Group();
		
		// Main body of the rook
		const body = new THREE.Mesh(
			new THREE.BoxGeometry(0.6, 0.8, 0.6),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		
		// Top crenellations
		for (let i = 0; i < 4; i++) {
			const x = i < 2 ? -0.15 : 0.15;
			const z = i % 2 === 0 ? -0.15 : 0.15;
			
			const crenellation = new THREE.Mesh(
				new THREE.BoxGeometry(0.2, 0.2, 0.2),
				new THREE.MeshStandardMaterial({ color: 0xffffff })
			);
			crenellation.position.set(x, 0.5, z);
			geometry.add(crenellation);
		}
		
		geometry.add(body);
		
		return geometry;
	};
	
	const createKnightGeometry = () => {
		const geometry = new THREE.Group();
		
		// Main body of the knight
		const body = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		body.position.y = -0.2;
		
		// Head of the knight (simplified)
		const head = new THREE.Mesh(
			new THREE.BoxGeometry(0.3, 0.5, 0.6),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		head.position.set(0, 0.3, 0.1);
		head.rotation.x = -Math.PI / 6;
		
		geometry.add(body);
		geometry.add(head);
		
		return geometry;
	};
	
	const createBishopGeometry = () => {
		const geometry = new THREE.Group();
		
		// Main body of the bishop
		const body = new THREE.Mesh(
			new THREE.ConeGeometry(0.3, 1, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		
		// Top of the bishop
		const top = new THREE.Mesh(
			new THREE.SphereGeometry(0.15, 16, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		top.position.y = 0.6;
		
		geometry.add(body);
		geometry.add(top);
		
		return geometry;
	};
	
	const createQueenGeometry = () => {
		const geometry = new THREE.Group();
		
		// Main body of the queen
		const body = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.4, 0.9, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		
		// Crown points
		for (let i = 0; i < 5; i++) {
			const angle = (i / 5) * Math.PI * 2;
			const x = Math.cos(angle) * 0.2;
			const z = Math.sin(angle) * 0.2;
			
			const point = new THREE.Mesh(
				new THREE.SphereGeometry(0.08, 8, 8),
				new THREE.MeshStandardMaterial({ color: 0xffffff })
			);
			point.position.set(x, 0.5, z);
			geometry.add(point);
		}
		
		geometry.add(body);
		
		return geometry;
	};
	
	const createKingGeometry = () => {
		const geometry = new THREE.Group();
		
		// Main body of the king
		const body = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.4, 0.9, 16),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		
		// Top cross
		const crossVertical = new THREE.Mesh(
			new THREE.BoxGeometry(0.1, 0.3, 0.1),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		crossVertical.position.y = 0.65;
		
		const crossHorizontal = new THREE.Mesh(
			new THREE.BoxGeometry(0.25, 0.1, 0.1),
			new THREE.MeshStandardMaterial({ color: 0xffffff })
		);
		crossHorizontal.position.y = 0.6;
		
		geometry.add(body);
		geometry.add(crossVertical);
		geometry.add(crossHorizontal);
		
		return geometry;
	};
	
	// Add a ring around the piece to indicate selection
	const addSelectionRing = (pieceGroup, color) => {
		const ringGeometry = new THREE.TorusGeometry(0.6, 0.05, 16, 32);
		const ringMaterial = new THREE.MeshBasicMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.7
		});
		
		const ring = new THREE.Mesh(ringGeometry, ringMaterial);
		ring.rotation.x = Math.PI / 2; // Make the ring flat on the ground
		ring.position.y = -0.45; // Position at the base of the piece
		
		pieceGroup.add(ring);
		pieceGroup.userData.selectionRing = ring;
	};
	
	// Add an indicator for pieces eligible for promotion
	const addPromotionIndicator = (pieceGroup) => {
		if (pieceGroup.userData.promotionIndicator) return;
		
		// Create a pulsing halo effect
		const haloGeometry = new THREE.RingGeometry(0.6, 0.7, 32);
		const haloMaterial = new THREE.MeshBasicMaterial({
			color: 0xffcc00,
			transparent: true,
			opacity: 0.6,
			side: THREE.DoubleSide
		});
		
		const halo = new THREE.Mesh(haloGeometry, haloMaterial);
		halo.rotation.x = -Math.PI / 2; // Make the halo flat and facing up
		halo.position.y = 0.7; // Position above the piece
		
		pieceGroup.add(halo);
		pieceGroup.userData.promotionIndicator = halo;
		
		// Create animation for the halo
		const animate = () => {
			if (!pieceGroup.userData.promotionIndicator) return;
			
			halo.scale.x = 1 + Math.sin(Date.now() * 0.003) * 0.15;
			halo.scale.z = 1 + Math.sin(Date.now() * 0.003) * 0.15;
			
			pieceGroup.userData.animationId = requestAnimationFrame(animate);
		};
		
		animate();
	};
	
	// Remove promotion indicator
	const removePromotionIndicator = (pieceGroup) => {
		if (!pieceGroup.userData.promotionIndicator) return;
		
		pieceGroup.remove(pieceGroup.userData.promotionIndicator);
		pieceGroup.userData.promotionIndicator.geometry.dispose();
		pieceGroup.userData.promotionIndicator.material.dispose();
		pieceGroup.userData.promotionIndicator = null;
		
		if (pieceGroup.userData.animationId) {
			cancelAnimationFrame(pieceGroup.userData.animationId);
		}
	};
	
	// Animate piece entrance with a scale and bounce effect
	const animatePieceEntrance = (pieceGroup) => {
		pieceGroup.scale.set(0, 0, 0);
		
		// Animation parameters
		const duration = 300; // ms
		const startTime = Date.now();
		
		const animate = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
			// Ease in-out with a slight bounce
			const scale = progress < 0.7 ?
				0.4 * (1.5 * progress) :
				0.4 * (1 + Math.sin((progress - 0.7) * 5) * 0.1);
			
			pieceGroup.scale.set(scale, scale, scale);
			
			if (progress < 1) {
				requestAnimationFrame(animate);
			}
		};
		
		animate();
	};
	
	return <div ref={meshRef} className="chess-piece" />;
};

ChessPiece.propTypes = {
	id: PropTypes.string.isRequired,
	type: PropTypes.oneOf(['pawn', 'rook', 'knight', 'bishop', 'queen', 'king']).isRequired,
	color: PropTypes.string.isRequired,
	x: PropTypes.number.isRequired,
	y: PropTypes.number.isRequired,
	isSelected: PropTypes.bool,
	isActive: PropTypes.bool,
	moveCount: PropTypes.number,
	isEligibleForPromotion: PropTypes.bool,
	onClick: PropTypes.func,
	onDragStart: PropTypes.func,
	onDragEnd: PropTypes.func
};

ChessPiece.defaultProps = {
	isSelected: false,
	isActive: false,
	moveCount: 0,
	isEligibleForPromotion: false,
	onClick: () => {},
	onDragStart: null,
	onDragEnd: null
};

export default ChessPiece; 
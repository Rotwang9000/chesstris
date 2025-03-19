import React, { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import './BoardCell.css';

/**
 * BoardCell Component
 * 
 * Renders a 3D cell on the game board
 */
const BoardCell = ({
	x,
	y,
	z,
	color,
	isHomeZone,
	isValidMoveTarget,
	isHighlighted,
	onClick
}) => {
	const meshRef = useRef(null);
	
	// Create the 3D mesh for the cell
	useEffect(() => {
		if (!meshRef.current) return;
		
		// Create geometry based on the z position
		// Z=0 is the board level, Z=1 is floating above
		const geometry = new THREE.BoxGeometry(1, 0.2, 1);
		
		// Create material based on cell properties
		let material;
		
		if (isValidMoveTarget) {
			// Valid move target has a highlighted appearance
			material = new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				emissive: new THREE.Color(0x00ff00),
				emissiveIntensity: 0.3,
				transparent: true,
				opacity: 0.8
			});
		} else if (isHighlighted) {
			// Highlighted cells have a subtle glow
			material = new THREE.MeshStandardMaterial({
				color: new THREE.Color(color),
				emissive: new THREE.Color(0xffff00),
				emissiveIntensity: 0.2
			});
		} else {
			// Normal cells
			material = new THREE.MeshStandardMaterial({
				color: new THREE.Color(color)
			});
		}
		
		// Create mesh
		const mesh = new THREE.Mesh(geometry, material);
		
		// Position the mesh based on grid coordinates
		// Z position determines height
		mesh.position.set(x - 3.5, z * 0.3, y - 3.5);
		
		// Add a subtle border effect
		const edgeGeometry = new THREE.EdgesGeometry(geometry);
		const edgeMaterial = new THREE.LineBasicMaterial({ 
			color: isHomeZone ? 0x333333 : 0x000000, 
			transparent: true,
			opacity: 0.5
		});
		const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
		mesh.add(edges);
		
		// Add hover effect by changing the material on mouse events
		const handlePointerOver = () => {
			if (!isValidMoveTarget && !isHighlighted) {
				mesh.material.emissive = new THREE.Color(0x333333);
				mesh.material.emissiveIntensity = 0.2;
				mesh.material.needsUpdate = true;
			}
		};
		
		const handlePointerOut = () => {
			if (!isValidMoveTarget && !isHighlighted) {
				mesh.material.emissive = new THREE.Color(0x000000);
				mesh.material.emissiveIntensity = 0;
				mesh.material.needsUpdate = true;
			}
		};
		
		// Store references to the event handlers
		mesh.userData = {
			pointerOver: handlePointerOver,
			pointerOut: handlePointerOut,
			position: { x, y, z }
		};
		
		mesh.addEventListener('pointerover', handlePointerOver);
		mesh.addEventListener('pointerout', handlePointerOut);
		mesh.addEventListener('click', () => onClick(x, y, z));
		
		// Add to the scene
		meshRef.current.add(mesh);
		
		// Cleanup
		return () => {
			mesh.removeEventListener('pointerover', handlePointerOver);
			mesh.removeEventListener('pointerout', handlePointerOut);
			mesh.removeEventListener('click', () => onClick(x, y, z));
			meshRef.current.remove(mesh);
			geometry.dispose();
			material.dispose();
			edgeGeometry.dispose();
			edgeMaterial.dispose();
		};
	}, [x, y, z, color, isHomeZone, isValidMoveTarget, isHighlighted, onClick]);
	
	return <div ref={meshRef} className="board-cell" />;
};

BoardCell.propTypes = {
	x: PropTypes.number.isRequired,
	y: PropTypes.number.isRequired,
	z: PropTypes.number.isRequired,
	color: PropTypes.string.isRequired,
	isHomeZone: PropTypes.bool,
	isValidMoveTarget: PropTypes.bool,
	isHighlighted: PropTypes.bool,
	onClick: PropTypes.func
};

BoardCell.defaultProps = {
	isHomeZone: false,
	isValidMoveTarget: false,
	isHighlighted: false,
	onClick: () => {}
};

export default BoardCell; 
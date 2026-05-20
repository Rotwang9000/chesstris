/**
 * Three.js debug-axis helpers shown when `gameState.debugMode` is on.
 *
 * Adds a coloured `AxesHelper` plus six labelled sprites (X/-X/Y/-Y/
 * Z/-Z) and exposes the controller so visibility can be toggled when
 * the user opens or closes the debug overlay.
 */

import { getTHREE, getScene, AXIS_LENGTH, AXIS_LABEL_SIZE, AXIS_LABEL_OFFSET } from '../gameContext.js';

function createAxisLabel(text, position, color, group) {
	const THREE = getTHREE();
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	canvas.width = 128;
	canvas.height = 64;

	context.fillStyle = 'rgba(0, 0, 0, 0)';
	context.fillRect(0, 0, canvas.width, canvas.height);

	context.font = 'bold 40px Arial';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	context.fillStyle = `rgb(${r}, ${g}, ${b})`;
	context.fillText(text, canvas.width / 2, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	sprite.scale.set(AXIS_LABEL_SIZE * 2, AXIS_LABEL_SIZE, 1);
	group.add(sprite);
}

/**
 * Build the labelled axis helpers and add them to the scene.
 * Returns a controller with a `setVisible(boolean)` toggle so the
 * caller can hide/show them when debug mode changes.
 */
export function createLabeledAxisHelpers() {
	const THREE = getTHREE();
	const scene = getScene();

	const axesHelper = new THREE.AxesHelper(AXIS_LENGTH);
	axesHelper.name = 'axesHelper';
	scene.add(axesHelper);

	const labelsGroup = new THREE.Group();
	labelsGroup.name = 'axisLabels';
	scene.add(labelsGroup);

	createAxisLabel('X', new THREE.Vector3(AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	createAxisLabel('-X', new THREE.Vector3(-AXIS_LENGTH * AXIS_LABEL_OFFSET, 0, 0), 0xff0000, labelsGroup);
	createAxisLabel('Y', new THREE.Vector3(0, AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	createAxisLabel('-Y', new THREE.Vector3(0, -AXIS_LENGTH * AXIS_LABEL_OFFSET, 0), 0x00ff00, labelsGroup);
	createAxisLabel('Z', new THREE.Vector3(0, 0, AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);
	createAxisLabel('-Z', new THREE.Vector3(0, 0, -AXIS_LENGTH * AXIS_LABEL_OFFSET), 0x0000ff, labelsGroup);

	return {
		axesHelper,
		labelsGroup,
		setVisible(visible) {
			axesHelper.visible = visible;
			labelsGroup.visible = visible;
		},
	};
}

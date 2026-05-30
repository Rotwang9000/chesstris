/**
 * Check Alert — client-side UI for the deferred king-capture
 * window (see `server/king/checkService.js`).
 *
 * The defender player gets:
 *   • a full-screen "CHECK!" banner with a live countdown;
 *   • the camera glides to their king;
 *   • their tetris auto-fall is paused (handled in `gameLoop.js` —
 *     it reads `gameState.pendingCheck`);
 *   • any chess move that doesn't escape is rejected client-side
 *     before being sent to the server (the server enforces it too,
 *     but the local check gives instant feedback).
 *
 * The attacker player gets a compact "Threatening their king…"
 * indicator with the same countdown so they know the move is
 * locked in.
 *
 * Spectators see nothing intrusive — `pendingCheck` is in the
 * `game_update` payload so anyone watching can still render their
 * own subtle indicators if they want, but the banner is for the
 * two duelling players only.
 */

import { flyToPosition } from './setupCamera.js';
import { getCamera, getControls, getRenderer, getScene, getGameState, getTHREE } from './gameContext.js';
import { translatePosition } from './centreBoardMarker.js';

function playCheckSound(name) {
	// `playSound` is a global (non-module) helper attached by the
	// legacy sound bootstrapper. Use it if it's there; otherwise
	// stay silent — the banner pulse is already a strong cue.
	if (typeof window !== 'undefined' && typeof window.playSound === 'function') {
		try { window.playSound(name); } catch (_e) { /* best-effort */ }
	}
}

const BANNER_ID = 'check-alert-banner';
const COUNTDOWN_ID = 'check-alert-countdown';
const STYLE_ID = 'check-alert-style';
const POLL_INTERVAL_MS = 250;

let countdownTimer = null;
let lastCheckSig = '';
let cameraFlown = false;

function ensureStyle() {
	if (document.getElementById(STYLE_ID)) return;
	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `
		#${BANNER_ID} {
			position: fixed;
			top: 18%;
			left: 50%;
			transform: translateX(-50%);
			background: linear-gradient(180deg, rgba(160, 0, 0, 0.95) 0%, rgba(80, 0, 0, 0.95) 100%);
			color: #fff;
			padding: 18px 32px;
			border: 3px solid #ffd24c;
			border-radius: 14px;
			box-shadow: 0 0 40px rgba(255, 80, 80, 0.85), 0 6px 18px rgba(0, 0, 0, 0.6);
			text-align: center;
			z-index: 12000;
			font-family: 'Playfair Display', 'Times New Roman', serif;
			pointer-events: none;
			animation: check-alert-pulse 1.2s ease-in-out infinite;
		}
		#${BANNER_ID} .ca-title {
			font-size: 36px;
			font-weight: bold;
			letter-spacing: 0.05em;
			text-shadow: 0 0 8px rgba(255, 200, 100, 0.7);
		}
		#${BANNER_ID} .ca-subtitle {
			margin-top: 6px;
			font-size: 16px;
			opacity: 0.92;
		}
		#${BANNER_ID} .ca-countdown {
			margin-top: 10px;
			font-size: 48px;
			font-weight: bold;
			color: #ffd24c;
			text-shadow: 0 0 12px rgba(255, 210, 76, 0.8);
		}
		#${BANNER_ID}.attacker {
			top: auto;
			bottom: 22%;
			background: linear-gradient(180deg, rgba(60, 60, 60, 0.92) 0%, rgba(20, 20, 20, 0.92) 100%);
			border-color: #999;
			box-shadow: 0 0 16px rgba(255, 255, 255, 0.2);
		}
		#${BANNER_ID}.attacker .ca-title { font-size: 22px; }
		#${BANNER_ID}.attacker .ca-countdown { font-size: 28px; color: #fff; }
		@keyframes check-alert-pulse {
			0%, 100% { box-shadow: 0 0 40px rgba(255, 80, 80, 0.85), 0 6px 18px rgba(0, 0, 0, 0.6); }
			50% { box-shadow: 0 0 70px rgba(255, 160, 80, 1.0), 0 6px 18px rgba(0, 0, 0, 0.6); }
		}
	`;
	document.head.appendChild(style);
}

function ensureBanner(role) {
	let el = document.getElementById(BANNER_ID);
	if (!el) {
		ensureStyle();
		el = document.createElement('div');
		el.id = BANNER_ID;
		el.innerHTML = `
			<div class="ca-title"></div>
			<div class="ca-subtitle"></div>
			<div class="ca-countdown" id="${COUNTDOWN_ID}"></div>
		`;
		document.body.appendChild(el);
	}
	el.classList.toggle('attacker', role === 'attacker');
	return el;
}

function destroyBanner() {
	const el = document.getElementById(BANNER_ID);
	if (el && el.parentNode) el.parentNode.removeChild(el);
	if (countdownTimer) {
		clearInterval(countdownTimer);
		countdownTimer = null;
	}
}

function formatCountdown(ms) {
	if (!Number.isFinite(ms) || ms <= 0) return '0.0';
	const seconds = ms / 1000;
	return seconds >= 10 ? Math.ceil(seconds).toString() : seconds.toFixed(1);
}

function startCountdown(deadlineAt) {
	if (countdownTimer) clearInterval(countdownTimer);
	const render = () => {
		const remaining = deadlineAt - Date.now();
		const el = document.getElementById(COUNTDOWN_ID);
		if (!el) return;
		el.textContent = formatCountdown(Math.max(0, remaining));
		if (remaining <= 0 && countdownTimer) {
			clearInterval(countdownTimer);
			countdownTimer = null;
		}
	};
	render();
	countdownTimer = setInterval(render, 100);
}

function flyCameraToKing(pendingCheck) {
	if (cameraFlown) return;
	cameraFlown = true;
	try {
		const camera = getCamera();
		const controls = getControls();
		const renderer = getRenderer();
		const scene = getScene();
		const gameState = getGameState();
		if (!camera || !controls || !renderer || !scene) return;
		const kingPos = pendingCheck && pendingCheck.kingPos;
		if (!kingPos) return;
		const abs = translatePosition({ x: kingPos.x, z: kingPos.z }, gameState, true);
		const lookAt = { x: abs.x, y: 0.5, z: abs.z };
		const cameraPos = {
			x: abs.x,
			y: 8,
			z: abs.z + 7,
		};
		flyToPosition(camera, controls, cameraPos, lookAt, renderer, scene);
	} catch (e) {
		console.warn('[Check] camera fly failed:', e);
	}
}

// ── On-board "battle" markers ───────────────────────────────────────────────
// A banner alone wasn't enough: the user wants it obvious on the board
// that the attacker and the threatened king are locked in combat (the
// attacking piece itself doesn't move during the check). We draw a
// pulsing ring under each combatant, a glowing tension beam between
// them, and a bobbing crossed-swords marker at the midpoint. Visible to
// every player (attacker, defender, spectator) so the clash reads at a
// glance. Cleaned up the instant the check resolves.

let battleGroup = null;
const battleTweens = [];

function makeSwordsTexture(THREE) {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = 128;
		canvas.height = 128;
		const cx = canvas.getContext('2d');
		if (!cx) return null;
		cx.clearRect(0, 0, 128, 128);
		cx.font = '92px serif';
		cx.textAlign = 'center';
		cx.textBaseline = 'middle';
		cx.shadowColor = 'rgba(255, 200, 80, 0.9)';
		cx.shadowBlur = 12;
		cx.fillText('⚔️', 64, 70);
		const tex = new THREE.CanvasTexture(canvas);
		tex.needsUpdate = true;
		return tex;
	} catch (_e) {
		return null;
	}
}

function startPulse(target, prop, from, to, duration) {
	if (!window.TWEEN) return null;
	const data = { v: from };
	const tween = new window.TWEEN.Tween(data)
		.to({ v: to }, duration)
		.easing(window.TWEEN.Easing.Quadratic.InOut)
		.yoyo(true)
		.repeat(Infinity)
		.onUpdate(() => { try { prop(target, data.v); } catch (_e) { /* ignore */ } })
		.start();
	battleTweens.push(tween);
	return tween;
}

function buildBattleRing(THREE, abs, colour) {
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(0.32, 0.6, 36),
		new THREE.MeshBasicMaterial({
			color: colour, transparent: true, opacity: 0.85,
			side: THREE.DoubleSide, depthTest: false, depthWrite: false,
		}),
	);
	ring.rotation.x = -Math.PI / 2;
	ring.position.set(abs.x, 0.5, abs.z);
	ring.renderOrder = 1000;
	startPulse(ring, (t, v) => t.scale.set(v, v, 1), 0.85, 1.25, 620);
	return ring;
}

function destroyBattleVisual() {
	while (battleTweens.length) {
		const t = battleTweens.pop();
		try { if (t && typeof t.stop === 'function') t.stop(); } catch (_e) { /* ignore */ }
	}
	if (!battleGroup) return;
	const scene = getScene();
	try {
		battleGroup.traverse((obj) => {
			if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
			if (obj.material) {
				if (obj.material.map && typeof obj.material.map.dispose === 'function') obj.material.map.dispose();
				if (typeof obj.material.dispose === 'function') obj.material.dispose();
			}
		});
		if (scene) scene.remove(battleGroup);
	} catch (_e) { /* best-effort teardown */ }
	battleGroup = null;
}

function createBattleVisual(pendingCheck) {
	destroyBattleVisual();
	try {
		const THREE = getTHREE();
		const scene = getScene();
		const gameState = getGameState();
		if (!THREE || !scene || !pendingCheck) return;

		const from = pendingCheck.attackerFrom || pendingCheck.attackerTo;
		const king = pendingCheck.kingPos || pendingCheck.attackerTo;
		if (!from || !king) return;

		const aAbs = translatePosition({ x: from.x, z: from.z }, gameState, true);
		const kAbs = translatePosition({ x: king.x, z: king.z }, gameState, true);
		if (!aAbs || !kAbs) return;

		const group = new THREE.Group();
		group.name = 'checkBattleVisual';

		// Combatant rings: amber under the attacker, red under the king.
		group.add(buildBattleRing(THREE, aAbs, 0xFFB300));
		group.add(buildBattleRing(THREE, kAbs, 0xFF3344));

		// Tension beam between them — a thin glowing bar aligned along the
		// attacker→king vector. A box reads more reliably than a 1px line.
		const dx = kAbs.x - aAbs.x;
		const dz = kAbs.z - aAbs.z;
		const length = Math.max(0.001, Math.hypot(dx, dz));
		const beam = new THREE.Mesh(
			new THREE.BoxGeometry(length, 0.06, 0.06),
			new THREE.MeshBasicMaterial({
				color: 0xFF8844, transparent: true, opacity: 0.6,
				depthTest: false, depthWrite: false,
			}),
		);
		beam.position.set((aAbs.x + kAbs.x) / 2, 0.72, (aAbs.z + kAbs.z) / 2);
		beam.rotation.y = -Math.atan2(dz, dx);
		beam.renderOrder = 1000;
		startPulse(beam, (t, v) => { t.material.opacity = v; }, 0.25, 0.85, 480);
		group.add(beam);

		// Crossed-swords marker bobbing over the midpoint.
		const tex = makeSwordsTexture(THREE);
		if (tex) {
			const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
				map: tex, transparent: true, depthTest: false, depthWrite: false,
			}));
			sprite.scale.set(1.3, 1.3, 1.3);
			const midX = (aAbs.x + kAbs.x) / 2;
			const midZ = (aAbs.z + kAbs.z) / 2;
			sprite.position.set(midX, 1.5, midZ);
			sprite.renderOrder = 1001;
			startPulse(sprite, (t, v) => { t.position.y = v; }, 1.4, 1.75, 700);
			group.add(sprite);
		}

		scene.add(group);
		battleGroup = group;
	} catch (e) {
		console.warn('[Check] battle visual failed:', e);
	}
}

function describePieceType(type) {
	if (!type) return 'piece';
	const t = String(type).toLowerCase();
	return t.charAt(0).toUpperCase() + t.slice(1);
}

function renderBanner(role, pendingCheck) {
	const banner = ensureBanner(role);
	const titleEl = banner.querySelector('.ca-title');
	const subEl = banner.querySelector('.ca-subtitle');
	if (role === 'defender') {
		titleEl.textContent = 'CHECK!';
		subEl.textContent = 'Your king is in danger — move to safety or capture the attacker';
		playCheckSound('alert');
	} else {
		titleEl.textContent = 'Threatening their king…';
		const attackType = describePieceType(pendingCheck.attackerPieceType);
		subEl.textContent = `Your ${attackType} is committed — wait for them to react`;
	}
	startCountdown(pendingCheck.deadlineAt);
}

/**
 * Reconcile UI with the server's current `pendingCheck`. Called
 * from the game-update event AND from a slow polling loop so a
 * dropped `chess_check` socket event still surfaces in the UI.
 */
function reconcile(pendingCheck) {
	const gameState = getGameState();
	if (!gameState) return;
	const selfId = gameState.localPlayerId
		|| gameState.currentPlayer
		|| gameState.playerId
		|| null;

	if (!pendingCheck) {
		if (lastCheckSig) {
			destroyBanner();
			destroyBattleVisual();
			cameraFlown = false;
			lastCheckSig = '';
		}
		gameState.pendingCheck = null;
		return;
	}

	gameState.pendingCheck = pendingCheck;
	const sig = `${pendingCheck.defenderId}:${pendingCheck.attackerId}:${pendingCheck.startedAt}`;
	if (sig === lastCheckSig) return;
	lastCheckSig = sig;
	cameraFlown = false;

	// The on-board clash markers are for everyone watching the board —
	// attacker, defender and spectators — so build them regardless of role.
	createBattleVisual(pendingCheck);

	let role = null;
	if (selfId && String(selfId) === String(pendingCheck.defenderId)) role = 'defender';
	else if (selfId && String(selfId) === String(pendingCheck.attackerId)) role = 'attacker';

	if (role) {
		renderBanner(role, pendingCheck);
		if (role === 'defender') flyCameraToKing(pendingCheck);
	}
}

export function onCheckGameUpdate(payload) {
	if (!payload) return;
	if (payload.pendingCheck !== undefined) {
		reconcile(payload.pendingCheck);
	}
}

export function onCheckStart(payload) {
	reconcile(payload);
}

export function onCheckClear() {
	reconcile(null);
}

export function onCheckExpired() {
	reconcile(null);
}

export function isDefenderInCheck() {
	const gameState = getGameState();
	if (!gameState || !gameState.pendingCheck) return false;
	const selfId = gameState.localPlayerId
		|| gameState.currentPlayer
		|| gameState.playerId
		|| null;
	return selfId && String(gameState.pendingCheck.defenderId) === String(selfId);
}

let pollHandle = null;
export function initCheckAlert() {
	if (pollHandle) return;
	pollHandle = setInterval(() => {
		const gameState = getGameState();
		if (!gameState) return;
		// Server-side `pendingCheck` is the source of truth; the
		// game_update payload writes it onto gameState, and we just
		// re-render to catch any banner DOM that got torn down by
		// the page (e.g. someone closed the toast wrapper).
		reconcile(gameState.pendingCheck || null);
	}, POLL_INTERVAL_MS);
}

/**
 * The woodcut: a painting drawn on the spot when there is no real one.
 *
 * The catalogue grows a picture at a time, and a file can be slow or
 * fail to load, so every moment needs something worthy of the frame.
 * This draws a small tapestry-like woodcut in the paintings' palette —
 * slate sky in cut lines, a low ochre sun, sea-green waves, a pebbled
 * shore — with the two pieces as bold cut-out silhouettes: the
 * attacker under a madder-red banner, the victim toppling.
 *
 * Each scene is seeded by its slot id, so "knight takes bishop" always
 * looks the same, as a painting would.
 */

const PALETTE = Object.freeze({
	slate: '#4b5e74',
	slateDeep: '#2b394a',
	sea: '#3f7a6c',
	seaLight: '#69a08d',
	ochre: '#c9963b',
	ochreLight: '#e0b764',
	bone: '#ece2cb',
	madder: '#9b2a2a',
	ink: '#1c1d22',
});

// Filled chess glyphs: one silhouette per piece.
const GLYPHS = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
const GLYPH_FONT = '"DejaVu Sans", "Segoe UI Symbol", "Noto Sans Symbols 2", "Apple Symbols", serif';

const W = 600;
const H = 400;

/** Small seeded PRNG (mulberry32) keyed by a string. */
function seededRandom(seedText) {
	let h = 1779033703 ^ String(seedText).length;
	for (let i = 0; i < String(seedText).length; i++) {
		h = Math.imul(h ^ String(seedText).charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	return () => {
		a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function drawSky(ctx, rnd, horizon) {
	ctx.fillStyle = PALETTE.slate;
	ctx.fillRect(0, 0, W, horizon);
	// Woodcut sky: cut lines, close near the horizon, opening upwards.
	ctx.strokeStyle = PALETTE.bone;
	for (let y = horizon - 6, gap = 4; y > 0; y -= gap, gap *= 1.11) {
		ctx.lineWidth = Math.max(0.6, 2.2 - gap / 9);
		ctx.globalAlpha = 0.35;
		ctx.beginPath();
		let x = -10;
		ctx.moveTo(x, y);
		while (x < W + 10) {
			x += 18 + rnd() * 30;
			ctx.lineTo(x, y + (rnd() - 0.5) * 1.6);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

function drawSun(ctx, rnd, cx, cy, r, { setting = false } = {}) {
	ctx.save();
	ctx.strokeStyle = PALETTE.ochreLight;
	ctx.lineWidth = 2;
	ctx.globalAlpha = setting ? 0.45 : 0.7;
	for (let i = 0; i < 28; i++) {
		const a = Math.PI + (i / 27) * Math.PI;
		const inner = r * 1.25;
		const outer = r * (1.9 + (i % 2) * 0.6 + rnd() * 0.2);
		ctx.beginPath();
		ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
		ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	ctx.fillStyle = setting ? PALETTE.ochre : PALETTE.ochreLight;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = PALETTE.ochre;
	ctx.lineWidth = 1.5;
	for (let k = 0.45; k < 1; k += 0.25) {
		ctx.beginPath();
		ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
		ctx.stroke();
	}
	ctx.restore();
}

function drawFjord(ctx, rnd, horizon) {
	// Two ranges of cut-paper fells, the far one paler, rising towards
	// the edges so the sea opens out in the middle like a fjord mouth.
	const ranges = [
		{ colour: '#3d4e63', height: 0.5, step: 120 },
		{ colour: PALETTE.slateDeep, height: 0.62, step: 90 },
	];
	for (const range of ranges) {
		ctx.fillStyle = range.colour;
		ctx.beginPath();
		ctx.moveTo(0, horizon);
		const peaks = [];
		let x = -20;
		while (x < W + 20) {
			const nx = x + range.step * (0.7 + rnd() * 0.6);
			const mid = (x + nx) / 2;
			const edge = Math.abs(mid / W - 0.5) * 2;   // 0 centre … 1 edges
			const rise = horizon * range.height * (0.25 + 0.75 * edge * edge) * (0.75 + rnd() * 0.4);
			const peak = { x: mid + (rnd() - 0.5) * 20, y: horizon - rise };
			ctx.lineTo(peak.x, peak.y);
			ctx.lineTo(nx, horizon - rise * (0.35 + rnd() * 0.2));
			peaks.push(peak);
			x = nx;
		}
		ctx.lineTo(W, horizon);
		ctx.closePath();
		ctx.fill();
		// Snow on the near range's tall peaks, cut as bone chevrons.
		if (range.colour !== PALETTE.slateDeep) continue;
		ctx.fillStyle = PALETTE.bone;
		ctx.globalAlpha = 0.75;
		for (const p of peaks) {
			if (horizon - p.y < horizon * 0.3) continue;
			const s = 7 + rnd() * 5;
			ctx.beginPath();
			ctx.moveTo(p.x, p.y);
			ctx.lineTo(p.x + s, p.y + s * 1.3);
			ctx.lineTo(p.x + s * 0.3, p.y + s * 0.9);
			ctx.lineTo(p.x - s * 0.2, p.y + s * 1.4);
			ctx.lineTo(p.x - s * 0.8, p.y + s * 1.1);
			ctx.closePath();
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}
}

/** A few gulls, cut as ink chevrons. */
function drawGulls(ctx, rnd, horizon) {
	ctx.save();
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 1.8;
	ctx.lineCap = 'round';
	const count = 3 + Math.floor(rnd() * 3);
	for (let i = 0; i < count; i++) {
		const x = W * (0.4 + rnd() * 0.5);
		const y = horizon * (0.15 + rnd() * 0.4);
		const s = 5 + rnd() * 5;
		ctx.beginPath();
		ctx.moveTo(x - s, y - s * 0.3);
		ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
		ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.3);
		ctx.stroke();
	}
	ctx.restore();
}

function drawSea(ctx, rnd, top, bottom) {
	ctx.fillStyle = PALETTE.sea;
	ctx.fillRect(0, top, W, bottom - top);
	// Curling wave cuts, rows growing towards the viewer.
	ctx.strokeStyle = PALETTE.bone;
	ctx.lineCap = 'round';
	let row = 0;
	for (let y = top + 6; y < bottom - 2; y += 7 + row * 1.6, row++) {
		const size = 5 + row * 1.6;
		ctx.lineWidth = 0.8 + row * 0.25;
		ctx.globalAlpha = 0.5;
		for (let x = -size + (row % 2) * size; x < W + size; x += size * 2.4 + rnd() * size) {
			ctx.beginPath();
			ctx.arc(x, y, size, Math.PI * 1.05, Math.PI * 1.85);
			ctx.stroke();
		}
	}
	ctx.globalAlpha = 1;
	ctx.fillStyle = PALETTE.seaLight;
	ctx.fillRect(0, top, W, 2);
}

function drawShore(ctx, rnd, top) {
	const grad = ctx.createLinearGradient(0, top, 0, H);
	grad.addColorStop(0, PALETTE.ochre);
	grad.addColorStop(1, '#a87a30');
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.moveTo(0, top + 10);
	for (let x = 0; x <= W; x += 30) ctx.lineTo(x, top + Math.sin(x / 70) * 6 + rnd() * 4);
	ctx.lineTo(W, H);
	ctx.lineTo(0, H);
	ctx.closePath();
	ctx.fill();
	// Foam line and pebbles.
	ctx.strokeStyle = PALETTE.bone;
	ctx.lineWidth = 2;
	ctx.globalAlpha = 0.8;
	ctx.beginPath();
	for (let x = 0; x <= W; x += 12) ctx.lineTo(x, top + Math.sin(x / 70) * 6 + 2 + rnd() * 2);
	ctx.stroke();
	ctx.globalAlpha = 0.45;
	ctx.fillStyle = PALETTE.ink;
	for (let i = 0; i < 260; i++) {
		const y = top + 14 + rnd() * (H - top - 14);
		const x = rnd() * W;
		ctx.beginPath();
		ctx.ellipse(x, y, 1 + rnd() * 2.2, 0.8 + rnd() * 1.2, 0, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}

function drawLongship(ctx, x, y, scale) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	// Sail: madder and bone stripes.
	ctx.fillStyle = PALETTE.bone;
	ctx.fillRect(-34, -92, 68, 58);
	ctx.fillStyle = PALETTE.madder;
	for (let i = 0; i < 4; i++) ctx.fillRect(-34 + i * 17, -92, 8.5, 58);
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 3;
	ctx.strokeRect(-34, -92, 68, 58);
	ctx.beginPath();
	ctx.moveTo(0, -100);
	ctx.lineTo(0, -6);
	ctx.stroke();
	// Hull with a dragon prow and a coiled stern.
	ctx.fillStyle = PALETTE.ink;
	ctx.beginPath();
	ctx.moveTo(-90, -18);
	ctx.quadraticCurveTo(-100, -40, -92, -58);
	ctx.quadraticCurveTo(-80, -64, -82, -50);
	ctx.quadraticCurveTo(-88, -36, -74, -24);
	ctx.lineTo(74, -24);
	ctx.quadraticCurveTo(90, -36, 86, -56);
	ctx.quadraticCurveTo(98, -62, 100, -48);
	ctx.quadraticCurveTo(102, -26, 88, -12);
	ctx.quadraticCurveTo(0, 14, -90, -18);
	ctx.closePath();
	ctx.fill();
	// Shields along the gunwale.
	for (let i = -60; i <= 60; i += 16) {
		ctx.fillStyle = (i / 16) % 2 === 0 ? PALETTE.ochreLight : PALETTE.bone;
		ctx.beginPath();
		ctx.arc(i, -22, 6, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

function drawBanner(ctx, x, baseY, height, { fallen = false } = {}) {
	ctx.save();
	ctx.translate(x, baseY);
	if (fallen) ctx.rotate(-1.25);
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 4;
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(0, -height);
	ctx.stroke();
	ctx.fillStyle = PALETTE.madder;
	ctx.beginPath();
	ctx.moveTo(2, -height);
	ctx.lineTo(48, -height + 8);
	ctx.lineTo(34, -height + 20);
	ctx.lineTo(50, -height + 32);
	ctx.lineTo(2, -height + 38);
	ctx.closePath();
	ctx.fill();
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.restore();
}

/** A piece as a bold cut-out: bone halo, ink body, optional tilt. */
function drawPiece(ctx, type, x, baseY, size, { tilt = 0, tone = PALETTE.ink, ground = 0 } = {}) {
	const glyph = GLYPHS[type] || GLYPHS.pawn;
	ctx.save();
	ctx.translate(x, baseY);
	// Shadow on the sand (`ground` below the pivot), under the body
	// however far it leans.
	ctx.fillStyle = 'rgba(28, 29, 34, 0.35)';
	ctx.beginPath();
	ctx.ellipse(Math.sin(tilt) * size * 0.4, ground - size * 0.03, size * (0.34 + Math.abs(Math.sin(tilt)) * 0.12),
		size * 0.06, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.rotate(tilt);
	ctx.font = `${size}px ${GLYPH_FONT}`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = PALETTE.bone;
	ctx.lineWidth = Math.max(4, size / 18);
	ctx.strokeText(glyph, 0, -size * 0.04);
	ctx.fillStyle = tone;
	ctx.fillText(glyph, 0, -size * 0.04);
	ctx.restore();
}

function drawCrown(ctx, x, y) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(1.7, 1.7);
	ctx.rotate(-0.25);
	ctx.translate(-x, -y);
	ctx.fillStyle = PALETTE.ochreLight;
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(x - 18, y);
	ctx.lineTo(x - 18, y - 12);
	ctx.lineTo(x - 9, y - 5);
	ctx.lineTo(x, y - 16);
	ctx.lineTo(x + 9, y - 5);
	ctx.lineTo(x + 18, y - 12);
	ctx.lineTo(x + 18, y);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

/** Fine chisel marks over everything: the grain of the block. */
function drawGrain(ctx, rnd) {
	ctx.save();
	ctx.strokeStyle = PALETTE.ink;
	ctx.globalAlpha = 0.07;
	ctx.lineWidth = 1;
	for (let i = 0; i < 420; i++) {
		const x = rnd() * W;
		const y = rnd() * H;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x + 4 + rnd() * 10, y + (rnd() - 0.5) * 2);
		ctx.stroke();
	}
	ctx.restore();
	// Double rule round the block, as a printed border.
	ctx.strokeStyle = PALETTE.ink;
	ctx.lineWidth = 3;
	ctx.strokeRect(6, 6, W - 12, H - 12);
	ctx.lineWidth = 1;
	ctx.strokeRect(12, 12, W - 24, H - 24);
}

/**
 * Draw the woodcut for a moment.
 *
 * @param {Object} moment  { kind, attackerType?, victimType?, pieceType?, outcome? }
 * @param {Object} [opts]
 * @param {string} [opts.seed]   stable seed, normally the first slot id
 * @param {string} [opts.label]  accessible description of the scene
 * @returns {HTMLCanvasElement}
 */
export function drawWoodcut(moment, { seed = 'tetches', label = '' } = {}) {
	const canvas = document.createElement('canvas');
	const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
	canvas.width = Math.round(W * dpr);
	canvas.height = Math.round(H * dpr);
	canvas.setAttribute('role', 'img');
	if (label) canvas.setAttribute('aria-label', label);
	const ctx = canvas.getContext && canvas.getContext('2d');
	if (!ctx) return canvas;   // no canvas (tests): the caption carries it
	ctx.scale(dpr, dpr);

	const rnd = seededRandom(seed);
	const horizon = H * 0.5;
	const shoreTop = H * 0.72;
	const kind = moment?.kind;
	const defeat = kind === 'battle' && moment.outcome !== 'victory';

	ctx.fillStyle = PALETTE.bone;
	ctx.fillRect(0, 0, W, H);
	drawSky(ctx, rnd, horizon);
	drawSun(ctx, rnd, W * (defeat ? 0.8 : 0.22), horizon - (defeat ? 8 : 46), defeat ? 22 : 30, { setting: defeat });
	drawFjord(ctx, rnd, horizon);
	if (!defeat) drawGulls(ctx, rnd, horizon);
	drawSea(ctx, rnd, horizon, shoreTop + 6);
	drawShore(ctx, rnd, shoreTop);

	const base = H * 0.93;
	const big = H * 0.5;
	if (kind === 'capture' || kind === 'kingfall') {
		const victim = kind === 'kingfall' ? 'king' : (moment.victimType || 'pawn');
		drawBanner(ctx, W * 0.2, base - 8, big * 1.05);
		drawPiece(ctx, moment.attackerType || 'knight', W * 0.33, base, big);
		if (kind === 'kingfall') {
			// The king lies where he fell, his crown rolled from him.
			drawPiece(ctx, victim, W * 0.55, base - big * 0.36, big * 0.85,
				{ tilt: 1.45, tone: PALETTE.slateDeep, ground: big * 0.36 });
			drawCrown(ctx, W * 0.9, base - 8);
		} else {
			drawPiece(ctx, victim, W * 0.68, base, big * 0.92, { tilt: 0.34, tone: PALETTE.slateDeep });
		}
	} else if (kind === 'arrival') {
		drawLongship(ctx, W * 0.68, shoreTop + 10, 1.4);
		drawPiece(ctx, moment.pieceType || 'queen', W * 0.3, base, big);
		drawBanner(ctx, W * 0.15, base - 8, big);
	} else if (kind === 'ship') {
		// Longship scenes: the ship on the water, and the piece aboard or
		// stepping ashore when there is one.
		const sinking = moment.scene === 'lost' || moment.scene === 'emptysunk';
		drawLongship(ctx, W * 0.6, shoreTop + (sinking ? 22 : 10), 1.5);
		if (moment.pieceType && !sinking) drawPiece(ctx, moment.pieceType, W * 0.24, base, big * 0.9);
		drawBanner(ctx, W * 0.1, base - 8, big * 0.9, { fallen: sinking });
	} else if (kind === 'battle') {
		if (defeat) {
			drawBanner(ctx, W * 0.36, base - 4, big * 1.1, { fallen: true });
			drawPiece(ctx, 'king', W * 0.58, base, big, { tilt: 0.22, tone: PALETTE.slateDeep });
		} else {
			drawBanner(ctx, W * 0.12, base - 8, big * 1.1);
			drawBanner(ctx, W * 0.84, base - 8, big * 1.1);
			drawPiece(ctx, 'king', W * 0.36, base, big * 1.05);
			drawPiece(ctx, 'queen', W * 0.63, base, big * 0.95);
		}
	}
	drawGrain(ctx, rnd);
	return canvas;
}

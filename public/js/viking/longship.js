// Procedural Viking longship, built plank by plank ("strake" construction).
// Three.js r132 core only. No imports. Deterministic (seeded noise only).
//
//   buildLongship(THREE, { sailColour: 0xb3261e, stripeColour?: 0xe6dbbd, detail: 'high' | 'low' }) -> THREE.Group
//
// Origin at the waterline amidships, +Y up, bow towards +Z.
// group.userData.oars    : InstancedMesh, one instance per oar (local +X runs outboard from the oar port)
// group.userData.oarData : [{ pivot:[x,y,z], side:+1|-1, yaw, dip }] rest pose of every instance
// group.userData.sail    : the sail Mesh
// group.userData.pennant : the masthead pennant Mesh

const __longshipTexCache = new WeakMap();

// Cheap cloth translucency for the sail material (see buildLongship).
function sailTranslucency(shader) {
	shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * 0.24;');
}
function sailProgramKey() {
	return 'longship-sail-v1';
}

export function buildLongship(THREE, opts) {
	opts = opts || {};
	const sailHex = (typeof opts.sailColour === 'number') ? opts.sailColour : 0xb3261e;
	const LOW = opts.detail === 'low';
	const V3 = THREE.Vector3;

	// ------------------------------------------------------------------ utils
	const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
	const lerp = (a, b, t) => a + (b - a) * t;
	const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
	const tri = (t) => { t = ((t % 2) + 2) % 2; return t < 1 ? t : 2 - t; };
	function rng(seed) {
		let a = seed >>> 0;
		return function () {
			a = (a + 0x6D2B79F5) | 0;
			let t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}
	const mulCol = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
	const mixCol = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

	// ------------------------------------------------------------------ geometry accumulator (our own "merge")
	function Acc() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
	Acc.prototype.vcount = function () { return this.p.length / 3; };
	Acc.prototype.vert = function (x, y, z, nx, ny, nz, u, v, c) {
		this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(c[0], c[1], c[2]);
	};
	// Append any core BufferGeometry, transformed, recoloured and re-UV'd.
	Acc.prototype.addGeo = function (geo, o) {
		o = o || {};
		if (!geo.attributes.normal) geo.computeVertexNormals();
		const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
		const m = o.matrix || null;
		let flip = false, nm = null;
		if (m) { nm = new THREE.Matrix3().getNormalMatrix(m); flip = m.determinant() < 0; }
		const base = this.vcount();
		const v = new V3(), n = new V3();
		const col = o.col || [1, 1, 1];
		const cfn = typeof col === 'function' ? col : null;
		for (let k = 0; k < pos.count; k++) {
			v.fromBufferAttribute(pos, k); n.fromBufferAttribute(nor, k);
			const lx = v.x, ly = v.y, lz = v.z;
			if (m) { v.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
			let uu = uv ? uv.getX(k) : 0, vv = uv ? uv.getY(k) : 0;
			if (o.uv) { const r = o.uv(uu, vv, lx, ly, lz, v); uu = r[0]; vv = r[1]; }
			const cc = cfn ? cfn(v, lx, ly, lz) : col;
			this.vert(v.x, v.y, v.z, n.x, n.y, n.z, uu, vv, cc);
		}
		const idx = geo.index;
		const cnt = idx ? idx.count : pos.count;
		for (let k = 0; k < cnt; k += 3) {
			const a = idx ? idx.getX(k) : k, b = idx ? idx.getX(k + 1) : k + 1, c = idx ? idx.getX(k + 2) : k + 2;
			if (flip) this.i.push(base + a, base + c, base + b); else this.i.push(base + a, base + b, base + c);
		}
		geo.dispose();
		return this;
	};
	// A quad grid: rows[r][c] are Vector3. Smooth normals. `hint` is a rough outward direction at the middle.
	Acc.prototype.addGrid = function (rows, uvFn, col, hint, wrapR) {
		const R = rows.length, C = rows[0].length, base = this.vcount();
		const N = new Float32Array(R * C * 3);
		const e1 = new V3(), e2 = new V3(), fn = new V3();
		const addN = (r, c) => { const k = (r * C + c) * 3; N[k] += fn.x; N[k + 1] += fn.y; N[k + 2] += fn.z; };
		for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
			const a = rows[r][c], b = rows[r][c + 1], d = rows[r + 1][c], e = rows[r + 1][c + 1];
			e1.subVectors(b, a); e2.subVectors(d, a); fn.crossVectors(e1, e2); addN(r, c); addN(r, c + 1); addN(r + 1, c);
			e1.subVectors(e, b); e2.subVectors(d, b); fn.crossVectors(e1, e2); addN(r, c + 1); addN(r + 1, c + 1); addN(r + 1, c);
		}
		if (wrapR) for (let c = 0; c < C; c++) {
			const k0 = c * 3, k1 = ((R - 1) * C + c) * 3;
			for (let q = 0; q < 3; q++) { const s = N[k0 + q] + N[k1 + q]; N[k0 + q] = s; N[k1 + q] = s; }
		}
		let flip = false;
		if (hint) {
			const rm = Math.floor((R - 1) / 2), cm = Math.floor((C - 1) / 2), k = (rm * C + cm) * 3;
			flip = (N[k] * hint.x + N[k + 1] * hint.y + N[k + 2] * hint.z) < 0;
		}
		const sg = flip ? -1 : 1;
		const cfn = typeof col === 'function' ? col : null;
		for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
			const k = (r * C + c) * 3, p = rows[r][c];
			let nx = N[k] * sg, ny = N[k + 1] * sg, nz = N[k + 2] * sg;
			const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
			if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
			const uv = uvFn ? uvFn(r, c, p) : [0, 0];
			this.vert(p.x, p.y, p.z, nx, ny, nz, uv[0], uv[1], cfn ? cfn(p, r, c) : col);
		}
		for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
			const a = base + r * C + c, b = a + 1, d = a + C, e = d + 1;
			if (flip) this.i.push(a, d, b, b, d, e); else this.i.push(a, b, d, b, e, d);
		}
		return this;
	};
	// Sweep a 2D section (CCW in the frame's (a,b) plane) along frames [{p,a,b,t,len,sa,sb}].
	Acc.prototype.addSweep = function (frames, section, o) {
		o = o || {};
		const F = frames.length, S = section.length;
		const band = o.band || BAND_PLAIN, uS = o.uScale === undefined ? U_PER_UNIT : o.uScale, uO = o.uOff || 0;
		const lo = band[0], hi = band[1];
		const pt = (f, s) => new V3().copy(f.p)
			.addScaledVector(f.a, s[0] * (f.sa === undefined ? 1 : f.sa))
			.addScaledVector(f.b, s[1] * (f.sb === undefined ? 1 : f.sb));
		const fm = frames[Math.floor((F - 1) / 2)];
		const cen = (f) => { const c = new V3(); for (let k = 0; k < S; k++) c.add(pt(f, section[k])); return c.multiplyScalar(1 / S); };
		const cm = cen(fm);
		if (o.hard) {
			for (let k = 0; k < S; k++) {
				const s0 = section[k], s1 = section[(k + 1) % S];
				const r0 = frames.map(f => pt(f, s0)), r1 = frames.map(f => pt(f, s1));
				const hint = pt(fm, s0).add(pt(fm, s1)).multiplyScalar(0.5).sub(cm);
				const bd = (o.sideBands && o.sideBands[k]) || band;
				const v0 = (k % 2) ? bd[1] : bd[0], v1 = (k % 2) ? bd[0] : bd[1];
				this.addGrid([r0, r1], (r, c) => [frames[c].len * uS + uO, r ? v1 : v0], (o.sideCols && o.sideCols[k]) || o.col, hint);
			}
		} else {
			const rows = [];
			for (let k = 0; k <= S; k++) { const s = section[k % S]; rows.push(frames.map(f => pt(f, s))); }
			const km = Math.floor(S / 2);
			const hint = pt(fm, section[km % S]).sub(cm);
			this.addGrid(rows, (r, c) => [frames[c].len * uS + uO, lo + (hi - lo) * tri(2 * r / S)], o.col, hint, true);
		}
		const cap = (f, dirSign) => {
			const c = cen(f), base = this.vcount(), nrm = new V3().copy(f.t).multiplyScalar(dirSign);
			const cc = typeof o.col === 'function' ? o.col(c) : (o.col || [1, 1, 1]);
			this.vert(c.x, c.y, c.z, nrm.x, nrm.y, nrm.z, f.len * uS + uO, (lo + hi) / 2, cc);
			const ring = section.map(s => pt(f, s));
			for (let k = 0; k < S; k++) { const p = ring[k]; this.vert(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, f.len * uS + uO + 0.01, k % 2 ? hi : lo, cc); }
			const e1 = new V3().subVectors(ring[0], c), e2 = new V3().subVectors(ring[1], c);
			const fl = e1.cross(e2).dot(nrm) < 0;
			for (let k = 0; k < S; k++) {
				const a = base + 1 + k, b = base + 1 + (k + 1) % S;
				if (fl) this.i.push(base, b, a); else this.i.push(base, a, b);
			}
		};
		if (o.capStart || o.caps) cap(frames[0], -1);
		if (o.capEnd || o.caps) cap(frames[F - 1], 1);
		return this;
	};
	Acc.prototype.append = function (o, mirror) {
		const base = this.vcount(), sx = mirror ? -1 : 1;
		for (let k = 0; k < o.p.length; k += 3) {
			this.p.push(o.p[k] * sx, o.p[k + 1], o.p[k + 2]);
			this.n.push(o.n[k] * sx, o.n[k + 1], o.n[k + 2]);
			this.c.push(o.c[k], o.c[k + 1], o.c[k + 2]);
		}
		for (let k = 0; k < o.u.length; k++) this.u.push(o.u[k]);
		for (let k = 0; k < o.i.length; k += 3) {
			if (mirror) this.i.push(base + o.i[k], base + o.i[k + 2], base + o.i[k + 1]);
			else this.i.push(base + o.i[k], base + o.i[k + 1], base + o.i[k + 2]);
		}
		return this;
	};
	Acc.prototype.build = function () {
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
		g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
		g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
		g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
		g.setIndex(this.i);
		g.computeBoundingSphere(); g.computeBoundingBox();
		return g;
	};

	// Frames along a polyline. a = ref x t, b = t x a.
	function makeFrames(pts, ref) {
		const F = [], n = pts.length; let len = 0;
		if (!ref) {
			const d = new V3().subVectors(pts[n - 1], pts[0]).normalize();
			ref = Math.abs(d.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
		}
		for (let k = 0; k < n; k++) {
			const t = new V3().subVectors(pts[Math.min(k + 1, n - 1)], pts[Math.max(k - 1, 0)]).normalize();
			const a = new V3().crossVectors(ref, t);
			if (a.lengthSq() < 1e-8) a.set(1, 0, 0).cross(t);
			a.normalize();
			const b = new V3().crossVectors(t, a).normalize();
			if (k > 0) len += pts[k].distanceTo(pts[k - 1]);
			F.push({ p: pts[k], a: a, b: b, t: t, len: len, sa: 1, sb: 1 });
		}
		return F;
	}
	const ring = (n, r, ry) => { const s = []; for (let k = 0; k < n; k++) { const an = k / n * Math.PI * 2; s.push([Math.cos(an) * r, Math.sin(an) * (ry === undefined ? r : ry)]); } return s; };
	// Round tube / horn / cone along points; radius number or fn(0..1).
	function addTube(acc, pts, radius, sides, o) {
		const fr = makeFrames(pts, o && o.ref);
		const n = fr.length;
		for (let k = 0; k < n; k++) { const r = typeof radius === 'function' ? radius(k / (n - 1)) : radius; fr[k].sa = r; fr[k].sb = r * ((o && o.flat) || 1); }
		acc.addSweep(fr, ring(sides, 1), o);
	}
	function arcTable(pts, n) {
		const L = [0];
		for (let k = 1; k < pts.length; k++) L.push(L[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		const tot = L[L.length - 1], out = [];
		let j = 0;
		for (let k = 0; k <= n; k++) {
			const d = tot * k / n;
			while (j < L.length - 2 && L[j + 1] < d) j++;
			const f = clamp((d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]), 0, 1);
			out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)]);
		}
		out.total = tot;
		return out;
	}
	function tabAt(tab, t) {
		const n = tab.length - 1, x = clamp(t, 0, 1) * n, k = Math.min(n - 1, Math.floor(x)), f = x - k;
		return [lerp(tab[k][0], tab[k + 1][0], f), lerp(tab[k][1], tab[k + 1][1], f)];
	}

	// ------------------------------------------------------------------ texture atlas bands (wood atlas, 1024 high)
	const TEX = 1024;
	const bandOf = (y0, y1) => [1 - (y1 - 3) / TEX, 1 - (y0 + 3) / TEX];   // [v at canvas-bottom, v at canvas-top]
	const BAND_STRAKE = [bandOf(0, 128), bandOf(128, 256), bandOf(256, 384), bandOf(384, 512)];
	const BAND_DECK = bandOf(512, 768);
	const BAND_CARVE = bandOf(768, 832);
	const BAND_PLAIN = bandOf(832, 1024);
	const U_PER_UNIT = 1 / 2.6;

	// ------------------------------------------------------------------ textures (canvas-drawn, cached per THREE build)
	let cache = __longshipTexCache.get(THREE);
	if (!cache) { cache = { wood: null, sail: null, shields: new Map() }; __longshipTexCache.set(THREE, cache); }

	function makeCanvas(s) { const cv = document.createElement('canvas'); cv.width = cv.height = s; return cv; }
	function finishTex(cv, repeatS) {
		const t = new THREE.CanvasTexture(cv);
		t.encoding = THREE.sRGBEncoding;
		t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
		t.wrapT = THREE.ClampToEdgeWrapping;
		t.anisotropy = 4;
		t.needsUpdate = true;
		return t;
	}

	function makeWoodTexture() {
		const S = TEX, cv = makeCanvas(S), ctx = cv.getContext('2d'), R = rng(1337);
		function grain(y0, y1, base, n) {
			ctx.fillStyle = base; ctx.fillRect(0, y0, S, y1 - y0);
			ctx.save(); ctx.beginPath(); ctx.rect(0, y0, S, y1 - y0); ctx.clip();
			for (let k = 0; k < n; k++) {
				const y = y0 + R() * (y1 - y0), len = 90 + R() * 520, x = R() * S, w = 0.7 + R() * 2.2;
				ctx.strokeStyle = R() < 0.62 ? '#4a3824' : '#f7ead0';
				ctx.globalAlpha = 0.07 + R() * 0.2; ctx.lineWidth = w;
				const amp = R() * 3.5, ph = R() * 6.28;
				for (let ox = -S; ox <= S; ox += S) {
					ctx.beginPath();
					for (let t = 0; t <= 8; t++) { const xx = x + ox + len * t / 8, yy = y + Math.sin(ph + t * 0.9) * amp; if (t) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
					ctx.stroke();
				}
			}
			// a few knots
			const nk = Math.max(1, Math.round((y1 - y0) / 90));
			for (let k = 0; k < nk; k++) {
				const x = R() * S, y = y0 + 14 + R() * (y1 - y0 - 28), r = 4 + R() * 5;
				for (let ox = -S; ox <= S; ox += S) {
					ctx.globalAlpha = 0.35; ctx.fillStyle = '#3d2714';
					ctx.beginPath(); ctx.ellipse(x + ox, y, r * 1.8, r, 0, 0, 6.3); ctx.fill();
					ctx.globalAlpha = 0.25; ctx.strokeStyle = '#2e1c0d'; ctx.lineWidth = 1.2;
					ctx.beginPath(); ctx.ellipse(x + ox, y, r * 3.2, r * 1.9, 0, 0, 6.3); ctx.stroke();
				}
			}
			ctx.globalAlpha = 1; ctx.restore();
		}
		// --- four strake variants: grain, lap shadow, worn lower edge, rivet row, scarf joint, tar runs
		const bases = ['#cbb596', '#c1aa8a', '#d3bea0', '#bba482'];
		for (let b = 0; b < 4; b++) {
			const y0 = b * 128, y1 = y0 + 128;
			grain(y0, y1, bases[b], 150);
			ctx.save(); ctx.beginPath(); ctx.rect(0, y0, S, 128); ctx.clip();
			// tar runs
			for (let k = 0; k < 26; k++) {
				const x = R() * S, w = 3 + R() * 16, h = 30 + R() * 98;
				const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
				g.addColorStop(0, 'rgba(30,18,8,' + (0.12 + R() * 0.2).toFixed(3) + ')'); g.addColorStop(1, 'rgba(30,18,8,0)');
				ctx.fillStyle = g; ctx.fillRect(x, y0, w, h);
			}
			// shadow under the lap of the strake above
			let g = ctx.createLinearGradient(0, y0, 0, y0 + 46);
			g.addColorStop(0, 'rgba(20,10,4,0.78)'); g.addColorStop(1, 'rgba(20,10,4,0)');
			ctx.fillStyle = g; ctx.fillRect(0, y0, S, 52);
			// worn, lighter lower edge + a moulding line
			g = ctx.createLinearGradient(0, y1 - 30, 0, y1);
			g.addColorStop(0, 'rgba(255,236,196,0)'); g.addColorStop(1, 'rgba(255,236,196,0.5)');
			ctx.fillStyle = g; ctx.fillRect(0, y1 - 30, S, 30);
			ctx.fillStyle = 'rgba(40,24,10,0.55)'; ctx.fillRect(0, y1 - 31, S, 2.5);
			ctx.fillStyle = 'rgba(255,240,205,0.7)'; ctx.fillRect(0, y1 - 8, S, 8);
			// scarf joint
			const sx = 60 + R() * (S - 160);
			ctx.strokeStyle = 'rgba(28,16,6,0.75)'; ctx.lineWidth = 2.5;
			ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + 46, y1); ctx.stroke();
			ctx.strokeStyle = 'rgba(255,236,196,0.3)'; ctx.lineWidth = 1.5;
			ctx.beginPath(); ctx.moveTo(sx + 3, y0); ctx.lineTo(sx + 49, y1); ctx.stroke();
			// rivets (clench nails with roves) along the lap
			const rivet = (x, y, r) => {
				ctx.fillStyle = 'rgba(18,10,4,0.55)'; ctx.beginPath(); ctx.arc(x + 1.0, y + 1.8, r + 1.2, 0, 6.3); ctx.fill();
				ctx.fillStyle = '#dcdad2'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
				ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.55, 0, 6.3); ctx.fill();
			};
			for (let k = 0; k < 32; k++) rivet(k * 32 + 16, y1 - 17, 3.9);
			for (let k = 1; k < 4; k++) rivet(sx + 46 * k / 4 + 9, y0 + 128 * k / 4 - 20, 3.2);
			ctx.restore();
		}
		// --- deck: four planks, seams, butt joints with nails
		for (let p = 0; p < 4; p++) {
			const y0 = 512 + p * 64, y1 = y0 + 64;
			grain(y0, y1, ['#d9c8a8', '#cdbb9a', '#dfcfb0', '#d1c0a0'][p], 70);
			ctx.fillStyle = 'rgba(30,18,8,0.8)'; ctx.fillRect(0, y0, S, 3);
			ctx.fillStyle = 'rgba(255,240,205,0.35)'; ctx.fillRect(0, y0 + 3, S, 2);
			for (let k = 0; k < 2; k++) {
				const x = R() * S;
				ctx.fillStyle = 'rgba(30,18,8,0.75)'; ctx.fillRect(x, y0, 3, 64);
				ctx.fillStyle = '#4b4640';
				for (const dx of [-9, 12]) for (const dy of [16, 48]) { ctx.beginPath(); ctx.arc(x + dx, y0 + dy, 2.6, 0, 6.3); ctx.fill(); }
			}
		}
		// --- plain timber
		grain(832, 1024, '#cdb999', 200);
		// --- carved, gilded interlace for the stem and stern posts (tiles 32 times across)
		(function () {
			const y0 = 768, h = 64, mid = y0 + 32, per = 32, amp = 13;
			ctx.fillStyle = '#5a442f'; ctx.fillRect(0, y0, S, h);
			for (let k = 0; k < 500; k++) { ctx.fillStyle = R() < 0.5 ? 'rgba(20,12,6,0.25)' : 'rgba(255,230,180,0.08)'; ctx.fillRect(R() * S, y0 + R() * h, 20 + R() * 60, 1.2); }
			const strand = (ph, x0, x1) => {
				const path = () => { ctx.beginPath(); for (let x = x0; x <= x1; x += 2) { const y = mid + amp * Math.sin(2 * Math.PI * x / (per * 2) + ph); if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
				ctx.lineCap = 'butt';
				ctx.strokeStyle = '#1c1209'; ctx.lineWidth = 12; path(); ctx.stroke();
				ctx.strokeStyle = '#f2cf72'; ctx.lineWidth = 6.5; path(); ctx.stroke();
				ctx.strokeStyle = '#fff1bd'; ctx.lineWidth = 1.6; path(); ctx.stroke();
			};
			strand(0, -4, S + 4); strand(Math.PI, -4, S + 4);
			for (let k = 0; k * per < S + per; k += 2) strand(0, k * per - 8, k * per + 8);       // alternate over / under
			ctx.fillStyle = '#1c1209'; ctx.fillRect(0, y0 + 3, S, 9); ctx.fillRect(0, y0 + h - 12, S, 9);
			ctx.fillStyle = '#f2cf72'; ctx.fillRect(0, y0 + 5, S, 5); ctx.fillRect(0, y0 + h - 10, S, 5);
			for (let k = 0; k * per < S; k++) { ctx.fillStyle = '#f2cf72'; ctx.beginPath(); ctx.arc(k * per + per / 2, mid, 2.6, 0, 6.3); ctx.fill(); }
		})();
		return finishTex(cv, true);
	}

	function makeSailTexture() {
		const S = 1024, cv = makeCanvas(S), ctx = cv.getContext('2d'), R = rng(4242);
		ctx.fillStyle = '#f7f4ea'; ctx.fillRect(0, 0, S, S);
		// woollen weave
		for (let y = 0; y < S; y += 3) { ctx.fillStyle = 'rgba(90,75,55,' + (0.02 + R() * 0.07).toFixed(3) + ')'; ctx.fillRect(0, y, S, 1.4); }
		for (let x = 0; x < S; x += 3) { ctx.fillStyle = 'rgba(90,75,55,' + (0.02 + R() * 0.06).toFixed(3) + ')'; ctx.fillRect(x, 0, 1.4, S); }
		// broad tonal variation between cloth strips
		const strips = 14;
		for (let k = 0; k < strips; k++) { ctx.fillStyle = 'rgba(70,55,35,' + (R() * 0.07).toFixed(3) + ')'; ctx.fillRect(k * S / strips, 0, S / strips, S); }
		// weathering: stains, runs from the yard, a grubby foot
		for (let k = 0; k < 46; k++) {
			const x = R() * S, y = S * (0.25 + 0.75 * Math.sqrt(R())), r = 40 + R() * 150;
			const g = ctx.createRadialGradient(x, y, 0, x, y, r);
			g.addColorStop(0, 'rgba(96,80,56,' + (0.04 + R() * 0.07).toFixed(3) + ')'); g.addColorStop(1, 'rgba(96,80,56,0)');
			ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
		}
		for (let k = 0; k < 60; k++) {
			const x = R() * S, w = 2 + R() * 9, h = 80 + R() * 420;
			const g = ctx.createLinearGradient(0, 0, 0, h);
			g.addColorStop(0, 'rgba(80,66,46,' + (0.05 + R() * 0.1).toFixed(3) + ')'); g.addColorStop(1, 'rgba(80,66,46,0)');
			ctx.fillStyle = g; ctx.fillRect(x, 0, w, h);
		}
		let g = ctx.createLinearGradient(0, S * 0.8, 0, S);
		g.addColorStop(0, 'rgba(70,58,40,0)'); g.addColorStop(1, 'rgba(70,58,40,0.3)');
		ctx.fillStyle = g; ctx.fillRect(0, S * 0.8, S, S * 0.2);
		g = ctx.createLinearGradient(0, 0, 0, S * 0.08);
		g.addColorStop(0, 'rgba(70,58,40,0.25)'); g.addColorStop(1, 'rgba(70,58,40,0)');
		ctx.fillStyle = g; ctx.fillRect(0, 0, S, S * 0.08);
		// vertical seams with stitches
		for (let k = 1; k < strips; k++) {
			const x = k * S / strips, heavy = (k % 2 === 0);
			ctx.fillStyle = heavy ? 'rgba(52,40,26,0.5)' : 'rgba(64,50,34,0.3)';
			ctx.fillRect(x - (heavy ? 2.5 : 1.5), 0, heavy ? 5 : 3, S);
			ctx.fillStyle = 'rgba(255,250,235,0.35)'; ctx.fillRect(x + (heavy ? 2.5 : 1.5), 0, 1.5, S);
			ctx.fillStyle = 'rgba(40,30,20,0.22)';
			for (let y = 6; y < S; y += 13) ctx.fillRect(x - 4.5, y, 9, 1.6);
		}
		// reef bands with reef points
		for (const fy of [0.6, 0.78]) {
			const y = S * fy;
			ctx.fillStyle = 'rgba(60,46,30,0.24)'; ctx.fillRect(0, y - 6, S, 12);
			ctx.fillStyle = 'rgba(255,250,235,0.3)'; ctx.fillRect(0, y - 8, S, 2);
			ctx.strokeStyle = 'rgba(46,34,22,0.5)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
			for (let k = 0; k < strips * 2; k++) {
				const x = (k + 0.5) * S / (strips * 2);
				ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y + 18, x - 2 + R() * 6, y + 34 + R() * 8); ctx.stroke();
			}
		}
		// bolt rope around the edge
		ctx.strokeStyle = 'rgba(92,72,44,0.9)'; ctx.lineWidth = 16; ctx.strokeRect(4, 4, S - 8, S - 8);
		ctx.strokeStyle = 'rgba(40,30,18,0.55)'; ctx.lineWidth = 2;
		for (let k = 0; k < S; k += 12) {
			ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + 8, 12); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(k, S - 12); ctx.lineTo(k + 8, S); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(12, k + 8); ctx.stroke();
			ctx.beginPath(); ctx.moveTo(S - 12, k); ctx.lineTo(S, k + 8); ctx.stroke();
		}
		return finishTex(cv, false);
	}

	// Shield atlas: 3x3 cells, 8 painted faces + 1 back. The owner's colour is drawn so it survives sRGB decoding unchanged.
	const SH_CELL = TEX / 3, SH_RP = 150;
	function makeShieldTexture(hex) {
		const S = TEX, cv = makeCanvas(S), ctx = cv.getContext('2d'), R = rng(977);
		const enc = (c) => { c = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(clamp(c, 0, 1) * 255); };
		const P = 'rgb(' + enc(((hex >> 16) & 255) / 255) + ',' + enc(((hex >> 8) & 255) / 255) + ',' + enc((hex & 255) / 255) + ')';
		const W = '#f6eed8', K = '#3b3632', O = '#f2bd3d', B = '#4a8f9c', RIM = '#8a623a';
		const Rp = SH_RP;
		const disc = (c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, Rp, 0, 6.3); ctx.fill(); };
		const wedge = (a0, a1, c, r0, r1) => {
			ctx.fillStyle = c; ctx.beginPath();
			ctx.arc(0, 0, r1 === undefined ? Rp : r1, a0, a1); ctx.arc(0, 0, r0 || 0, a1, a0, true); ctx.closePath(); ctx.fill();
		};
		const swirl = (n, c, twist) => {
			ctx.fillStyle = c;
			for (let k = 0; k < n; k++) {
				const a0 = k * 2 * Math.PI / n, a1 = a0 + Math.PI / n;
				ctx.beginPath(); ctx.moveTo(0, 0);
				for (let t = 0; t <= 16; t++) { const r = Rp * t / 16, an = a0 + twist * t / 16; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
				for (let t = 16; t >= 0; t--) { const r = Rp * t / 16, an = a1 + twist * t / 16; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
				ctx.closePath(); ctx.fill();
			}
		};
		const patterns = [
			() => { disc(P); wedge(0, Math.PI / 2, W); wedge(Math.PI, Math.PI * 1.5, W); },                                 // 0 quartered
			() => { disc(O); swirl(4, K, 1.5); },                                                                             // 1 swirl, ochre/black
			() => { disc(P); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.fillStyle = W; ctx.beginPath(); ctx.moveTo(Math.cos(a) * Rp * 0.3, Math.sin(a) * Rp * 0.3); ctx.lineTo(Math.cos(a + 0.2) * Rp, Math.sin(a + 0.2) * Rp); ctx.lineTo(Math.cos(a - 0.2) * Rp, Math.sin(a - 0.2) * Rp); ctx.fill(); } }, // 2 rays
			() => { disc(W); wedge(0, 6.3, K, Rp * 0.74, Rp); wedge(0, 6.3, P, Rp * 0.36, Rp * 0.6); },                       // 3 rings
			() => { disc(K); for (let k = 0; k < 4; k++) wedge(k * Math.PI / 2, k * Math.PI / 2 + Math.PI / 4, O); },         // 4 gyronny
			() => { disc(B); for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; ctx.fillStyle = W; ctx.beginPath(); ctx.moveTo(Math.cos(a) * Rp * 0.5, Math.sin(a) * Rp * 0.5); ctx.lineTo(Math.cos(a + 0.24) * Rp, Math.sin(a + 0.24) * Rp); ctx.lineTo(Math.cos(a - 0.24) * Rp, Math.sin(a - 0.24) * Rp); ctx.fill(); } }, // 5 wolf teeth
			() => { disc(W); swirl(3, P, 2.1); },                                                                             // 6 triskele
			() => { disc(P); wedge(0, Math.PI, K); ctx.fillStyle = W; ctx.fillRect(-Rp, -11, Rp * 2, 22); for (let k = -2; k <= 2; k++) { ctx.fillStyle = O; ctx.beginPath(); ctx.arc(k * 52, -62 + Math.abs(k) * 10, 12, 0, 6.3); ctx.fill(); ctx.fillStyle = W; ctx.beginPath(); ctx.arc(k * 52, 62 - Math.abs(k) * 10, 12, 0, 6.3); ctx.fill(); } } // 7 per fess, dotted
		];
		for (let k = 0; k < 9; k++) {
			const cx = (k % 3 + 0.5) * SH_CELL, cy = (Math.floor(k / 3) + 0.5) * SH_CELL;
			ctx.save();
			ctx.fillStyle = RIM; ctx.fillRect(cx - SH_CELL / 2, cy - SH_CELL / 2, SH_CELL, SH_CELL);
			ctx.translate(cx, cy);
			ctx.beginPath(); ctx.arc(0, 0, Rp, 0, 6.3); ctx.clip();
			if (k < 8) patterns[k](); else disc('#5b432d');
			// planks
			ctx.globalAlpha = 1;
			for (let x = -Rp + 22 + R() * 14; x < Rp; x += 34 + R() * 10) { ctx.fillStyle = 'rgba(25,15,8,0.3)'; ctx.fillRect(x, -Rp, 2.2, Rp * 2); ctx.fillStyle = 'rgba(255,245,220,0.16)'; ctx.fillRect(x + 2.2, -Rp, 1.5, Rp * 2); }
			// grain + battle scratches
			for (let q = 0; q < 90; q++) {
				const x = (R() * 2 - 1) * Rp, y = (R() * 2 - 1) * Rp, l = 10 + R() * 60;
				ctx.strokeStyle = R() < 0.5 ? 'rgba(30,20,10,0.16)' : 'rgba(255,250,235,0.14)'; ctx.lineWidth = 0.8 + R() * 1.4;
				ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 6, y + l); ctx.stroke();
			}
			for (let q = 0; q < 7; q++) {
				const x = (R() * 2 - 1) * Rp * 0.8, y = (R() * 2 - 1) * Rp * 0.8, a = R() * 6.3, l = 14 + R() * 40;
				ctx.strokeStyle = 'rgba(20,12,6,0.4)'; ctx.lineWidth = 1.6;
				ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
			}
			// soft dishing shade
			const g = ctx.createRadialGradient(-30, -40, 10, 0, 0, Rp);
			g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
			ctx.fillStyle = g; ctx.fillRect(-Rp, -Rp, Rp * 2, Rp * 2);
			if (k < 8) {
				// rawhide rim with clamps
				ctx.strokeStyle = RIM; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(0, 0, Rp - 8, 0, 6.3); ctx.stroke();
				ctx.strokeStyle = 'rgba(30,18,8,0.7)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, Rp - 18, 0, 6.3); ctx.stroke();
				ctx.strokeStyle = 'rgba(255,235,200,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, Rp - 4, 0, 6.3); ctx.stroke();
				for (let q = 0; q < 20; q++) { const a = q * Math.PI / 10; ctx.fillStyle = '#4a4744'; ctx.beginPath(); ctx.arc(Math.cos(a) * (Rp - 9), Math.sin(a) * (Rp - 9), 3.4, 0, 6.3); ctx.fill(); }
				ctx.fillStyle = 'rgba(20,14,10,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 6.3); ctx.fill();
			} else {
				// back: rawhide rim ring, dark boss hollow and a horizontal wooden grip bar
				ctx.strokeStyle = '#a07648'; ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(0, 0, Rp - 10, 0, 6.3); ctx.stroke();
				ctx.strokeStyle = 'rgba(20,12,6,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, Rp - 22, 0, 6.3); ctx.stroke();
				for (let q = 0; q < 20; q++) { const a = q * Math.PI / 10; ctx.fillStyle = '#2c2a28'; ctx.beginPath(); ctx.arc(Math.cos(a) * (Rp - 10), Math.sin(a) * (Rp - 10), 3.4, 0, 6.3); ctx.fill(); }
				ctx.fillStyle = 'rgba(10,6,3,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, 6.3); ctx.fill();
				ctx.fillStyle = 'rgba(10,6,3,0.6)'; ctx.fillRect(-Rp * 0.86, -12, Rp * 1.72, 30);
				ctx.fillStyle = '#b08a5c'; ctx.fillRect(-Rp * 0.86, -16, Rp * 1.72, 26);
				ctx.fillStyle = 'rgba(255,240,210,0.45)'; ctx.fillRect(-Rp * 0.86, -16, Rp * 1.72, 5);
				ctx.fillStyle = '#3a3633'; for (const x of [-0.78, 0.78]) { ctx.beginPath(); ctx.arc(x * Rp, -3, 6, 0, 6.3); ctx.fill(); }
			}
			ctx.restore();
		}
		return finishTex(cv, false);
	}

	if (!cache.wood) cache.wood = makeWoodTexture();
	if (!cache.sail) cache.sail = makeSailTexture();
	if (!cache.shields.has(sailHex)) cache.shields.set(sailHex, makeShieldTexture(sailHex));
	const woodTex = cache.wood, sailTex = cache.sail, shieldTex = cache.shields.get(sailHex);

	// ------------------------------------------------------------------ palette (vertex tints over the wood atlas)
	const PC = new THREE.Color(sailHex);
	const WOOD_ALB = [0.60, 0.47, 0.32];        // roughly what the plain timber decodes to
	const paint = (r, g, b, k) => [r / WOOD_ALB[0] * k, g / WOOD_ALB[1] * k, b / WOOD_ALB[2] * k];
	const C_TAR = [0.33, 0.24, 0.18];
	const C_PITCH = [0.072, 0.05, 0.038];
	const C_SLIME = [0.17, 0.21, 0.15];
	const C_SHEER = paint(PC.r, PC.g, PC.b, 0.62);    // the sheer strake is painted in the owner's colour
	const C_SHEER_RAIL = paint(PC.r, PC.g, PC.b, 0.8); // …and the gunwale rail capping it, a shade brighter
	const C_POST = [0.36, 0.25, 0.17];
	const C_HEAD = [0.47, 0.31, 0.19];
	const C_INNER = [0.44, 0.34, 0.25];
	const C_DECK = [0.95, 0.88, 0.76];
	const C_RIB = [0.50, 0.39, 0.29];
	const C_THWART = [0.78, 0.66, 0.52];
	const C_MAST = [0.80, 0.63, 0.45];
	const C_RAIL = [0.74, 0.58, 0.40];
	const C_OAR = [0.92, 0.82, 0.66];
	const C_BONE = [1.5, 1.5, 1.45];
	const C_TONGUE = [1.2, 0.16, 0.12];
	const C_IRON = [0.40, 0.40, 0.43];
	const C_GOLD = [1.0, 0.74, 0.26];
	const C_BLACK = [0.05, 0.04, 0.03];

	// ------------------------------------------------------------------ hull definition
	const KEEL_Y = -0.2, SHEER_MID = 0.4, HALF_BEAM = 0.75, XPOST = 0.028;
	const DECK_Y = 0.14, RAISED_Y = 0.56, RAISED_Z = 2.02, DECK_END = 2.72;
	const NS = 7;                              // strakes per side
	const NL = LOW ? 28 : 56;                  // lengthwise segments per strake
	const SUB = LOW ? 3 : 6;                   // samples per profile knot interval

	// Profile (z,y) of stern tail -> stern post -> keel -> stem -> dragon neck.
	// The stem sweeps up and forward in one continuous curve; the neck keeps leaning out and arches into the head.
	const STEM = [[2.2, -0.2], [2.52, -0.16], [2.8, 0.0], [2.99, 0.3], [3.1, 0.72], [3.17, 1.14]];
	const knots = [];
	const TCz = -3.0, TCy = 2.0, TR = 0.30, TK = 0.19, TURN = Math.PI * 2.5, NSP = 13;
	for (let k = NSP - 1; k >= 0; k--) {
		const ph = TURN * k / (NSP - 1), r = TR * Math.exp(-TK * ph);
		knots.push([TCz - r * Math.cos(ph), TCy + r * Math.sin(ph)]);
	}
	const iTailStart = knots.length - 1;
	knots.push([-3.285, 1.72], [-3.24, 1.44]);
	const iSternSheer = knots.length;
	for (let k = 5; k >= 0; k--) knots.push([-STEM[k][0], STEM[k][1]]);
	knots.push([-1.1, -0.2], [0, -0.2], [1.1, -0.2]);
	const iBowFoot = knots.length;
	for (let k = 0; k <= 5; k++) knots.push([STEM[k][0], STEM[k][1]]);
	const iBowSheer = knots.length - 1;
	knots.push([3.25, 1.46], [3.33, 1.78], [3.395, 2.06], [3.45, 2.30], [3.56, 2.47]);
	const iEnd = knots.length - 1;
	const profCurve = new THREE.CatmullRomCurve3(knots.map(k => new V3(0, k[1], k[0])), false, 'centripetal');
	const profPts = profCurve.getPoints(iEnd * SUB);

	// Stem landing table (arc-length parametrised): where strake edge g meets the stem.
	const stemTab = (function () {
		const raw = [], t0 = iBowFoot / iEnd, t1 = iBowSheer / iEnd, p = new V3();
		for (let k = 0; k <= 240; k++) { profCurve.getPoint(lerp(t0, t1, k / 240), p); raw.push([p.z, p.y]); }
		return arcTable(raw, 120);
	})();
	// Midship section table (arc-length parametrised).
	const midTab = (function () {
		const raw = [];
		for (let k = 0; k <= 240; k++) {
			const q = k / 240;
			raw.push([HALF_BEAM * (0.85 * (1 - (1 - q) * (1 - q)) + 0.15 * q), KEEL_Y + (SHEER_MID - KEEL_Y) * Math.pow(q, 1.5)]);
		}
		return arcTable(raw, 120);
	})();

	// The lofted reference surface, starboard... (+x) half. s in [-1,1] along the ship, g in [0,1] keel -> gunwale.
	function hullPoint(s, g, out) {
		const as = Math.min(1, Math.abs(s));
		const e = tabAt(stemTab, g), m = tabAt(midTab, g);
		const w = Math.pow(Math.max(0, 1 - Math.pow(as, 2.4)), 1.15 + 0.5 * (1 - g));
		const r = Math.pow(as, 2 + 2 * (1 - g));     // sheer: one continuous rise from amidships, not just at the posts
		return out.set(XPOST + m[0] * w, m[1] + (e[1] - m[1]) * r, s * e[0]);
	}
	const _h0 = new V3(), _h1 = new V3();
	function hullFrame(s, g) {
		const ds = 0.003, dg = 0.003;
		const p = hullPoint(s, g, new V3());
		hullPoint(Math.min(1, s + ds), g, _h1); hullPoint(Math.max(-1, s - ds), g, _h0);
		const ts = new V3().subVectors(_h1, _h0).normalize();
		hullPoint(s, Math.min(1, g + dg), _h1); hullPoint(s, Math.max(0, g - dg), _h0);
		const tg = new V3().subVectors(_h1, _h0).normalize();
		const n = new V3().crossVectors(tg, ts);
		if (n.lengthSq() < 1e-10) n.set(1, 0, 0);
		n.normalize();
		return { p: p, n: n, tg: tg, ts: ts };
	}
	const plankT = (s) => 0.05 * (0.62 + 0.38 * (1 - Math.pow(Math.abs(s), 4)));
	const stemZ = (g) => tabAt(stemTab, g)[0];
	// Where does the hull skin sit at a given (z, y)? -> {x, g, s} or null
	function hullAtY(z, y) {
		const az = Math.abs(z);
		let lo = 0, hi = 1;
		if (stemZ(1) <= az) return null;
		if (stemZ(0) < az) { let a = 0, b = 1; for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (stemZ(m) < az) a = m; else b = m; } lo = b; }
		const f = (g) => hullPoint(z / stemZ(g), g, _h0).y - y;
		if (f(lo) > 0 || f(hi) < 0) return null;
		for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
		const g = (lo + hi) / 2, s = z / stemZ(g);
		return { x: hullPoint(s, g, _h0).x, g: g, s: s };
	}
	const sAt = (z, g) => clamp(z / stemZ(g), -1, 1);

	// ------------------------------------------------------------------ accumulators
	const hull = new Acc();       // strakes, keel, posts, dragon
	const fit = new Acc();        // deck, ribs, thwarts, spars, rails, steering oar
	const iron = new Acc();       // bosses, bands, eyes, vane
	const rope = new Acc();       // rigging
	const shields = new Acc();
	const side = new Acc();       // +x half of the planking, mirrored later
	const sideFit = new Acc();    // +x half of the fittings, mirrored later
	const sideRope = new Acc();
	// The yard and everything on it (lifts, parrel, lashings): its own mesh,
	// so the yard can be braced round with the sail.
	const yardAcc = new Acc();
	const C_ROPE_W = [0.66, 0.6, 0.47];
	const ROPE_UV = (u, v) => [u * 0.2, lerp(BAND_PLAIN[0], BAND_PLAIN[1], 0.5)];

	const tarAt = (base) => { const sl = mulCol(C_SLIME, Math.min(1, (base[0] + base[1] + base[2]) / 0.5)); return (p) => mixCol(base, sl, smooth(0.07, -0.05, p.y)); };

	// ------------------------------------------------------------------ PLANKING: one thin curved board per strake
	const R1 = rng(20261);
	const OV = 0.022;
	for (let i = 0; i < NS; i++) {
		const g0 = Math.max(0, i / NS - (i > 0 ? OV : 0)), g1 = (i + 1) / NS;
		const lowOut = [], upOut = [], upIn = [], lowIn = [], us = [];
		let len = 0; const prev = new V3();
		for (let j = 0; j <= NL; j++) {
			const t = -1 + 2 * j / NL;
			const s = 0.72 * t + 0.28 * Math.sin(t * Math.PI / 2);
			const T = plankT(s);
			const fl = hullFrame(s, g0), fu = hullFrame(s, g1);
			lowIn.push(fl.p.clone());
			lowOut.push(fl.p.clone().addScaledVector(fl.n, T));
			upOut.push(fu.p.clone());
			upIn.push(fu.p.clone().addScaledVector(fu.n, -T));
			if (j > 0) len += lowOut[j].distanceTo(prev);
			prev.copy(lowOut[j]); us.push(len);
		}
		const fm = hullFrame(0, (g0 + g1) / 2);
		const band = BAND_STRAKE[(i * 3 + 1) % 4], uOff = R1();
		const shade = (i % 2 ? 1.2 : 0.86) + 0.08 * R1();
		let base = mulCol(C_TAR, shade);
		// tarred, near-black bottom (strakes at and below the waterline), a dark tar strake, then bright timber and the red sheer
		if (i <= 3) base = mulCol(C_PITCH, [0.85, 0.9, 0.95, 1.0][i]);
		else if (i === NS - 3) base = mulCol(C_PITCH, 1.25);
		else if (i === NS - 2) base = mulCol(C_TAR, 1.5);
		if (i === NS - 1) base = C_SHEER;
		const cOut = tarAt(base), cEdge = tarAt(mulCol(base, 0.45)), cIn = mulCol(C_INNER, 0.9 + 0.2 * R1());
		// outer face
		side.addGrid([lowOut, upOut], (r, c) => [us[c] * U_PER_UNIT + uOff, r ? band[1] : band[0]], cOut, fm.n);
		// the lap: lower edge of the board, the step that makes clinker read
		side.addGrid([lowIn, lowOut], (r, c) => [us[c] * U_PER_UNIT + uOff, r ? BAND_PLAIN[0] : BAND_PLAIN[0] + 0.02], cEdge, fm.tg.clone().negate());
		// inner face (seen above the deck)
		if (i >= 2) side.addGrid([upIn, lowIn], (r, c) => [us[c] * U_PER_UNIT + uOff * 2, r ? BAND_PLAIN[0] : BAND_PLAIN[1]], cIn, fm.n.clone().negate());
		// top edge of the sheer strake
		if (i === NS - 1) side.addGrid([upOut, upIn], (r, c) => [us[c] * U_PER_UNIT, r ? BAND_PLAIN[0] : BAND_PLAIN[0] + 0.03], C_RAIL, fm.tg);
	}

	// Gunwale rail capping the sheer strake.
	(function () {
		const fr = [];
		let len = 0;
		for (let j = 0; j <= NL; j++) {
			const t = -1 + 2 * j / NL, s = 0.72 * t + 0.28 * Math.sin(t * Math.PI / 2);
			const f = hullFrame(s, 1);
			const a = new V3(f.n.x, 0, f.n.z).normalize();
			const tn = f.ts.clone(); if (tn.z < 0) tn.negate();
			const b = new V3().crossVectors(tn, a).normalize();
			if (j > 0) len += f.p.distanceTo(fr[j - 1].p0);
			const k = 0.45 + 0.55 * (1 - Math.pow(Math.abs(s), 6));
			fr.push({ p: f.p.clone(), p0: f.p, a: a, b: b, t: tn, len: len, sa: k, sb: 1 });
		}
		// painted in the owner's colour, like the sheer strake under it:
		// from overhead the rail outlines the hull in its owner's dye
		side.addSweep(fr, [[-0.05, -0.012], [0.026, -0.012], [0.034, 0.012], [0.026, 0.034], [-0.05, 0.034]], { hard: true, col: C_SHEER_RAIL, band: BAND_PLAIN });
	})();

	// ------------------------------------------------------------------ KEEL + STEM + STERN POST (one sweep along the profile)
	const postFrames = makeFrames(profPts, new V3(1, 0, 0));
	for (let k = 0; k < postFrames.length; k++) {
		const kf = k / SUB; let sc = 1, sw = 1.3;
		if (kf < iTailStart) { const t = kf / iTailStart; sc = 0.22 + 1.08 * Math.pow(t, 0.9); sw = 0.3 + 1.0 * Math.pow(t, 0.9); }
		else if (kf < iSternSheer) { const t = (kf - iTailStart) / (iSternSheer - iTailStart); sc = lerp(1.3, 1.45, t); sw = 1.3; }
		else if (kf > iBowSheer) {
			// neck: stout where it leaves the hull, slimmer at mid-neck, swelling again into the throat
			const t = (kf - iBowSheer) / (iEnd - iBowSheer);
			sc = 1.55 - 0.42 * smooth(0, 0.62, t) + 0.52 * smooth(0.62, 1, t);
			sw = 1.3 - 0.25 * smooth(0, 0.62, t) + 0.38 * smooth(0.62, 1, t);
		} else {
			const db = iBowSheer - kf, ds = kf - iSternSheer;
			sc = 1 + 0.55 * smooth(1.6, 0, db) + 0.45 * smooth(1.6, 0, ds);
		}
		postFrames[k].sa = sc; postFrames[k].sb = sw;
	}
	const POST_SEC = [[-0.045, -0.046], [0.045, -0.046], [0.078, -0.018], [0.078, 0.018], [0.045, 0.046], [-0.045, 0.046]];
	const carveCol = (p) => mixCol([0.95, 0.86, 0.7], C_SLIME, smooth(0.07, -0.05, p.y));
	hull.addSweep(postFrames, POST_SEC, {
		hard: true, capStart: true, capEnd: true, band: BAND_PLAIN,
		col: (p) => mixCol(C_POST, C_SLIME, smooth(0.07, -0.05, p.y)),
		sideBands: { 0: BAND_CARVE, 4: BAND_CARVE }, sideCols: { 0: carveCol, 4: carveCol }
	});

	function postAtY(y, bow) {
		let best = null, bd = 1e9;
		const k0 = bow ? iBowSheer * SUB : iTailStart * SUB, k1 = bow ? iEnd * SUB : iSternSheer * SUB;
		for (let k = k0; k <= k1; k++) { const d = Math.abs(postFrames[k].p.y - y); if (d < bd) { bd = d; best = postFrames[k]; } }
		return best;
	}
	// Gilded bands on neck and tail.
	function addBand(idx, grow, half, col) {
		const f = postFrames[idx];
		const mk = (d, l) => ({ p: f.p.clone().addScaledVector(f.t, d), a: f.a, b: f.b, t: f.t, len: l, sa: f.sa * grow, sb: f.sb * grow });
		iron.addSweep([mk(-half, 0), mk(half, half * 2)], POST_SEC, { hard: true, caps: true, col: col });
	}
	addBand(Math.round((iBowSheer + 0.55) * SUB), 1.16, 0.035, C_GOLD);
	addBand(Math.round((iBowSheer + 3.1) * SUB), 1.13, 0.03, C_GOLD);
	addBand(Math.round((iSternSheer - 0.6) * SUB), 1.16, 0.035, C_GOLD);

	// Serrated dorsal crest: one extruded zig-zag following the back of the post.
	function addCrest(k0, k1, sideSign, h, pitch, col) {
		const outer = [], inner = [];
		let acc = 0;
		const pts2 = [];
		for (let k = k0; k <= k1; k++) {
			const f = postFrames[k];
			const off = sideSign > 0 ? 0.078 * f.sa : -0.045 * f.sa;
			const basePt = f.p.clone().addScaledVector(f.a, off - sideSign * 0.01);
			inner.push(f.p.clone().addScaledVector(f.a, off - sideSign * 0.03));
			if (k > k0) acc += f.p.distanceTo(postFrames[k - 1].p);
			outer.push({ p: basePt, f: f, d: acc });
		}
		const total = acc, n = Math.max(2, Math.round(total / pitch));
		const at = (d) => {
			let j = 0; while (j < outer.length - 2 && outer[j + 1].d < d) j++;
			const u = clamp((d - outer[j].d) / Math.max(1e-6, outer[j + 1].d - outer[j].d), 0, 1);
			return { p: outer[j].p.clone().lerp(outer[j + 1].p, u), f: outer[j].f };
		};
		for (let q = 0; q < n; q++) {
			const d0 = total * q / n, d1 = total * (q + 0.62) / n;
			const b0 = at(d0), ap = at(d1);
			const taper = Math.sin(Math.PI * (q + 0.5) / n);
			pts2.push(b0.p);
			pts2.push(ap.p.clone().addScaledVector(ap.f.a, sideSign * h * (0.45 + 0.55 * taper)));
		}
		pts2.push(at(total).p);
		for (let k = inner.length - 1; k >= 0; k--) pts2.push(inner[k]);
		const sh = new THREE.Shape();
		pts2.forEach((p, k) => { if (k) sh.lineTo(p.z, p.y); else sh.moveTo(p.z, p.y); });
		const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 1 });
		const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0.015, 0, 0);
		hull.addGeo(g, { matrix: m, col: col, uv: (u, v, lx, ly) => [(lx + ly) * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], tri(ly * 6))] });
	}
	addCrest(Math.round((iBowSheer + 0.8) * SUB), Math.round((iEnd - 0.5) * SUB), -1, 0.11, 0.17, C_HEAD);

	// Stern: a few long carved fins on the aft edge of the post, raked up towards the curl and shrinking as they go.
	(function () {
		const k0 = Math.round((iTailStart - 0.6) * SUB), k1 = Math.round((iSternSheer - 0.15) * SUB);
		const edge = [];
		let acc = 0;
		for (let k = k1; k >= k0; k--) {          // walk upward: from the sheer towards the curl
			const f = postFrames[k];
			if (edge.length) acc += f.p.distanceTo(edge[edge.length - 1].f.p);
			edge.push({ f: f, d: acc, p: f.p.clone().addScaledVector(f.a, 0.07 * f.sa) });
		}
		const total = acc;
		const at = (d) => {
			let j = 0; while (j < edge.length - 2 && edge[j + 1].d < d) j++;
			const u = clamp((d - edge[j].d) / Math.max(1e-6, edge[j + 1].d - edge[j].d), 0, 1);
			const e0 = edge[j], e1 = edge[j + 1];
			return { p: e0.p.clone().lerp(e1.p, u), a: e0.f.a.clone().lerp(e1.f.a, u).normalize(), up: e0.f.t.clone().lerp(e1.f.t, u).negate().normalize() };
		};
		const NF = 4;
		const lens = [0.36, 0.3, 0.24, 0.18], hs = [0.2, 0.16, 0.12, 0.085];
		let d = 0.0;
		for (let q = 0; q < NF; q++) {
			const L = lens[q] * total / 1.08, H = hs[q];
			const b0 = at(d), bm = at(d + L * 0.5), b1 = at(d + L);
			const sh = new THREE.Shape();
			const P = (b, out, along) => b.p.clone().addScaledVector(b.a, out).addScaledVector(b.up, along);
			const pts = [
				P(b0, -0.03, 0),
				P(b0, H * 0.35, L * 0.22),
				P(bm, H * 0.75, L * 0.35),
				P(b1, H, L * 0.45),                  // tip: out aft and swept up
				P(b1, H * 0.62, L * 0.05),
				P(bm, H * 0.3, L * 0.18),
				P(b1, 0.0, -L * 0.08),
				P(b1, -0.03, -L * 0.08)
			];
			const v2 = pts.map(p => new THREE.Vector2(p.z, p.y));
			sh.moveTo(v2[0].x, v2[0].y);
			sh.splineThru([v2[1], v2[2], v2[3]]);
			sh.splineThru([v2[4], v2[5], v2[6]]);
			sh.lineTo(v2[7].x, v2[7].y); sh.lineTo(v2[0].x, v2[0].y);
			const g = new THREE.ExtrudeGeometry(sh, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: LOW ? 4 : 7 });
			const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0.018, 0, 0);
			hull.addGeo(g, { matrix: m, col: mulCol(C_HEAD, 0.95), uv: (u, v, lx, ly) => [(lx * 0.4 + ly) * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], clamp(0.5 + (lx - ly) * 1.5, 0.02, 0.98))] });
			d += L * 0.82;
		}
		// the curl ends in a small carved knob
		const f0 = postFrames[0];
		const kn = new THREE.SphereGeometry(1, LOW ? 8 : 12, LOW ? 6 : 9);
		hull.addGeo(kn, { matrix: new THREE.Matrix4().makeScale(0.04, 0.04, 0.034).setPosition(f0.p.clone().addScaledVector(f0.t, -0.012)), col: mulCol(C_HEAD, 1.05), uv: (u, v) => [u, lerp(BAND_PLAIN[0], BAND_PLAIN[1], v)] });
	})();

	// ------------------------------------------------------------------ DRAGON HEAD
	(function () {
		const tilt = -0.12, o = profPts[profPts.length - 1];
		const uV = new V3(0, Math.sin(tilt), Math.cos(tilt)), vV = new V3(0, Math.cos(tilt), -Math.sin(tilt)), wV = new V3(-1, 0, 0);
		const HM = new THREE.Matrix4().makeBasis(uV, vV, wV).setPosition(o.x, o.y - 0.03, o.z - 0.04).scale(new V3(1.16, 1.16, 1.16));
		const hp = (u, v, w) => new V3(u, v, w || 0).applyMatrix4(HM);
		const sh = new THREE.Shape();
		const v2 = (a) => a.map(p => new THREE.Vector2(p[0], p[1]));
		sh.moveTo(0.0, -0.12);
		sh.splineThru(v2([[0.12, -0.14], [0.25, -0.125], [0.36, -0.09], [0.44, -0.045], [0.47, -0.008]]));            // lower jaw, rising to the chin
		sh.splineThru(v2([[0.44, -0.02], [0.36, -0.05], [0.26, -0.058], [0.17, -0.04], [0.105, 0.005]]));             // mouth floor
		sh.splineThru(v2([[0.17, 0.058], [0.28, 0.066], [0.40, 0.056], [0.485, 0.042]]));                             // mouth roof
		sh.splineThru(v2([[0.535, 0.05], [0.565, 0.08], [0.562, 0.118], [0.53, 0.142], [0.49, 0.138]]));              // snout curl
		sh.splineThru(v2([[0.43, 0.128], [0.36, 0.14], [0.30, 0.17], [0.245, 0.225], [0.17, 0.275], [0.08, 0.29]]));  // bridge rising to the brow
		sh.splineThru(v2([[-0.01, 0.275], [-0.09, 0.22], [-0.125, 0.11], [-0.115, 0.0], [-0.07, -0.09], [0.0, -0.12]])); // skull
		const depth = 0.085, bt = 0.032;
		const g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: bt, bevelSize: 0.022, bevelSegments: LOW ? 1 : 3, curveSegments: LOW ? 4 : 8 });
		g.translate(0, 0, -depth / 2);
		// taper the plank-cut head in plan: broad skull, narrow snout
		const TP = (u) => lerp(1.22, 0.6, smooth(-0.05, 0.56, u));
		(function () { const pa = g.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, pa.getZ(k) * TP(pa.getX(k))); g.computeVertexNormals(); })();
		const woodUV = (u, v, lx, ly, lz, w) => [(w.z * 0.95 + w.y * 0.12) * 0.42, lerp(BAND_PLAIN[0], BAND_PLAIN[1], clamp((w.y - o.y) * 1.25 + 0.42 + w.x * 0.5, 0.02, 0.98))];
		hull.addGeo(g, { matrix: HM, col: C_HEAD, uv: woodUV });
		// cheeks / skull volume
		const blob = (u, v, w, su, sv, sw, col, acc, seg) => {
			const sg = new THREE.SphereGeometry(1, seg || (LOW ? 10 : 18), seg ? Math.max(4, seg - 2) : (LOW ? 7 : 12));
			const m = new THREE.Matrix4().makeScale(su, sv, sw).setPosition(u, v, w).premultiply(HM);
			(acc || hull).addGeo(sg, { matrix: m, col: col, uv: woodUV });
		};
		blob(0.0, 0.075, 0, 0.14, 0.15, 0.1, C_HEAD);
		blob(0.19, 0.212, 0.064, 0.095, 0.042, 0.04, mulCol(C_HEAD, 0.85), null, 10);  // heavy brow ridges over the eyes
		blob(0.19, 0.212, -0.064, 0.095, 0.042, 0.04, mulCol(C_HEAD, 0.85), null, 10);
		blob(0.505, 0.122, 0.03, 0.036, 0.028, 0.026, C_HEAD, null, 10);               // nostrils
		blob(0.505, 0.122, -0.03, 0.036, 0.028, 0.026, C_HEAD, null, 10);
		// fin frills fanning back from the jaw hinge, one on each cheek, and a mane down the back of the skull
		const frill = (pts2, w, depth, col) => {
			const s = new THREE.Shape();
			s.moveTo(pts2[0][0], pts2[0][1]);
			for (let k = 1; k < pts2.length; k++) s.lineTo(pts2[k][0], pts2[k][1]);
			s.lineTo(pts2[0][0], pts2[0][1]);
			const fg = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 1 });
			fg.translate(0, 0, w - depth / 2);
			hull.addGeo(fg, { matrix: HM, col: col, uv: woodUV });
		};
		const cheek = [[0.06, 0.05], [-0.05, 0.13], [-0.2, 0.15], [-0.11, 0.07], [-0.26, 0.04], [-0.13, -0.01], [-0.24, -0.09], [-0.09, -0.07], [0.02, -0.06]];
		for (const sw of [1, -1]) frill(cheek.map(p => [p[0], p[1]]), sw * 0.072, 0.016, mulCol(C_HEAD, 0.8));
		frill([[0.02, 0.26], [-0.13, 0.27], [-0.07, 0.19], [-0.2, 0.17], [-0.13, 0.1], [-0.25, 0.06], [-0.15, 0.0], [-0.24, -0.08], [-0.1, -0.06], [-0.06, 0.12]], 0, 0.03, mulCol(C_HEAD, 0.9));
		// eyes
		blob(0.2, 0.148, 0.06, 0.042, 0.036, 0.03, C_GOLD, iron, 10);
		blob(0.2, 0.148, -0.06, 0.042, 0.036, 0.03, C_GOLD, iron, 10);
		blob(0.214, 0.148, 0.083, 0.015, 0.026, 0.011, C_BLACK, iron, 6);
		blob(0.214, 0.148, -0.083, 0.015, 0.026, 0.011, C_BLACK, iron, 6);
		// horns sweeping back
		for (const sx of [1, -1]) {
			// rise off the brow, then sweep back along an arc and hook down at the tip
			const pts = [hp(0.07, 0.23, sx * 0.05), hp(0.01, 0.33, sx * 0.08), hp(-0.08, 0.39, sx * 0.105), hp(-0.19, 0.41, sx * 0.12), hp(-0.29, 0.38, sx * 0.125), hp(-0.35, 0.32, sx * 0.12)];
			const cv = new THREE.CatmullRomCurve3(pts).getPoints(LOW ? 6 : 14);
			addTube(hull, cv, (t) => 0.042 * (1 - t) + 0.004, LOW ? 5 : 7, { col: (p) => C_BONE.map(c => c * 0.62), band: BAND_PLAIN, capEnd: true, ref: new V3(1, 0, 0) });
		}
		// teeth
		const tooth = (u, v, w, dv, len, r) => {
			const pts = [hp(u, v - dv * 0.014, w), hp(u + 0.006, v + dv * len * 0.5, w * 0.97), hp(u + 0.02, v + dv * len, w * 0.92)];
			addTube(hull, pts, (t) => r * (1 - t * t) + 0.0008, LOW ? 4 : 6, { col: C_BONE, band: BAND_PLAIN, ref: new V3(1, 0, 0) });
		};
		for (const sx of [1, -1]) {
			const w0 = sx * 0.043;
			for (let k = 0; k < 5; k++) { const u = 0.2 + k * 0.062, w = w0 * TP(u); tooth(u, 0.072 - k * 0.004, w, -1, k === 4 ? 0.085 : 0.05, k === 4 ? 0.02 : 0.016); }
			for (let k = 0; k < 4; k++) { const u = 0.235 + k * 0.06, w = w0 * TP(u); tooth(u, -0.056 + k * 0.007, w, 1, k === 3 ? 0.07 : 0.045, 0.015); }
		}
		// tongue
		const tp = [hp(0.12, 0.0), hp(0.26, -0.008), hp(0.40, -0.004), hp(0.50, 0.02), hp(0.565, 0.07)];
		addTube(hull, new THREE.CatmullRomCurve3(tp).getPoints(LOW ? 6 : 12), (t) => 0.024 * (1 - t * 0.8), 6, { col: C_TONGUE, band: BAND_PLAIN, flat: 0.45, ref: new V3(1, 0, 0), capEnd: true });
	})();

	// ------------------------------------------------------------------ DECK
	(function () {
		const xs = [-0.72, -0.36, 0, 0.36, 0.72];
		const strip = (z0, z1, y, nz) => {
			const rows = [];
			for (let r = 0; r <= nz; r++) {
				const z = lerp(z0, z1, r / nz), h = hullAtY(z, y), hw = h ? Math.max(0.01, h.x - 0.012) : 0.01;
				rows.push(xs.map(x => new V3(clamp(x, -hw, hw), y, z)));
			}
			fit.addGrid(rows, (r, c, p) => [p.z * U_PER_UNIT, lerp(BAND_DECK[0], BAND_DECK[1], tri(p.x / 0.36))], C_DECK, new V3(0, 1, 0));
		};
		strip(-RAISED_Z, RAISED_Z, DECK_Y, LOW ? 10 : 20);
		strip(RAISED_Z, DECK_END, RAISED_Y, LOW ? 3 : 6);
		strip(-DECK_END, -RAISED_Z, RAISED_Y, LOW ? 3 : 6);
		for (const sz of [1, -1]) {
			const rows = [];
			for (let r = 0; r <= 3; r++) {
				const y = lerp(DECK_Y, RAISED_Y, r / 3), h = hullAtY(sz * RAISED_Z, y), hw = h ? h.x - 0.012 : 0.01;
				rows.push(xs.map(x => new V3(clamp(x, -hw, hw), y, sz * RAISED_Z)));
			}
			fit.addGrid(rows, (r, c, p) => [p.x * U_PER_UNIT + 0.4, lerp(BAND_DECK[0], BAND_DECK[1], tri(p.y / 0.42))], mulCol(C_DECK, 0.8), new V3(0, 0, -sz));
		}
	})();

	// ------------------------------------------------------------------ RIBS, THWARTS
	const ribZ = [];
	for (let k = -6; k <= 6; k++) ribZ.push(k * 0.38);
	ribZ.forEach((z0) => {
		const dy = Math.abs(z0) > RAISED_Z ? RAISED_Y : DECK_Y;
		const h = hullAtY(z0, dy - 0.03);
		if (!h) return;
		const n = LOW ? 5 : 9, pts = [], fr = [];
		let len = 0;
		for (let k = 0; k <= n; k++) {
			const g = lerp(h.g, 0.975, k / n), f = hullFrame(sAt(z0, g), g);
			const p = f.p.clone().addScaledVector(f.n, -plankT(0) * 0.55);
			if (k > 0) len += p.distanceTo(pts[k - 1]);
			pts.push(p);
			fr.push({ p: p, a: f.n.clone().negate(), b: new V3(0, 0, 1), t: f.tg, len: len, sa: 1 - 0.45 * k / n, sb: 1 });
		}
		sideFit.addSweep(fr, [[0, -0.032], [0.062, -0.026], [0.062, 0.026], [0, 0.032]], { hard: true, capEnd: true, col: C_RIB, band: BAND_PLAIN, uOff: z0 });
	});
	const boxUV = (axis, band, off) => (u, v, lx, ly, lz, w) => {
		const al = axis === 'x' ? w.x : (axis === 'y' ? w.y : w.z);
		const cr = axis === 'x' ? (w.y * 3 + w.z * 3) : (axis === 'y' ? (w.x * 4 + w.z * 4) : (w.x * 3 + w.y * 3));
		return [al * U_PER_UNIT + (off || 0), lerp(band[0], band[1], tri(cr + (off || 0) * 7))];
	};
	function addBox(acc, sx, sy, sz, x, y, z, col, axis, off, rot) {
		const m = new THREE.Matrix4();
		if (rot) m.makeRotationFromEuler(rot);
		m.setPosition(x, y, z);
		acc.addGeo(new THREE.BoxGeometry(sx, sy, sz), { matrix: m, col: col, uv: boxUV(axis || 'x', BAND_PLAIN, off) });
	}
	const THWART_Y = 0.345;
	ribZ.forEach((z0, k) => {
		if (Math.abs(z0) > 1.95) return;
		const h = hullAtY(z0, THWART_Y);
		if (!h) return;
		const hw = h.x - 0.02;
		addBox(fit, hw * 2, 0.034, Math.abs(z0) < 0.01 ? 0.24 : 0.17, 0, THWART_Y, z0, mulCol(C_THWART, 0.92 + 0.16 * R1()), 'x', k * 0.37);
		// knees under the bench
		addBox(fit, 0.05, THWART_Y - DECK_Y, 0.05, 0, (THWART_Y + DECK_Y) / 2 - 0.015, z0, C_RIB, 'y', k * 0.2);
	});

	// ------------------------------------------------------------------ deck clutter: barrels, sea chest, coiled rope
	(function () {
		let barrel = (x, y, z, sc) => {
			const bp = [[0.0005, 0], [0.078, 0], [0.094, 0.06], [0.1, 0.13], [0.094, 0.2], [0.078, 0.26], [0.066, 0.262], [0.0005, 0.25]].map(p => new THREE.Vector2(p[0] * sc, p[1] * sc));
			fit.addGeo(new THREE.LatheGeometry(bp, LOW ? 8 : 12), {
				matrix: new THREE.Matrix4().makeTranslation(x, y, z),
				col: C_THWART,
				uv: (u, v, lx, ly) => [ly * 1.4 + u * 3, lerp(BAND_DECK[0], BAND_DECK[1], tri(u * 12))]
			});
		};
		const barrel0 = barrel;
		barrel = (x, y, z, sc) => {
			barrel0(x, y, z, sc);
			for (const q of [[0.05, 0.092], [0.21, 0.092]]) {
				const hg = new THREE.TorusGeometry(q[1] * sc, 0.007 * sc, 4, LOW ? 8 : 12);
				iron.addGeo(hg, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y + q[0] * sc, z), col: [0.2, 0.19, 0.19] });
			}
		};
		barrel(-0.13, RAISED_Y, 2.2, 1.0);
		barrel(0.1, RAISED_Y, 2.38, 0.8);
		barrel(0.3, DECK_Y, -1.72, 0.95);
		// sea chest on the after deck
		addBox(fit, 0.3, 0.15, 0.17, 0.02, RAISED_Y + 0.075, -2.2, mulCol(C_RIB, 1.1), 'x', 0.3);
		addBox(fit, 0.32, 0.03, 0.19, 0.02, RAISED_Y + 0.165, -2.2, mulCol(C_RIB, 0.85), 'x', 0.6);
		iron.addGeo(new THREE.BoxGeometry(0.05, 0.07, 0.012), { matrix: new THREE.Matrix4().makeTranslation(0.02, RAISED_Y + 0.12, -2.2 + 0.09), col: C_IRON });
		// coiled rope by the mast
		for (let k = 0; k < 3; k++) {
			const tg = new THREE.TorusGeometry(0.1 - k * 0.012, 0.02, 5, LOW ? 8 : 12);
			rope.addGeo(tg, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-0.3, DECK_Y + 0.02 + k * 0.032, -1.33) });
		}
	})();

	// ------------------------------------------------------------------ MAST, YARD, MAST FISH
	const MAST_TOP = 4.2, YARD_Y = 3.8, YARD_Z = 0.13, YARD_HALF = 1.62;
	(function () {
		const seg = LOW ? 7 : 10;
		const mp = [];
		for (let k = 0; k <= 6; k++) { const t = k / 6; mp.push(new THREE.Vector2(lerp(0.075, 0.043, Math.pow(t, 1.3)), lerp(DECK_Y, MAST_TOP - 0.05, t))); }
		mp.push(new THREE.Vector2(0.03, MAST_TOP - 0.01), new THREE.Vector2(0.0005, MAST_TOP));
		fit.addGeo(new THREE.LatheGeometry(mp, seg), { col: C_MAST, uv: (u, v, lx, ly) => [ly * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], tri(u * 2))] });
		// yard
		const yp = [new THREE.Vector2(0.0005, -YARD_HALF)];
		for (let k = 0; k <= 8; k++) { const t = -1 + k / 4; yp.push(new THREE.Vector2(0.055 * (1 - 0.5 * t * t), t * YARD_HALF * 0.995)); }
		yp.push(new THREE.Vector2(0.0005, YARD_HALF));
		const ym = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, YARD_Y, YARD_Z);
		yardAcc.addGeo(new THREE.LatheGeometry(yp, LOW ? 6 : 8), { matrix: ym, col: mulCol(C_MAST, 0.9), uv: (u, v, lx, ly) => [ly * U_PER_UNIT + 0.5, lerp(BAND_PLAIN[0], BAND_PLAIN[1], tri(u * 2))] });
		// mast fish (the big partner block on deck)
		const sh = new THREE.Shape();
		sh.moveTo(-0.62, 0); sh.lineTo(-0.5, 0.06); sh.lineTo(-0.2, 0.15); sh.lineTo(0.2, 0.15); sh.lineTo(0.5, 0.06); sh.lineTo(0.62, 0); sh.lineTo(-0.62, 0);
		const g = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 });
		const m = new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0.07, DECK_Y, 0);
		fit.addGeo(g, { matrix: m, col: C_THWART, uv: (u, v, lx, ly, lz) => [lx * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], clamp(0.1 + ly * 2 + lz * 4, 0.02, 0.98))] });
	})();

	// ------------------------------------------------------------------ SAIL (billowing, panelled, striped by vertex colour)
	const SAIL_W = 3.0, SAIL_H = 2.74, SAIL_TOP = YARD_Y - 0.055, SAIL_D = 0.72, NSTRIPE = 7;
	function sailPt(a, b, out) {
		const aa = Math.abs(a);
		const bell = Math.pow(Math.max(0, 1 - Math.pow(aa, 2.2)), 0.9);
		const prof = Math.sin(Math.PI * 0.62 * b);
		const st = (a + 1) / 2 * NSTRIPE, fr = clamp(st - Math.floor(st + 1e-9), 0, 1);
		const scal = Math.sin(Math.PI * fr);
		const z = YARD_Z + 0.02 + SAIL_D * prof * bell + 0.03 * prof * scal * (0.35 + 0.65 * bell)
			+ 0.10 * Math.sin(Math.PI * b) * aa * aa * aa - 0.24 * b * b * Math.pow(aa, 4);
		return out.set(a * SAIL_W / 2 * (1 - 0.055 * prof), SAIL_TOP - SAIL_H * b * (1 - 0.055 * b * (1 - a * a)), z);
	}
	const sailGeo = (function () {
		const MC = LOW ? 3 : 6, MR = LOW ? 14 : 28;
		const pos = [], nor = [], uv = [], col = [], idx = [];
		const pc = new THREE.Color(sailHex);
		const pw = (typeof opts.stripeColour === 'number') ? new THREE.Color(opts.stripeColour) : null;
		const cP = [pc.r, pc.g, pc.b], cW = pw ? [pw.r, pw.g, pw.b] : [0.90, 0.86, 0.74];
		const p = new V3(), pa0 = new V3(), pa1 = new V3(), pb0 = new V3(), pb1 = new V3(), n = new V3();
		const eps = 1e-3;
		for (let s = 0; s < NSTRIPE; s++) {
			const aL = -1 + 2 * s / NSTRIPE, aR = -1 + 2 * (s + 1) / NSTRIPE, cc = (s % 2 === 0) ? cP : cW;
			const base = pos.length / 3;
			for (let r = 0; r <= MR; r++) for (let c = 0; c <= MC; c++) {
				const a = lerp(aL, aR, c / MC), b = r / MR;
				sailPt(a, b, p);
				sailPt(clamp(a - eps, aL + 1e-5, aR - 1e-5), b, pa0); sailPt(clamp(a + eps, aL + 1e-5, aR - 1e-5), b, pa1);
				sailPt(a, Math.max(0, b - eps), pb0); sailPt(a, Math.min(1, b + eps), pb1);
				n.crossVectors(pb1.sub(pb0), pa1.sub(pa0)).normalize();
				pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push((a + 1) / 2, 1 - b); col.push(cc[0], cc[1], cc[2]);
			}
			for (let r = 0; r < MR; r++) for (let c = 0; c < MC; c++) {
				const a = base + r * (MC + 1) + c, b2 = a + 1, d = a + MC + 1, e = d + 1;
				idx.push(a, d, b2, b2, d, e);
			}
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
		g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
		g.setIndex(idx);
		g.computeBoundingSphere();
		return g;
	})();

	// ------------------------------------------------------------------ RIGGING
	const ROPE_R = 0.013;
	const rigLines = [];
	function line(acc, a, b, sag, r) {
		const n = sag ? (LOW ? 5 : 9) : 1, pts = [];
		for (let k = 0; k <= n; k++) { const t = k / n; const p = new V3().lerpVectors(a, b, t); p.y -= (sag || 0) * 4 * t * (1 - t); pts.push(p); }
		addTube(acc, pts, r || ROPE_R, 5, { col: [1, 1, 1] });
	}
	const gunwale = (z, lift) => { const f = hullFrame(sAt(z, 1), 1); return f.p.clone().add(new V3(-0.01, lift === undefined ? 0.03 : lift, 0)); };
	const clew = sailPt(1, 1, new V3());
	(function () {
		const top = MAST_TOP - 0.16;
		const fore = postAtY(1.56, true), aft = postAtY(1.52, false);
		line(rope, new V3(0, top, 0.03), fore.p.clone().addScaledVector(fore.a, -0.03));     // forestay
		line(rope, new V3(0, top, -0.03), aft.p.clone().addScaledVector(aft.a, -0.03));      // backstay
		for (const z of [-0.32, -0.66, -1.0]) line(sideRope, new V3(0.03, top - 0.05, -0.02), gunwale(z), 0, 0.011);   // shrouds
		for (const sx of [1, -1]) {                                                                           // lifts
			addTube(yardAcc, [new V3(0.02 * sx, MAST_TOP - 0.08, 0.05), new V3((YARD_HALF - 0.12) * sx, YARD_Y + 0.045, YARD_Z)], 0.01, 5, { col: C_ROPE_W, band: BAND_PLAIN });
		}
		// braces, sheets and bowlines run from the yard and sail to the
		// hull: drawn as straight lines the renderer re-aims when the yard
		// is braced round (see userData.rigLines)
		const bow = sailPt(1, 0.62, new V3());
		for (const sx of [1, -1]) {
			const g1 = gunwale(-2.3), g2 = gunwale(-1.42), g3 = gunwale(1.9);
			rigLines.push(
				{ a: [(YARD_HALF - 0.04) * sx, YARD_Y, YARD_Z], b: [g1.x * sx, g1.y, g1.z], onSail: false, r: 0.011 },
				{ a: [clew.x * sx, clew.y, clew.z], b: [g2.x * sx, g2.y, g2.z], onSail: true, r: 0.012 },
				{ a: [bow.x * sx, bow.y, bow.z], b: [g3.x * sx, g3.y, g3.z], onSail: true, r: 0.009 },
			);
		}
		line(rope, new V3(0.0, top + 0.02, -0.06), new V3(0.1, DECK_Y + 0.02, -0.72), 0, 0.011);              // halyard
		// parrel: rope collar holding the yard to the mast
		const tg = new THREE.TorusGeometry(0.085, 0.02, 5, LOW ? 8 : 12);
		yardAcc.addGeo(tg, { matrix: new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, YARD_Y, 0.05), col: C_ROPE_W, uv: ROPE_UV });
		// yard lashings
		for (const x of [-1.2, -0.6, 0.6, 1.2]) {
			const lg = new THREE.TorusGeometry(0.052, 0.012, 4, LOW ? 6 : 8);
			yardAcc.addGeo(lg, { matrix: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, YARD_Y, YARD_Z), col: C_ROPE_W, uv: ROPE_UV });
		}
		// stay lashings on the posts
		for (const f of [fore, aft]) {
			const lg = new THREE.TorusGeometry(0.072 * f.sa, 0.017, 4, LOW ? 6 : 10);
			const c = f.p.clone().addScaledVector(f.a, 0.016 * f.sa);
			const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), f.t);
			rope.addGeo(lg, { matrix: new THREE.Matrix4().makeRotationFromQuaternion(q).scale(new V3(0.74, 1, 1)).setPosition(c) });
		}
	})();

	// ------------------------------------------------------------------ SHIELDS along the gunwale
	const SH_R = 0.19, NSH = 14, SH_Z0 = -2.05, SH_DZ = 4.1 / (NSH - 1);
	(function () {
		const seg = LOW ? 10 : 18;
		// Shallow dish: the front lathe and the flat back are separate so neither smears across the atlas.
		const prof = [[0.172, -0.01], [0.173, -0.003], [0.168, 0.002], [0.15, 0.005], [0.10, 0.009], [0.05, 0.0115], [0.0005, 0.012]]
			.map(p => new THREE.Vector2(p[0] * SH_R / 0.172, p[1]));
		const backProf = [[0.0005, -0.01], [0.172, -0.01]].map(p => new THREE.Vector2(p[0] * SH_R / 0.172, p[1]));
		const bossProf = [[0.064, 0.0], [0.062, 0.008], [0.046, 0.012], [0.041, 0.03], [0.03, 0.045], [0.014, 0.054], [0.0005, 0.056]].map(p => new THREE.Vector2(p[0], p[1]));
		const toLocal = new THREE.Matrix4().makeRotationX(Math.PI / 2);   // lathe Y -> shield Z (outward)
		const order = [0, 4, 6, 1, 2, 5, 3, 7];
		const RS = rng(555);
		for (const sx of [1, -1]) for (let k = 0; k < NSH; k++) {
			const z = SH_Z0 + k * SH_DZ;
			const f = hullFrame(sAt(z, 1), 1);
			const n = f.n.clone(), tg = f.tg.clone(), p = f.p.clone();
			if (sx < 0) { n.x = -n.x; tg.x = -tg.x; p.x = -p.x; }
			const Z = n.clone().multiplyScalar(0.8).add(new V3(sx * 0.2, 0, 0)).normalize();   // a touch more upright than the flare
			const Y = tg.clone().addScaledVector(Z, -tg.dot(Z)).normalize();
			const X = new V3().crossVectors(Y, Z);
			// shingle: every shield leans on the next one aft
			const al = 0.13 * (X.z > 0 ? 1 : -1);
			const X2 = X.clone().multiplyScalar(Math.cos(al)).addScaledVector(Z, Math.sin(al));
			const Z2 = new V3().crossVectors(X2, Y).normalize();
			const c = p.clone().addScaledVector(Y, -0.045).addScaledVector(n, 0.062);
			const M = new THREE.Matrix4().makeBasis(X2, Y, Z2).setPosition(c).multiply(toLocal);
			const cell = order[(k + (sx > 0 ? 0 : 3)) % 8], spin = (RS() - 0.5) * 0.7, cs = Math.cos(spin), sn = Math.sin(spin);
			const shUV = (back) => (u, v, lx, ly, lz) => {
				const ci = back ? 8 : cell;
				let px = lx / SH_R, py = -lz / SH_R;
				if (ly < -0.0095 && !back) { px *= 1.12; py *= 1.12; }    // rim edge samples the rawhide border
				if (!back) { const qx = px * cs - py * sn, qy = px * sn + py * cs; px = qx; py = qy; }
				const cx = (ci % 3 + 0.5) * SH_CELL, cy = (Math.floor(ci / 3) + 0.5) * SH_CELL;
				return [(cx + px * SH_RP) / TEX, 1 - (cy - py * SH_RP) / TEX];
			};
			shields.addGeo(new THREE.LatheGeometry(prof, seg), { matrix: M, uv: shUV(false) });
			shields.addGeo(new THREE.LatheGeometry(backProf, seg), { matrix: M, uv: shUV(true) });
			const MB = M.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.006, 0));
			iron.addGeo(new THREE.LatheGeometry(bossProf, LOW ? 7 : 10), { matrix: MB, col: C_IRON });
		}
	})();

	// ------------------------------------------------------------------ OARS (one InstancedMesh)
	const NOAR = 13, OAR_OUT = 1.78, OAR_G = 0.665;
	const oarAcc = new Acc();
	(function () {
		// loom: thick at the handle, slimming towards the blade (cylinder +Y = outboard)
		const shaft = new THREE.CylinderGeometry(0.0125, 0.019, 1.70, LOW ? 5 : 6, 1);
		const rz = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);   // +Y -> +X
		const woodU = (u, v, lx, ly) => [ly * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], tri(u * 2))];
		oarAcc.addGeo(shaft, { matrix: new THREE.Matrix4().makeTranslation(-0.36 + 0.85, 0, 0).multiply(rz), col: C_OAR, uv: woodU });
		// blade: a broad, flat leaf over the outboard 0.46 (0.13 wide, 0.02 thick, flat face upright)
		const bp = [[0.0005, 0], [0.012, 0.0], [0.03, 0.06], [0.055, 0.16], [0.065, 0.28], [0.064, 0.38], [0.05, 0.44], [0.0005, 0.46]].map(p => new THREE.Vector2(p[0], p[1]));
		const bm = new THREE.Matrix4().makeTranslation(OAR_OUT - 0.46, 0, 0).multiply(rz).multiply(new THREE.Matrix4().makeScale(1, 1, 0.155));
		oarAcc.addGeo(new THREE.LatheGeometry(bp, LOW ? 6 : 8), { matrix: bm, col: (p) => mixCol(mulCol(C_OAR, 0.95), [0.42, 0.33, 0.22], smooth(OAR_OUT - 0.2, OAR_OUT, p.x)), uv: woodU });
		// handle grip
		oarAcc.addGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 5, 1), { matrix: new THREE.Matrix4().makeTranslation(-0.33, 0, 0).multiply(rz), col: mulCol(C_OAR, 0.6), uv: woodU });
	})();
	const oarData = [];
	for (const sx of [1, -1]) for (let k = 0; k < NOAR; k++) {
		const z = SH_Z0 + (k + 0.5) * SH_DZ;
		const f = hullFrame(sAt(z, OAR_G), OAR_G);
		const px = (f.p.x + f.n.x * 0.016) * sx, py = f.p.y + f.n.y * 0.016, pz = f.p.z + f.n.z * 0.016;
		const dip = Math.asin(clamp((py - 0.07) / OAR_OUT, -1, 1));    // rest pose: blades held just clear of the water
		const yaw = 0.2 + 0.05 * Math.sin(k * 1.7);
		oarData.push({ pivot: [px, py, pz], side: sx, yaw: yaw, dip: dip });
		// oar port: a dark hole with a wooden surround, on the hull skin
		const n = f.n.clone(); n.x *= sx;
		const c = new V3(px, py, pz);
		const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), n);
		const m = new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(c.clone().addScaledVector(n, 0.004));
		hull.addGeo(new THREE.RingGeometry(0.026, 0.048, LOW ? 8 : 12), { matrix: m, col: C_RAIL, uv: () => [0.3, (BAND_PLAIN[0] + BAND_PLAIN[1]) / 2] });
		hull.addGeo(new THREE.CircleGeometry(0.027, LOW ? 8 : 12), { matrix: m.clone().setPosition(c.clone().addScaledVector(n, 0.003)), col: C_BLACK, uv: () => [0.3, (BAND_PLAIN[0] + BAND_PLAIN[1]) / 2] });
	}

	// ------------------------------------------------------------------ STEERING OAR (starboard quarter, -X)
	(function () {
		const RAKE = 0.35;                                               // ~20 deg: loom top forward, blade trailing aft
		const A = new V3(0, Math.cos(RAKE), Math.sin(RAKE));             // up the loom
		const B = new V3(0, -Math.sin(RAKE), Math.cos(RAKE));            // forward, square to the loom
		const zP = -2.47, yP = 0.42, SR = 0.03;
		const hP = hullAtY(zP, yP), hxP = hP ? hP.x : 0.4;
		// gunwale where the loom passes it; the tiller crosses just above the rail
		let dTop = 0.5;
		for (let it = 0; it < 4; it++) { const zt = zP + A.z * dTop, gy = hullFrame(sAt(zt, 1), 1).p.y; dTop = (gy + 0.075 - yP) / A.y + 0.03; }
		// stand the loom just clear of the planking (and the rail) all the way up
		let need = hxP;
		for (let k = 0; k <= 12; k++) {
			const d = dTop * k / 12, y = yP + A.y * d, z = zP + A.z * d, h = hullAtY(z, y);
			if (h) need = Math.max(need, h.x + 0.01); else need = Math.max(need, hullFrame(sAt(z, 1), 1).p.x + 0.04);
		}
		const sx = -(need + SR + 0.006);
		const P = new V3(sx, yP, zP);
		const at = (d, b) => P.clone().addScaledVector(A, d).addScaledVector(B, b || 0);
		const wet = (p) => mixCol(C_THWART, C_SLIME, smooth(0.07, -0.05, p.y));
		// blade: broad below the waterline, flaring aft
		const sh = new THREE.Shape();
		const v = (b, a) => new THREE.Vector2(b, a);
		sh.moveTo(0.028, -0.2);
		sh.splineThru([v(0.05, -0.38), v(0.07, -0.62), v(0.06, -0.82), v(0.0, -0.9)]);
		sh.splineThru([v(-0.13, -0.88), v(-0.24, -0.74), v(-0.26, -0.54), v(-0.18, -0.36), v(-0.06, -0.24), v(-0.028, -0.2)]);
		sh.lineTo(0.028, -0.2);
		const g = new THREE.ExtrudeGeometry(sh, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: LOW ? 4 : 8 });
		g.translate(0, 0, -0.013);
		const m = new THREE.Matrix4().makeBasis(B, A, new V3(-1, 0, 0)).setPosition(P);
		const uvf = (u, vv, lx, ly) => [ly * U_PER_UNIT, lerp(BAND_PLAIN[0], BAND_PLAIN[1], clamp(0.5 + lx * 3.2, 0.02, 0.98))];
		fit.addGeo(g, { matrix: m, col: wet, uv: uvf });
		// loom
		addTube(fit, [at(-0.36), at(0), at(dTop)], (t) => SR * (1.1 - 0.15 * t), 7, { col: wet, capEnd: true, ref: new V3(1, 0, 0) });
		// tiller: square to the loom, running inboard just above the gunwale
		const tb = at(dTop - 0.035);
		addTube(fit, [tb.clone().add(new V3(-0.03, 0, 0)), tb.clone().add(new V3(0.3, 0.012, 0)), tb.clone().add(new V3(0.6, 0.03, 0))], (t) => 0.021 - 0.007 * t, 6, { col: C_OAR, caps: true, ref: new V3(0, 1, 0) });
		// boss: a block of oak on the quarter, bedded into the planking, that the loom bears against
		const bossOut = -sx - SR, bossIn = hxP - 0.05;
		addBox(fit, bossOut - bossIn, 0.15, 0.2, -(bossOut + bossIn) / 2, yP, zP, mulCol(C_RIB, 0.85), 'z', 0.4);
		// withy strap round the loom at the gunwale
		const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), A);
		const wp = at(dTop - 0.2);
		rope.addGeo(new THREE.TorusGeometry(SR + 0.012, 0.012, 4, 10), { matrix: new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(wp) });
		rope.addGeo(new THREE.TorusGeometry(SR + 0.012, 0.012, 4, 10), { matrix: new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(at(0.02)) });
	})();

	// ------------------------------------------------------------------ masthead vane (gilded) and pennant
	(function () {
		const sh = new THREE.Shape();
		sh.moveTo(0, 0); sh.lineTo(0.3, 0.02); sh.quadraticCurveTo(0.27, 0.15, 0.02, 0.2); sh.lineTo(0, 0);
		const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false, curveSegments: 5 });
		iron.addGeo(g, { matrix: new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(0.006, MAST_TOP - 0.02, 0.03), col: C_GOLD });
		iron.addGeo(new THREE.SphereGeometry(0.04, 8, 6), { matrix: new THREE.Matrix4().makeTranslation(0, MAST_TOP + 0.02, 0), col: C_GOLD });
	})();
	const pennantGeo = (function () {
		const n = LOW ? 6 : 12, pos = [], uv = [], col = [], idx = [];
		const pc = new THREE.Color(sailHex);
		for (let k = 0; k <= n; k++) {
			// a long owner's streamer, big enough to read from overhead
			const t = k / n, z = 0.05 + t * 1.45, hw = 0.12 * (1 - t * 0.85), x = 0.1 * Math.sin(t * 7.5) * t, y = MAST_TOP - 0.22 - 0.14 * t * t + 0.04 * Math.sin(t * 5);
			pos.push(x, y + hw, z, x, y - hw, z);
			uv.push(0.02 + t * 0.05, 0.5, 0.02 + t * 0.05, 0.45);
			col.push(pc.r, pc.g, pc.b, pc.r, pc.g, pc.b);
			if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
		g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
		return g;
	})();

	// ------------------------------------------------------------------ merge + materials + meshes
	hull.append(side, false).append(side, true);
	fit.append(sideFit, false).append(sideFit, true);
	rope.append(sideRope, false).append(sideRope, true);

	const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodTex, bumpScale: 0.006, vertexColors: true, roughness: 0.78, metalness: 0.0 });
	const shieldMat = new THREE.MeshStandardMaterial({ map: shieldTex, roughness: 0.7, metalness: 0.0 });
	const ironMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.38 });
	const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8f7c58, roughness: 1.0, metalness: 0.0 });
	const sailMat = new THREE.MeshStandardMaterial({ map: sailTex, vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0.0 });
	// Cheap cloth translucency: a little of the cloth's own colour glows through, so the shaded face never goes dead.
	// (module-scope functions: a closure made in here would keep this whole
	// build's scratch arrays alive as long as the material lives)
	sailMat.onBeforeCompile = sailTranslucency;
	sailMat.customProgramCacheKey = sailProgramKey;

	const group = new THREE.Group(); group.name = 'longship';
	const add = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; group.add(m); return m; };
	add(hull.build(), woodMat, 'hull');
	add(fit.build(), woodMat, 'fittings');
	add(shields.build(), shieldMat, 'shields');
	add(iron.build(), ironMat, 'ironwork');
	add(rope.build(), ropeMat, 'rigging');
	const sail = add(sailGeo, sailMat, 'sail');
	const pennant = add(pennantGeo, sailMat, 'pennant');
	const yard = add(yardAcc.build(), woodMat, 'yard');
	// braces, sheets and bowlines: one unit rope per line, aimed below
	const lineGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
	lineGeo.translate(0, 0.5, 0);
	const rigRopes = new THREE.InstancedMesh(lineGeo, ropeMat, rigLines.length);
	rigRopes.name = 'rigRopes'; rigRopes.frustumCulled = false;
	group.add(rigRopes);
	aimRigLines(THREE, rigRopes, rigLines, 0, 1);

	const oars = new THREE.InstancedMesh(oarAcc.build(), woodMat, oarData.length);
	oars.name = 'oars'; oars.frustumCulled = false;
	const mT = new THREE.Matrix4(), mY = new THREE.Matrix4(), mZ = new THREE.Matrix4();
	oarData.forEach((o, k) => {
		mT.makeTranslation(o.pivot[0], o.pivot[1], o.pivot[2]);
		mY.makeRotationY(o.side > 0 ? o.yaw : Math.PI - o.yaw);
		mZ.makeRotationZ(-o.dip);
		oars.setMatrixAt(k, mT.multiply(mY).multiply(mZ));
	});
	oars.instanceMatrix.needsUpdate = true;
	group.add(oars);

	group.userData.oars = oars;
	group.userData.oarData = oarData;
	group.userData.sail = sail;
	group.userData.pennant = pennant;
	group.userData.yard = yard;
	group.userData.rigRopes = rigRopes;
	group.userData.rigLines = rigLines;
	// (handed over this way rather than imported by the renderer)
	group.userData.aimRigLines = aimRigLines;
	return group;
}

const _rigA = { x: 0, y: 0, z: 0 };
let _rigM = null, _rigQ = null, _rigV = null, _rigUp = null, _rigS = null, _rigP = null;
/**
 * Aim the braces, sheets and bowlines at a yard braced round by `brace`
 * radians (about the mast) with the sail's belly at `fill` (its z scale).
 * Each line runs from its point on the yard or sail to its fixed point on
 * the hull.
 */
export function aimRigLines(THREE, mesh, lines, brace, fill) {
	if (!mesh || !lines) return;
	if (!_rigM) {
		_rigM = new THREE.Matrix4(); _rigQ = new THREE.Quaternion(); _rigV = new THREE.Vector3();
		_rigUp = new THREE.Vector3(0, 1, 0); _rigS = new THREE.Vector3(); _rigP = new THREE.Vector3();
	}
	const c = Math.cos(brace), s = Math.sin(brace);
	for (let k = 0; k < lines.length; k++) {
		const L = lines[k];
		const az = L.onSail ? L.a[2] * fill : L.a[2];
		// rotation about +Y: x' = x cos + z sin, z' = -x sin + z cos
		_rigA.x = L.a[0] * c + az * s;
		_rigA.y = L.a[1];
		_rigA.z = -L.a[0] * s + az * c;
		_rigV.set(L.b[0] - _rigA.x, L.b[1] - _rigA.y, L.b[2] - _rigA.z);
		const len = _rigV.length() || 1e-4;
		_rigQ.setFromUnitVectors(_rigUp, _rigV.multiplyScalar(1 / len));
		_rigS.set(L.r, len, L.r);
		_rigP.set(_rigA.x, _rigA.y, _rigA.z);
		_rigM.compose(_rigP, _rigQ, _rigS);
		mesh.setMatrixAt(k, _rigM);
	}
	mesh.instanceMatrix.needsUpdate = true;
}

// Loading hooks: the builder is always ready where it is loaded at all
// (in production it comes with the rest of the Viking code in
// dist/viking.bundle.js — vikingLazy/runtime.js).
export function longshipReady() {
	return true;
}
export function preloadLongship(onReady) {
	if (typeof onReady === 'function') onReady();
}

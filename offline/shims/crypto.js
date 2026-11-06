/**
 * The bits of Node's `crypto` the game uses, for the offline engine.
 * Offline there's one player and no network, so these only need to be
 * random and consistent, not hardened.
 */

'use strict';

const webCrypto = globalThis.crypto;

function fillRandom(bytes) {
	if (webCrypto && typeof webCrypto.getRandomValues === 'function') return webCrypto.getRandomValues(bytes);
	for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
	return bytes;
}

function toHex(bytes) {
	let out = '';
	for (const b of bytes) out += b.toString(16).padStart(2, '0');
	return out;
}

/** A Uint8Array that stringifies like a Buffer (hex/base64 only). */
function asBufferLike(bytes) {
	bytes.toString = function toString(encoding = 'hex') {
		if (encoding === 'base64' || encoding === 'base64url') {
			let s = btoa(String.fromCharCode(...this));
			if (encoding === 'base64url') s = s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
			return s;
		}
		return toHex(this);
	};
	return bytes;
}

function randomBytes(n) {
	return asBufferLike(fillRandom(new Uint8Array(n)));
}

function randomUUID() {
	if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
	const b = fillRandom(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = toHex(b);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Compact synchronous SHA-256 (WebCrypto's digest is async only).
const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256(bytes) {
	const len = bytes.length;
	const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
	padded.set(bytes);
	padded[len] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 4, len * 8);
	view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
	const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
	const W = new Uint32Array(64);
	const rotr = (x, n) => (x >>> n) | (x << (32 - n));
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
			const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
			W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = H;
		for (let i = 0; i < 64; i++) {
			const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
			const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
			h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
		}
		H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
	}
	const out = new Uint8Array(32);
	const outView = new DataView(out.buffer);
	for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i]);
	return out;
}

function toBytes(data) {
	if (data instanceof Uint8Array) return data;
	return new TextEncoder().encode(String(data));
}

function digestOutput(bytes, encoding) {
	return encoding ? asBufferLike(bytes).toString(encoding) : asBufferLike(bytes);
}

function createHash(algorithm) {
	if (String(algorithm).toLowerCase() !== 'sha256') throw new Error(`offline crypto: unsupported hash ${algorithm}`);
	const chunks = [];
	return {
		update(data) { chunks.push(toBytes(data)); return this; },
		digest(encoding) {
			const total = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
			let o = 0;
			for (const c of chunks) { total.set(c, o); o += c.length; }
			return digestOutput(sha256(total), encoding);
		},
	};
}

function createHmac(algorithm, key) {
	const hash = () => createHash(algorithm);
	let k = toBytes(key);
	if (k.length > 64) k = sha256(k);
	const block = new Uint8Array(64);
	block.set(k);
	const ipad = block.map(b => b ^ 0x36);
	const opad = block.map(b => b ^ 0x5c);
	const inner = hash().update(ipad);
	return {
		update(data) { inner.update(data); return this; },
		digest(encoding) {
			const innerDigest = inner.digest();
			const outer = hash().update(opad).update(innerDigest).digest();
			return digestOutput(outer, encoding);
		},
	};
}

function timingSafeEqual(a, b) {
	if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

module.exports = { randomBytes, randomUUID, createHash, createHmac, timingSafeEqual };

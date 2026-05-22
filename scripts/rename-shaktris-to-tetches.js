#!/usr/bin/env node
/**
 * One-shot rebrand script: walks the repo and replaces every casing
 * of "Shaktris" / "Chesstris" with "Tetches", and every URL
 * `shaktris.com` / `chesstris.com` with `tetches.com`. Also rewrites
 * filesystem-path constants used by the deploy pipeline (`/var/www/
 * shaktris.live` → `/var/www/tetches.live`, PM2 process names,
 * etc.).
 *
 * Intentionally a script, not an inline sed-fest, so the diff is
 * reviewable and the substitution order is deterministic. Excludes
 * `node_modules`, `.git`, lockfiles, binary assets.
 *
 * Usage:
 *   node scripts/rename-shaktris-to-tetches.js           # dry run
 *   node scripts/rename-shaktris-to-tetches.js --apply   # actually edit
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');

// Order matters — most specific first so we don't double-replace.
const REPLACEMENTS = [
	// URLs / domain references
	{ from: /shaktris\.com/g, to: 'tetches.com' },
	{ from: /chesstris\.com/g, to: 'tetches.com' },
	{ from: /staging\.tetches\.com/g, to: 'staging.tetches.com' }, // idempotent guard
	// PM2 / deploy directory constants
	{ from: /shaktris-staging/g, to: 'tetches-staging' },
	{ from: /shaktris-production/g, to: 'tetches-production' },
	{ from: /\/var\/www\/shaktris\.live/g, to: '/var/www/tetches.live' },
	{ from: /\/var\/www\/shaktris\.staging/g, to: '/var/www/tetches.staging' },
	// Proper-noun branding
	{ from: /SHAKTRIS/g, to: 'TETCHES' },
	{ from: /Shaktris/g, to: 'Tetches' },
	{ from: /Chesstris/g, to: 'Tetches' },
	// Lowercase identifiers (storage keys, CSS class fragments, etc.)
	{ from: /shaktris/g, to: 'tetches' },
	{ from: /chesstris/g, to: 'tetches' },
];

const EXCLUDED_DIRS = new Set([
	'node_modules',
	'.git',
	'.cache',
	'dist',
	'build',
	'logs',
	'coverage',
]);

const EXCLUDED_FILES = new Set([
	'package-lock.json',
	'yarn.lock',
	// This script itself contains the literal "Shaktris" / "Chesstris"
	// strings we're rewriting — skip it so the patterns aren't broken.
	path.relative(ROOT, __filename),
]);

const BINARY_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp',
	'.mp3', '.wav', '.ogg', '.mp4', '.webm',
	'.woff', '.woff2', '.ttf', '.otf', '.eot',
	'.pdf', '.zip', '.tar', '.gz', '.tgz',
	'.bin', '.so', '.dll', '.exe',
]);

function walk(dir, hits) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith('.') && entry.name !== '.env.example' && entry.name !== '.gitignore' && entry.name !== '.cursor') {
			// Skip hidden dotfiles other than the few we want to update.
			continue;
		}
		const full = path.join(dir, entry.name);
		const rel = path.relative(ROOT, full);
		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			walk(full, hits);
			continue;
		}
		if (EXCLUDED_FILES.has(rel)) continue;
		const ext = path.extname(entry.name).toLowerCase();
		if (BINARY_EXTENSIONS.has(ext)) continue;
		hits.push(full);
	}
}

function processFile(file) {
	const original = fs.readFileSync(file, 'utf8');
	let updated = original;
	for (const { from, to } of REPLACEMENTS) {
		updated = updated.replace(from, to);
	}
	if (updated === original) return false;
	if (APPLY) fs.writeFileSync(file, updated, 'utf8');
	return true;
}

function main() {
	const files = [];
	walk(ROOT, files);
	const changed = [];
	for (const file of files) {
		try {
			if (processFile(file)) changed.push(path.relative(ROOT, file));
		} catch (error) {
			console.error(`[rename] failed ${file}: ${error.message}`);
		}
	}
	console.log(
		`${APPLY ? 'Rebranded' : 'Would rebrand'} ${changed.length} file(s):`
	);
	for (const rel of changed) console.log(`  ${rel}`);
	if (!APPLY) {
		console.log('\nRe-run with --apply to actually write the changes.');
	}
}

main();

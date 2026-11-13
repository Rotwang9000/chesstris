#!/usr/bin/env node
/**
 * Generate the client's longship rules mirror.
 *
 *   server/battle/shipRules.js  (CommonJS, the source of truth)
 *     → public/js/viking/shipRulesClient.js  (ESM, generated)
 *
 * The rules file is dependency-free and takes the board through
 * injected accessors, so the mirror is the very same code with its
 * CommonJS wrapper swapped for ESM exports. The client then feeds it
 * its own board and sea maths (see public/js/longships/shipEnv.js),
 * and move highlights equal what the server will accept.
 *
 *   node scripts/gen-ship-rules-client.js          write the mirror
 *   node scripts/gen-ship-rules-client.js --check  exit 1 if it is stale
 *
 * tests/ui/shipRulesParity.test.js runs the same check and compares
 * both modules on a battery of boards.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'server', 'battle', 'shipRules.js');
const TARGET = path.join(ROOT, 'public', 'js', 'viking', 'shipRulesClient.js');

const HEADER = `/*
 * GENERATED FILE: do not edit by hand.
 * Source: server/battle/shipRules.js
 * Regenerate: npm run gen:ship-rules
 * (tests/ui/shipRulesParity.test.js fails when this file is stale.)
 */
`;

/**
 * Turn the CommonJS rules module into an ES module.
 * @param {string} source
 * @returns {string}
 */
function toEsm(source) {
	if (/\brequire\s*\(/.test(source)) {
		throw new Error('shipRules.js must stay dependency-free to be mirrored (found require())');
	}
	const exportsMatch = source.match(/module\.exports\s*=\s*\{([\s\S]*?)\};?\s*$/);
	if (!exportsMatch) throw new Error('shipRules.js: could not find a trailing module.exports = { ... }');
	const names = exportsMatch[1]
		.split(',')
		.map(s => s.replace(/\/\/.*$/gm, '').trim())
		.filter(Boolean);
	for (const name of names) {
		if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
			throw new Error(`shipRules.js: only shorthand exports can be mirrored (got "${name}")`);
		}
	}
	const body = source
		.slice(0, exportsMatch.index)
		.replace(/^'use strict';\s*\n/m, '')
		.trimEnd();
	return `${HEADER}\n${body}\n\nexport {\n${names.map(n => `\t${n},`).join('\n')}\n};\n`;
}

function generate() {
	return toEsm(fs.readFileSync(SOURCE, 'utf8'));
}

if (require.main === module) {
	const out = generate();
	if (process.argv.includes('--check')) {
		const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
		if (current !== out) {
			console.error('public/js/viking/shipRulesClient.js is stale: run npm run gen:ship-rules');
			process.exit(1);
		}
		console.log('shipRulesClient.js is up to date');
	} else {
		fs.writeFileSync(TARGET, out);
		console.log(`wrote ${path.relative(ROOT, TARGET)}`);
	}
}

module.exports = { generate, toEsm, SOURCE, TARGET };

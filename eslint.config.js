/**
 * ESLint flat-config for Tetches.
 *
 * Scope is deliberately narrow on first pass: server-side CommonJS
 * (`server/`, `routes/`, `scripts/`, `server.js`) plus the security
 * test suites that exercise the same code paths. The browser
 * codebase under `public/js` is a heterogeneous mix of ESM and
 * inline scripts that needs its own pass; we'll widen the glob once
 * those files are normalised.
 *
 * The ruleset targets genuine bugs (undeclared vars, dead code) and
 * never style. CI gate is `npm run lint`; dev convenience is `npm
 * run lint:fix`.
 */

'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
	js.configs.recommended,
	{
		ignores: [
			'node_modules/**',
			'data/**',
			'logs/**',
			'coverage/**',
			'dist/**',
			'build/**',
			'public/**',
			'tests/security/**',
			'tests/ui/**',
			'tests/core/**',
			'tests/backend/**',
			'tests/examples/**',
			'tests/gameplay/**',
			'tests/setup.js',
			'tests/setup-extensions.js',
			'tests/testUtils.js',
			'tests/run-tests.js',
			'tests/mocks/**',
			'scripts/run-security-tests.js',
			'jest.setup.js',
		],
	},
	{
		// Production server code + the server-targeted test suite.
		// Top-level config files (jest.config.js, eslint.config.js,
		// ecosystem.config.cjs, *.json reads) are also CJS.
		files: [
			'*.js',
			'*.cjs',
			'server.js',
			'server/**/*.js',
			'routes/**/*.js',
			'scripts/**/*.js',
			'tests/server/**/*.js',
		],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'commonjs',
			globals: {
				...globals.node,
				...globals.jest,
			},
		},
		rules: {
			'no-unused-vars': ['warn', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^_',
			}],
			'no-empty': ['warn', { allowEmptyCatch: true }],
			'no-prototype-builtins': 'off',
			'no-constant-condition': ['warn', { checkLoops: false }],
			'no-var': 'error',
			'prefer-const': ['warn', { destructuring: 'all' }],
			'no-useless-assignment': 'warn',
			'no-undef': 'error',
		},
	},
];

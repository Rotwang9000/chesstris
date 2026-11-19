/**
 * The attacker's reply when their move puts a king in check named the
 * defender by player id: the client showed "Check! 1117161c-f939-… has
 * 15s to escape". It names them, or says "They" when there is no name.
 */

const path = require('path');
const { checkEscapeMessage } = require(path.join('..', '..', 'server', 'sockets', 'chess'));

const ID = '1117161c-f939-4c9e-ae69-74f268baaf20';

describe('checkEscapeMessage', () => {
	test('a named defender is named', () => {
		expect(checkEscapeMessage({ name: 'Hans' }, ID, 15000)).toBe('Hans has 15s to escape');
	});

	test.each([
		['no player', null],
		['no name', {}],
		['Guest', { name: 'Guest' }],
		['the id itself', { name: ID }],
		['a Player_ placeholder', { name: 'Player_1117161c' }],
		['a DevPlayer_ placeholder', { name: 'DevPlayer_abcd' }],
	])('%s reads "They"', (_label, defender) => {
		const text = checkEscapeMessage(defender, ID, 15000);
		expect(text).toBe('They have 15s to escape');
		expect(text).not.toContain(ID);
	});
});

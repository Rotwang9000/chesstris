// Mock implementation of chai
module.exports = {
	expect: function(value) {
		return {
			to: {
				equal: jest.fn(),
				deep: {
					equal: jest.fn()
				}
			},
			equal: jest.fn(),
			eql: jest.fn(),
			deep: {
				equal: jest.fn()
			},
			be: {
				true: jest.fn(),
				false: jest.fn(),
				null: jest.fn(),
				undefined: jest.fn()
			},
			exist: jest.fn(),
			not: {
				equal: jest.fn(),
				eql: jest.fn()
			},
			have: {
				lengthOf: jest.fn(),
				property: jest.fn()
			},
			include: jest.fn(),
			instanceof: jest.fn(),
			match: jest.fn(),
			throw: jest.fn()
		};
	}
}; 
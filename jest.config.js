module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      babelConfig: false,
    },
  },
  verbose: false,
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
}

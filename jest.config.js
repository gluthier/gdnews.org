module.exports = {
  testEnvironment: 'node',
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  testMatch: ['**/test/**/*.test.js'],
  setupFilesAfterEnv: ['./test/setup.js'] // We might need this for global setup/teardown later
};

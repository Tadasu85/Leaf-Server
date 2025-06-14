module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'server.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  testTimeout: 10000, // Increased timeout for socket tests
  verbose: true,
  forceExit: true, // Force Jest to exit after all tests complete
  detectOpenHandles: true, // Detect open handles that prevent Jest from exiting
  maxWorkers: 1 // Run tests serially to prevent port conflicts
}; 
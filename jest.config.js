module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  },
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
    '!**/vendor/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'cobertura', 'json'],
  reporters: [
    'default',
    ['jest-junit', { outputDirectory: 'coverage', outputName: 'junit.xml' }]
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70
    }
  },
  testTimeout: 10000, // Increased timeout for socket tests
  verbose: true,
  forceExit: true, // Force Jest to exit after all tests complete
  detectOpenHandles: true, // Detect open handles that prevent Jest from exiting
  maxWorkers: 1, // Run tests serially to prevent port conflicts and rate limiting issues
  collectCoverage: true,
  coverageProvider: 'v8',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts']
}; 
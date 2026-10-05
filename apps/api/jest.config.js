/**
 * Jest configuration for the JudicialSync Platform Core API.
 *
 * The project-wide test idiom is **Jest + supertest against the Nest
 * application instance** (`Test.createTestingModule(...).compile()`), not a
 * separately-launched HTTP server. Every later Phase 1 plan uses this same
 * idiom so that the guard chain, the global exception filter and dependency
 * injection are all exercised exactly as they are in production.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      // `isolatedModules` is set in tsconfig.json, not here: the ts-jest
      // option of that name is deprecated and removed in ts-jest v30.
      { tsconfig: '<rootDir>/tsconfig.json' },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  // The assurance suite (plan 01-14) runs under jest.assurance.config.js and is
  // excluded here so the fast unit/e2e run never depends on a live database.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/assurance/'],
};

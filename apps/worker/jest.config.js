module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testRegex: '.*\\.spec\\.ts$',
  // class-validator/class-transformer decorators need the metadata shim. main.ts imports
  // it for the real process; a spec importing env.validation directly has no entry point
  // to do that for it.
  setupFiles: ['reflect-metadata'],
  passWithNoTests: true,
};

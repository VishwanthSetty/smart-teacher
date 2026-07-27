module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // PrismaService intentionally merges a class with an interface to expose the
    // extended client surface under one DI token (see prisma/prisma.service.ts).
    '@typescript-eslint/no-unsafe-declaration-merging': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
  },
};

/**
 * ESLint configuration for the JudicialSync Platform Core API.
 *
 * Scope note: this is a correctness and consistency gate, not a style
 * argument. The rules enabled below are the ones that catch real defects in a
 * decorator-heavy NestJS codebase — chiefly unhandled promises, which in a
 * guard or an audit write would silently drop a security decision or an audit
 * event rather than failing loudly.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', 'dist/**', 'coverage/**'],
  rules: {
    // NestJS leans on decorator metadata and `design:type` emission; explicit
    // return types on every provider method add noise without adding safety,
    // since tsc already checks them.
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',

    // A dropped promise inside a guard, an audit write, or the outbox would
    // fail silently and leave the system in exactly the inconsistent state
    // FRD/Y2 principle 2 forbids. These stay as errors.
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // `any` erodes the end-to-end type safety that is this stack's main
    // argument for itself (TechArch §8.5). Warn rather than error so it
    // surfaces in review without blocking an otherwise-correct change.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // Test files only. Three type-aware rules fire constantly here for
      // reasons intrinsic to the project's test idiom rather than to any
      // defect, and leaving them on would train everyone to paper the suite
      // with inline disables — which would also hide the real violations.
      //
      //  - `no-unsafe-argument` / `no-unsafe-member-access`: Nest's
      //    `app.getHttpServer()` is typed `any`, and supertest's
      //    `response.body` is `any` by design, since a response body's shape
      //    is exactly what the assertion is there to establish.
      //  - `unbound-method`: passing `Controller.prototype.someRoute` as a
      //    bare method reference is precisely what Nest's `Reflector` API
      //    takes. It is never invoked, so there is no `this` to lose.
      //
      // Note these are relaxed for TEST code only. Source files get no such
      // exemption: `src/**` passes all three cleanly, and must keep doing so.
      files: ['test/**/*.ts', '**/*.spec.ts', '**/*.e2e-spec.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  ],
};

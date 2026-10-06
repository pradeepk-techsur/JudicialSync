import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generate the typed API client from the committed OpenAPI 3.1 contract.
 *
 * The input is `../../openapi/openapi.json` — the contract emitted code-first
 * from the running NestJS application (`apps/api/scripts/emit-openapi.ts`). The
 * output is `src/api/generated/`, consumed by the hand-written wrapper in
 * `src/api/client.ts`.
 *
 * CI runs `npm run api:generate -w apps/web` before the build and then
 * `git diff --exit-code` on the generated output: a contract change that is not
 * reflected in the committed client fails the build, closing the loop that
 * keeps request/response shapes compile-time checked against the backend.
 */
export default defineConfig({
  input: '../../openapi/openapi.json',
  output: {
    path: './src/api/generated',
    format: 'prettier',
  },
  client: '@hey-api/client-fetch',
});

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/**
 * Vite configuration for the thin USWDS shell.
 *
 * TWO things beyond the React defaults:
 *
 *   1. USWDS SASS FROM SOURCE. `TechArch/05-tech-stack.md` §8.1 names the
 *      `@uswds/uswds` Sass source specifically (not a prebuilt CSS drop), so a
 *      court can theme within USWDS constraints. The USWDS Sass entry points
 *      live under `@uswds/uswds/packages/*`, so those directories are added to
 *      the Sass `loadPaths` and `@uswds/uswds` fonts/images are resolvable.
 *
 *   2. DEV SERVER BINDING. Bind `0.0.0.0` (never `localhost`, which can resolve
 *      to IPv6 ::1 and refuse the proxy's IPv4 connection) and allow the single
 *      TLS-origin host so Caddy can front the dev server. `vite preview` (used
 *      by Dockerfile.web) is configured the same way via the CLI flags in the
 *      package.json scripts.
 */
// Resolve @uswds/uswds via node's module resolution rather than a fixed path:
// in a workspace it is hoisted to the ROOT node_modules, not apps/web's, so a
// relative `./node_modules/...` path does not exist. `require.resolve` finds the
// real install location wherever it was hoisted.
const require = createRequire(import.meta.url);
// The package blocks `./package.json` in its exports map, so resolve the main
// entry (dist/js/uswds.min.js) and walk up to the package root: dist/js -> dist
// -> <package root>. `packages/` sits beside `dist/`.
const uswdsMain = require.resolve('@uswds/uswds');
const uswdsRoot = resolve(dirname(uswdsMain), '..', '..');
const uswdsPackages = resolve(uswdsRoot, 'packages');
// USWDS's compiled CSS references `../fonts/*` and `../img/*` relative to the
// emitted stylesheet, so the packaged fonts and images must be served at
// `/fonts` and `/img`. Copy them from the USWDS dist into the build output (and
// the plugin serves them in dev too).
const uswdsDist = resolve(uswdsRoot, 'dist');

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${uswdsDist}/fonts`, dest: '.' },
        { src: `${uswdsDist}/img`, dest: '.' },
      ],
    }),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // Use the modern Sass compiler API so `loadPaths` is honored (the legacy
        // API ignores it and needs `includePaths`). Both are supplied for safety.
        api: 'modern-compiler',
        // USWDS resolves its own partials relative to these roots.
        loadPaths: [uswdsPackages],
        includePaths: [uswdsPackages],
        quietDeps: true,
        // USWDS 3 uses the legacy Sass JS API in places; silence the noise.
        silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin', 'mixed-decls'],
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The app is reached through the Caddy proxy as judicialsync.localhost.
    allowedHosts: ['judicialsync.localhost'],
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['judicialsync.localhost'],
  },
});

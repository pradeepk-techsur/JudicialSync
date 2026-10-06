/**
 * Load an **ESM-only** package from this CommonJS build.
 *
 * `file-type@19` is pure ESM (`"type": "module"`, an `import`-only `exports`
 * map and no CommonJS entry). This project compiles to CommonJS — `tsconfig`
 * sets `module: commonjs`, and both `nest build` and `ts-jest` honour it — so
 * a plain `import { fileTypeFromBuffer } from 'file-type'` is rewritten by
 * `tsc` into `require('file-type')`, which throws `ERR_REQUIRE_ESM` at
 * runtime. A `tsc`-emitted dynamic `await import('file-type')` is *also*
 * rewritten, to `Promise.resolve().then(() => require('file-type'))`, with the
 * identical failure.
 *
 * The one construct TypeScript does not touch is a dynamic `import()` built
 * through the `Function` constructor: `tsc` cannot see the specifier, so it
 * cannot downlevel the call, and a genuine ECMAScript dynamic import survives
 * into the emitted CommonJS. That is the supported bridge from CJS to an
 * ESM-only dependency, and it is isolated here so the one awkward line exists
 * in exactly one place with the reason attached.
 *
 * Replacing `file-type` with an older CommonJS release was rejected: content
 * sniffing is a security control, and the maintained line is the ESM one.
 */
const dynamicImport = new Function(
  'specifier',
  'return import(specifier);',
) as (specifier: string) => Promise<unknown>;

/** The slice of `file-type`'s API this module uses. */
export interface FileTypeResult {
  ext: string;
  mime: string;
}

type FileTypeModule = {
  fileTypeFromBuffer: (
    buffer: Uint8Array,
  ) => Promise<FileTypeResult | undefined>;
};

let cached: FileTypeModule | undefined;

/**
 * `fileTypeFromBuffer`, loaded once and memoised.
 *
 * The first call pays the dynamic-import cost; subsequent calls reuse the
 * resolved module. Memoising is safe because the module is immutable once
 * loaded, and it keeps the awkward bridge off the hot path.
 */
export async function fileTypeFromBuffer(
  buffer: Uint8Array,
): Promise<FileTypeResult | undefined> {
  if (cached === undefined) {
    cached = (await dynamicImport('file-type')) as FileTypeModule;
  }
  return cached.fileTypeFromBuffer(buffer);
}

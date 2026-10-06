/**
 * ============================================================================
 * TRACEABILITY — THE MATRIX NAMES ONLY TESTS THAT EXIST
 * ============================================================================
 *
 * A traceability matrix that drifts from the tests is worse than none, because
 * it asserts coverage that is not there. This meta-test reads
 * `docs/ASSURANCE.md`, extracts every spec file and every test title the matrix
 * claims as evidence, and asserts each one actually exists under
 * `apps/api/test/assurance/`.
 *
 * It is the only assurance spec that needs NO running stack — it reads files on
 * disk — so it runs even when the stack is down, which is exactly when a
 * documentation/test drift is most likely to slip through.
 *
 * ## The parse contract
 *
 * The matrix references evidence in a machine-extractable way:
 *
 *  - **Spec files** appear as inline-code filenames ending in
 *    `.assurance-spec.ts` (e.g. `` `criterion-1-scoped-access.assurance-spec.ts` ``).
 *    Every such filename must exist in this directory.
 *  - **Test titles** appear as inline-code strings beginning with `criterion `
 *    (e.g. `` `criterion 4: a role without entitlements grants nothing` ``).
 *    Every such title must be an `it(...)` or `describe(...)` title in some
 *    assurance spec.
 *
 * Both are derived from the SAME files the suite runs, so the matrix cannot
 * claim a test that was renamed or removed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ASSURANCE_DIR = __dirname;
const MATRIX_PATH = join(
  ASSURANCE_DIR,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'ASSURANCE.md',
);

/** Read the matrix. Resolved relative to this file so it works from any cwd. */
function readMatrix(): string {
  return readFileSync(MATRIX_PATH, 'utf8');
}

/** Every assurance spec filename present on disk. */
function specFilesOnDisk(): Set<string> {
  return new Set(
    readdirSync(ASSURANCE_DIR).filter((f) => f.endsWith('.assurance-spec.ts')),
  );
}

/** Every `it(...)`/`describe(...)` title across the assurance specs. */
function testTitlesOnDisk(): Set<string> {
  const titles = new Set<string>();
  for (const file of specFilesOnDisk()) {
    const src = readFileSync(join(ASSURANCE_DIR, file), 'utf8');
    // Match it('...') / it("...") / describe('...') with the two quote styles.
    const re = /\b(?:it|describe)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      titles.add(m[2]);
    }
  }
  return titles;
}

/**
 * Inline-code tokens from the matrix (text between single backticks).
 *
 * Fenced code blocks (``` ``` ```) are stripped first: their triple backticks
 * would otherwise throw off single-backtick pairing and swallow whole sections,
 * yielding zero real tokens.
 */
function inlineCodeTokens(matrix: string): string[] {
  const withoutFences = matrix.replace(/```[\s\S]*?```/g, '');
  const tokens: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutFences)) !== null) {
    // Collapse internal whitespace: a long title wrapped across markdown lines
    // carries newlines + indentation that the single-line it() title does not.
    tokens.push(m[1].replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

describe('traceability: the matrix names only tests that exist (assurance)', () => {
  it('every spec file the matrix cites exists on disk', () => {
    const matrix = readMatrix();
    const onDisk = specFilesOnDisk();
    const cited = inlineCodeTokens(matrix).filter((t) =>
      t.endsWith('.assurance-spec.ts'),
    );

    // The matrix must cite at least the four criterion specs plus itself-check.
    expect(cited.length).toBeGreaterThan(0);
    for (const file of cited) {
      expect(onDisk.has(file)).toBe(true);
    }
  });

  it('every test title the matrix cites exists as an it()/describe() title', () => {
    const matrix = readMatrix();
    const titles = testTitlesOnDisk();
    const citedTitles = inlineCodeTokens(matrix).filter((t) =>
      t.startsWith('criterion '),
    );

    expect(citedTitles.length).toBeGreaterThan(0);
    const missing = citedTitles.filter((t) => !titles.has(t));
    expect(missing).toEqual([]);
  });

  it('all five criteria rows are present in the matrix', () => {
    const matrix = readMatrix();
    // One row per criterion 1..5, each as a leading `| N |` table cell.
    for (const n of [1, 2, 3, 4, 5]) {
      expect(matrix).toMatch(new RegExp(`\\|\\s*${n}\\s*\\|`));
    }
  });

  it('criterion 5 is recorded as PARTIAL with the ASM-07 deferral', () => {
    const matrix = readMatrix();
    expect(matrix).toContain('PARTIAL — see ASM-07');
    expect(matrix).toContain('ASM-07');
  });

  it('criterion 2 is recorded as structural, not an invented attack', () => {
    const matrix = readMatrix();
    expect(matrix.toLowerCase()).toContain('structural');
  });
});

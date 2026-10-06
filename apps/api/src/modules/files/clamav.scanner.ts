import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'node:net';

/**
 * The three outcomes of a scan.
 *
 * **`error` is NOT `clean`.** A connection failure, a socket error or a
 * timeout all produce `error`, and `FilesService` rejects an `error` with
 * `503 SECURITY_SCANNER_UNAVAILABLE`. Treating a scanner outage as clean is the
 * single most likely way this control gets quietly disabled — an unreachable
 * scanner would then wave every file through — so the type makes the three
 * cases distinct and the caller must handle all three.
 */
export type ScanResult =
  | { result: 'clean' }
  | { result: 'infected'; signature: string }
  | { result: 'error' };

/**
 * ============================================================================
 * THE REAL ClamAV INSTREAM CLIENT
 * ============================================================================
 *
 * Speaks the actual `clamd` INSTREAM protocol over TCP to
 * `CLAMAV_HOST:CLAMAV_PORT`. There is deliberately no thin wrapper dependency:
 * the protocol is short, and an unmaintained npm wrapper is a supply-chain
 * liability for a security control — the scanner is exactly the component where
 * an abandoned transitive dependency is least acceptable.
 *
 * ## The INSTREAM wire format
 *
 * 1. send `zINSTREAM\0`
 * 2. send the data as length-prefixed chunks: a 4-byte big-endian length
 *    followed by that many bytes, repeated, each chunk at most 8 KiB
 * 3. send a zero-length chunk (four zero bytes) to terminate the stream
 * 4. read the reply: `stream: OK` (clean) or `stream: <SIGNATURE> FOUND`
 *
 * ## A note on first boot
 *
 * ClamAV loads ~110 MB of signatures into memory on first boot, which takes a
 * few minutes on a small sandbox — the Compose healthcheck's 300s start_period
 * accounts for it. The `clamav/clamav:1.4.3` image ships the signature
 * databases baked in, so no outbound network is needed (the `_base` variants do
 * not, and would try to `freshclam` on first boot). `ping()` below is the
 * readiness probe.
 */
@Injectable()
export class ClamAvScanner {
  private readonly logger = new Logger(ClamAvScanner.name);

  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  /** INSTREAM chunk size. clamd rejects a chunk larger than StreamMaxLength; 8 KiB is well within every default. */
  private static readonly CHUNK_SIZE = 8 * 1024;

  constructor() {
    this.host = process.env.CLAMAV_HOST ?? 'localhost';
    this.port = Number(process.env.CLAMAV_PORT ?? 3310);
    this.timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 30_000);
  }

  /**
   * Scan a buffer.
   *
   * Never throws: every failure mode — connection refused, reset socket, a
   * timeout — collapses to `{ result: 'error' }`, which the caller maps to
   * `503`. A scan must not be able to turn into a 500 that some outer handler
   * might treat as incidental; the fail-closed outcome is a value, not an
   * exception.
   */
  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      const reply = await this.command((socket) => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < buffer.length; offset += ClamAvScanner.CHUNK_SIZE) {
          const slice = buffer.subarray(offset, offset + ClamAvScanner.CHUNK_SIZE);
          const header = Buffer.allocUnsafe(4);
          header.writeUInt32BE(slice.length, 0);
          socket.write(header);
          socket.write(slice);
        }
        // Zero-length terminator chunk.
        const terminator = Buffer.allocUnsafe(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });

      return this.parse(reply);
    } catch (error) {
      // A scanner we cannot reach is a scanner that has NOT said the file is
      // clean. Log it and return `error`; the caller rejects the upload.
      this.logger.error(
        `ClamAV scan failed (treated as a rejection, never as clean): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { result: 'error' };
    }
  }

  /**
   * Liveness probe for the readiness endpoint: `zPING\0` → `PONG`.
   *
   * Returns `false` rather than throwing, so a health check can report "scanner
   * not ready" without the probe itself erroring.
   */
  async ping(): Promise<boolean> {
    try {
      const reply = await this.command((socket) => {
        socket.write('zPING\0');
      });
      return reply.trim().replace(/\0+$/, '') === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Parse a clamd reply.
   *
   * `stream: OK` → clean. `stream: <SIG> FOUND` → infected, carrying the
   * signature name. Anything else — an `ERROR` reply, an unexpected string — is
   * `error`, because an unrecognised answer is not a clean bill of health.
   */
  private parse(reply: string): ScanResult {
    const line = reply.trim().replace(/\0+$/, '');

    if (/\bOK$/.test(line) && !/FOUND$/.test(line)) {
      return { result: 'clean' };
    }

    const found = /^stream:\s+(.*)\s+FOUND$/.exec(line);
    if (found !== null) {
      return { result: 'infected', signature: found[1] };
    }

    this.logger.warn(`Unexpected ClamAV reply, treated as error: "${line}"`);
    return { result: 'error' };
  }

  /**
   * Open a socket, run `send`, collect the reply, enforce the timeout, and
   * always clean up the socket.
   *
   * The timeout is a hard wall: if clamd has not replied within
   * `CLAMAV_TIMEOUT_MS` the promise rejects, `scan` catches it, and the upload
   * is rejected `503`. A hung scanner must not hang the request indefinitely.
   */
  private command(send: (socket: Socket) => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        socket.removeAllListeners();
        socket.destroy();
        fn();
      };

      socket.setTimeout(this.timeoutMs);

      socket.on('timeout', () =>
        finish(() => reject(new Error(`ClamAV did not reply within ${this.timeoutMs}ms`))),
      );
      socket.on('error', (err) => finish(() => reject(err)));
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('end', () =>
        finish(() => resolve(Buffer.concat(chunks).toString('utf8'))),
      );
      socket.on('close', () =>
        finish(() => resolve(Buffer.concat(chunks).toString('utf8'))),
      );

      socket.connect(this.port, this.host, () => {
        try {
          send(socket);
        } catch (err) {
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      });
    });
  }
}

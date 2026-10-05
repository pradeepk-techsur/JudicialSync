import { Injectable, Logger } from '@nestjs/common';
import { Socket, createConnection } from 'node:net';

/**
 * What a scan concluded.
 *
 * Three values, not two. The third one is the point of this file: a scan that
 * could not be performed is **not** a scan that found nothing, and modelling
 * it as a separate state is what stops `FilesService` from accidentally
 * treating an outage as a pass. See the class comment.
 */
export type ScanVerdict = 'clean' | 'infected' | 'error';

export interface ScanResult {
  result: ScanVerdict;
  /** The signature name, when `result === 'infected'`. */
  signature?: string;
  /** Why the scan could not be completed, when `result === 'error'`. */
  reason?: string;
}

/** `clamd`'s INSTREAM chunk ceiling in this client. Well under `StreamMaxLength`. */
const CHUNK_BYTES = 8 * 1024;

/** Default socket/scan deadline when `CLAMAV_TIMEOUT_MS` is unset. */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * ============================================================================
 * THE MALWARE SCAN GATE — a real `clamd` client, with no bypass
 * ============================================================================
 *
 * `FRD/F13` Process step 2: every upload "passes through a malware-scanning
 * gate before being accepted into the reference layer; scanning failure routes
 * to rejection with a user-facing reason, **never silent acceptance**."
 * `TechArch/04-security.md` §7.5 names the dispositions: "`infected`/`error`
 * results are rejected and logged."
 *
 * ## Why the protocol is spoken directly rather than through a wrapper
 *
 * The INSTREAM protocol is roughly thirty lines: send `zINSTREAM\0`, then
 * length-prefixed chunks, then a zero-length terminator, then read one line of
 * reply. Taking an unmaintained npm wrapper for thirty lines puts a third-party
 * package inside the trust boundary of a **security control** — a dependency
 * that, if compromised or merely buggy, can report `clean` for anything. The
 * supply-chain exposure is strictly worse than the code it saves.
 *
 * ## `error` is not `clean`, and that is the whole design
 *
 * This is the single most likely way this control gets quietly disabled, so it
 * is worth stating plainly: **if ClamAV is unreachable, times out, or answers
 * something this client does not understand, the verdict is `error`, and
 * `FilesService` rejects the upload with `503 SECURITY_SCANNER_UNAVAILABLE`.**
 *
 * The tempting "availability improvement" — treat an unreachable scanner as a
 * pass so uploads keep working during an outage — converts the gate into
 * decoration at exactly the moment it matters. An attacker who can make the
 * scanner unreachable (a flood, a crashed container, a severed network path)
 * would then have a reliable way to upload anything at all. There is no
 * configuration flag here that would permit it, deliberately: a flag is a
 * thing an operator reaches for at 3am during an incident.
 *
 * `FRD/Y2-errors.md` principle 1 ("fail closed") and the Phase 1 CONTEXT's
 * explicit requirement for a REAL scanner — a placeholder implementation was
 * rejected outright, because success criterion 5 asks for a demonstration that
 * an infected file is refused, which only a real engine can give — both land
 * on the same behaviour.
 *
 * ## Operational note on the container
 *
 * `docker-compose.yml` pins `clamav/clamav:1.4.3` — the signature-carrying
 * tag. The naming is inverted from intuition: the `_base` variants ship an
 * EMPTY `/var/lib/clamav` and need freshclam to reach the network on first
 * boot, while the plain version tag has the ~110 MB of signatures baked in.
 * The sandbox may have no outbound network, so the signature-carrying tag is
 * the correct one, and `FRESHCLAM_CHECKS=0` then stops it dialling out on a
 * timer. Loading those signatures into memory genuinely takes minutes on a
 * small host, which is why the compose healthcheck allows a 300s start period.
 */
@Injectable()
export class ClamAvScanner {
  private readonly logger = new Logger(ClamAvScanner.name);

  private get host(): string {
    return process.env.CLAMAV_HOST ?? 'localhost';
  }

  private get port(): number {
    return Number(process.env.CLAMAV_PORT ?? 3310);
  }

  private get timeoutMs(): number {
    const raw = Number(process.env.CLAMAV_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  /**
   * Scan a buffer with `clamd` INSTREAM.
   *
   * Never throws. Every failure mode — refused connection, DNS failure, reset
   * socket, deadline exceeded, unparseable reply — resolves to
   * `{result: 'error'}` so the caller has exactly one shape to handle and
   * cannot accidentally let an exception path skip the rejection.
   */
  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      const reply = await this.converse((socket) => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));

        for (let offset = 0; offset < buffer.length; offset += CHUNK_BYTES) {
          const chunk = buffer.subarray(offset, offset + CHUNK_BYTES);
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }

        // A zero-length chunk is the end-of-stream marker. Without it clamd
        // waits for more data until its own idle timeout fires, which would
        // present as a scan timeout on a perfectly healthy scanner.
        const terminator = Buffer.alloc(4);
        terminator.writeUInt32BE(0, 0);
        socket.write(terminator);
      });

      return this.interpret(reply);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // `error` level, not `warn`: a scanner that cannot be reached means
      // uploads are being refused, which is correct and is also an incident.
      this.logger.error(
        `ClamAV scan could not be completed against ${this.host}:${this.port} ` +
          `(${reason}). The upload will be REJECTED — an unscanned file is ` +
          `never accepted.`,
      );
      return { result: 'error', reason };
    }
  }

  /**
   * `zPING` → `PONG`, for a readiness probe.
   *
   * Deliberately does not influence `scan()`. A liveness check that passed a
   * moment ago says nothing about whether the scan itself will complete, and
   * gating scans on a cached ping would add a window in which the system
   * believes the scanner is up while it is not.
   */
  async ping(): Promise<boolean> {
    try {
      const reply = await this.converse((socket) => {
        socket.write(Buffer.from('zPING\0', 'utf8'));
      });
      return reply.replace(/\0/g, '').trim() === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Open a socket, let the caller write a command, and resolve with the full
   * reply once `clamd` closes its side.
   *
   * The deadline covers the WHOLE exchange rather than just the connect: a
   * socket that connects and then stalls mid-stream is the failure mode a
   * connect-only timeout misses, and it is indistinguishable from a hang.
   */
  private converse(write: (socket: Socket) => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = createConnection({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        socket.removeAllListeners();
        socket.destroy();
        if (error !== undefined) reject(error);
        else resolve(Buffer.concat(chunks).toString('utf8'));
      };

      const deadline = setTimeout(() => {
        finish(
          new Error(
            `ClamAV did not answer within ${this.timeoutMs}ms (timeout is ` +
              `treated as a scan FAILURE, never as a pass)`,
          ),
        );
      }, this.timeoutMs);

      socket.on('connect', () => {
        try {
          write(socket);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
      socket.on('data', (chunk: Buffer) => chunks.push(chunk));
      socket.on('end', () => finish());
      socket.on('close', () => finish());
      socket.on('error', (error: Error) => finish(error));
    });
  }

  /**
   * Turn `clamd`'s one-line reply into a verdict.
   *
   * Exactly two replies are recognised as conclusive. **Everything else is
   * `error`**, including a reply this client simply has not seen before —
   * `size limit exceeded`, `ERROR`, an empty string, or a future clamd
   * wording. Defaulting an unrecognised reply to `clean` would mean a clamd
   * upgrade that changed its phrasing silently disabled the gate.
   */
  private interpret(raw: string): ScanResult {
    const reply = raw.replace(/\0/g, '').trim();

    if (/^stream:\s*OK$/i.test(reply)) {
      return { result: 'clean' };
    }

    const found = /^stream:\s*(.+?)\s+FOUND$/i.exec(reply);
    if (found !== null) {
      this.logger.warn(
        `ClamAV rejected an uploaded file: signature '${found[1]}'. ` +
          `Nothing has been written to the object store.`,
      );
      return { result: 'infected', signature: found[1] };
    }

    this.logger.error(
      `Unrecognised ClamAV reply ${JSON.stringify(reply)}. Treating as a ` +
        `scan ERROR (fail closed) rather than guessing — an unknown reply ` +
        `read as 'clean' would silently disable this gate.`,
    );
    return { result: 'error', reason: `unrecognised clamd reply: ${reply}` };
  }
}

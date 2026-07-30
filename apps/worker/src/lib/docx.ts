// ---------------------------------------------------------------------------
// Magazine Builder v2 — DOCX → PDF conversion (LibreOffice headless).
//
// The extraction pipeline (pdf.ts / MuPDF) only speaks PDF. To accept Word
// documents we convert them to PDF FIRST, then hand the resulting PDF buffer
// straight into openPdf() — so a .docx upload flows through the exact same
// deterministic, pixel-faithful extractor as a native PDF, no separate code
// path downstream.
//
// Conversion is delegated to LibreOffice's headless `soffice` binary (the same
// engine as Word's own fidelity target for most layouts). It must be installed
// and on PATH in the worker's environment (or pointed at via SOFFICE_BIN) — see
// the ENOENT guard below. No npm dependency, no native compile.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Binary to invoke. Override with SOFFICE_BIN when it isn't plain `soffice` on
 *  PATH (e.g. a full install path, or `libreoffice` on some distros). */
const SOFFICE_BIN = process.env.SOFFICE_BIN || 'soffice';

/** Hard timeout for a single conversion. A corrupt/complex .docx can make
 *  soffice hang without ever emitting 'close' (e.g. a modal it can't show
 *  headless); without this the awaiting Promise never settles, the issue stays
 *  'processing' forever and the worker slot is consumed until manual restart.
 *  Override with SOFFICE_TIMEOUT_MS. */
const SOFFICE_TIMEOUT_MS = Math.max(15_000, Number(process.env.SOFFICE_TIMEOUT_MS) || 90_000);

/**
 * Convert a DOCX buffer to a PDF buffer via LibreOffice headless.
 *
 * Writes the input to a private temp dir, runs
 *   soffice --headless --convert-to pdf --outdir <tmp> <input.docx>
 * reads back the produced PDF, and cleans up. Throws a clear Error if soffice
 * is missing (ENOENT) or the conversion produces no PDF — callers already
 * catch and record `issue.processingError`, so this never crashes the worker.
 */
export async function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  // Isolated temp dir per conversion so concurrent jobs can't collide on
  // filenames, and cleanup is a single recursive rm.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mag2-docx-'));
  const inputPath = path.join(dir, 'input.docx');
  try {
    await writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      // `--convert-to pdf` writes <basename>.pdf into --outdir. Use the profile
      // dir under our temp dir too, so a locked/absent user profile (headless
      // servers) can't stall the first run.
      const child = spawn(
        SOFFICE_BIN,
        ['--headless', '--convert-to', 'pdf', '--outdir', dir, `-env:UserInstallation=file://${path.join(dir, 'profile')}`, inputPath],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      // Settle exactly once and always clear the watchdog so a resolved/failed
      // conversion can't later be killed or leave a dangling timer.
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        finish(() => reject(new Error(`LibreOffice timed out converting the document after ${Math.round(SOFFICE_TIMEOUT_MS / 1000)}s and was terminated.`)));
      }, SOFFICE_TIMEOUT_MS);
      let stderr = '';
      child.stderr.on('data', (d) => { if (stderr.length < 8192) stderr += String(d); }); // cap: never accumulate unbounded child output
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          finish(() => reject(new Error(
            `LibreOffice ('${SOFFICE_BIN}') was not found — it must be installed and on PATH ` +
            'to import Word (.docx) files, or set SOFFICE_BIN to its full path.',
          )));
        } else {
          finish(() => reject(err));
        }
      });
      child.on('close', (code) => {
        finish(() => {
          if (code === 0) resolve();
          else reject(new Error(`LibreOffice failed to convert the document (exit ${code}).${stderr ? ` ${stderr.trim()}` : ''}`));
        });
      });
    });

    // soffice names the output after the input base ("input.pdf"), but find it
    // defensively — locate the single produced .pdf regardless of exact name.
    const produced = (await readdir(dir)).find((f) => f.toLowerCase().endsWith('.pdf'));
    if (!produced) throw new Error('LibreOffice produced no PDF from the Word document — the file may be corrupt or unsupported.');
    return await readFile(path.join(dir, produced));
  } finally {
    // Best-effort cleanup of the temp dir (input, profile, and output PDF).
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

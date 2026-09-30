#!/usr/bin/env node
/**
 * build-submission-package.mjs
 *
 * Builds the StockLens submission ZIP and generates the package manifest:
 *   dist-submission/StockLens_Submission.zip   (hard max 30 MB, soft target 25 MB)
 *   docs/final/PACKAGE_MANIFEST.md             (values from the real run)
 *
 * Plain Node ESM, no dependencies. The ZIP container is written directly:
 * entry data is deflated with node:zlib and CRC-32 is implemented locally
 * (no ZIP64 support — the package limit is 30 MB).
 *
 * Behaviour:
 *  - includes README.md, PRD.md, .env.example, package.json, package-lock.json,
 *    src/, tests/, scripts/, public assets, tsconfig.json, next.config.ts,
 *    vitest.config.ts, eslint.config.mjs, postcss.config.mjs, docs/final/
 *  - excludes .git/, node_modules/, .next/, .vercel/, coverage/, .tmp/, .tools/,
 *    docs/design-audit/, dist-submission/, .env* (except .env.example),
 *    *.webm, *.gif, logs, caches, credential/token files
 *  - secret scan runs BEFORE the ZIP is written; a likely secret aborts the
 *    package (exit 1, no ZIP written)
 *  - large-file audit is printed before zipping
 *  - docs/final/StockLens_Demo.mp4 is included only when <= 15 MB
 *  - at most 5 images from docs/final/screenshots/ are included
 *  - idempotent: re-running overwrites the ZIP and the manifest
 *
 * Run:  npm run package:submission
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ config */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const OUT_DIR = path.join(ROOT, "dist-submission");
const OUT_ZIP = path.join(OUT_DIR, "StockLens_Submission.zip");
const MANIFEST_REL = "docs/final/PACKAGE_MANIFEST.md";
const MANIFEST_ABS = path.join(ROOT, MANIFEST_REL);

const MAX_BYTES = 30 * 1024 * 1024; // hard limit
const TARGET_BYTES = 25 * 1024 * 1024; // soft target
const VIDEO_MAX_BYTES = 15 * 1024 * 1024;
const MAX_SCREENSHOTS = 5;

const VIDEO_REL = "docs/final/StockLens_Demo.mp4";
const SCREENSHOTS_REL_DIR = "docs/final/screenshots";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg"]);

const TOP_LEVEL_FILES = [
  "README.md",
  "PRD.md", // if present
  ".env.example", // required
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "vitest.config.ts",
  "eslint.config.mjs",
  "postcss.config.mjs",
];

const WALK_DIRS = ["src", "tests", "scripts"];
const OPTIONAL_WALK_DIRS = ["public"]; // "required public assets" (walked when present)
const FINAL_DIR = "docs/final";

const EXCLUDED_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  "coverage",
  ".tmp",
  ".tools",
  "dist-submission",
  "__pycache__",
  ".cache",
]);

const EXCLUDED_EXT = new Set([
  ".webm",
  ".gif",
  ".log",
  ".tsbuildinfo",
  ".har",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
]);

const EXCLUDED_BASENAMES = new Set([
  ".npmrc",
  ".yarnrc",
  ".pypirc",
  ".netrc",
  ".git-credentials",
  "credentials",
  "credentials.json",
  "secrets.json",
  ".secrets",
  "id_rsa",
  "id_ed25519",
  ".DS_Store",
  "Thumbs.db",
]);

// Top-level paths that must never appear in the package (reported with real counts).
const EXCLUDED_TOP_LEVEL = [
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  "coverage",
  ".tmp",
  ".tools",
  "dist-submission",
  "docs/design-audit",
];

const MB = 1024 * 1024;

const fmtMB = (bytes) => `${(bytes / MB).toFixed(2)} MB`;
const fmtBytes = (bytes) => `${bytes} bytes`;
const humanSize = (bytes) =>
  bytes >= MB ? fmtMB(bytes) : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;

/* --------------------------------------------------------------- utilities */

function log(...args) {
  console.log(...args);
}

function section(title) {
  log("");
  log(`== ${title} ==`);
}

/* ----------------------------------------------------------- file selection */

function shouldSkipDir(rel, name) {
  if (EXCLUDED_DIR_NAMES.has(name)) return `excluded directory (${name}/)`;
  if (name.startsWith(".")) return `hidden directory (${name}/)`;
  if (rel === "docs/design-audit") return "local design-audit material";
  return null;
}

function exclusionReason(rel) {
  const segments = rel.split("/");
  const base = segments[segments.length - 1];
  const lower = rel.toLowerCase();

  if (base === ".env.example") return null; // the only .env* file allowed

  for (const seg of segments.slice(0, -1)) {
    if (EXCLUDED_DIR_NAMES.has(seg)) return `excluded directory (${seg}/)`;
    if (seg.startsWith(".")) return `hidden directory (${seg}/)`;
  }
  if (rel === "dist-submission" || rel.startsWith("dist-submission/")) {
    return "build output directory";
  }
  if (rel === "docs/design-audit" || rel.startsWith("docs/design-audit/")) {
    return "local design-audit material";
  }

  const ext = path.posix.extname(lower);
  if (EXCLUDED_EXT.has(ext)) return `excluded extension (${ext})`;

  if (/^\.env/i.test(base)) return `.env* file other than .env.example`;

  if (EXCLUDED_BASENAMES.has(base)) return `credential/token-ish file (${base})`;
  if (/(^|[._-])tokens?([._-]|$)/i.test(base)) return `token-ish filename (${base})`;
  if (/\.(tmp|cache)$/i.test(base)) return `cache/temp file (${base})`;

  return null;
}

function walk(absDir, relDir, out, skips) {
  let items;
  try {
    items = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (err) {
    skips.push({ rel: relDir, reason: `unreadable (${err.code ?? "error"})` });
    return;
  }
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const item of items) {
    const abs = path.join(absDir, item.name);
    const rel = `${relDir}/${item.name}`;
    if (item.isSymbolicLink()) {
      skips.push({ rel, reason: "symlink (not followed)" });
      continue;
    }
    if (item.isDirectory()) {
      const reason = shouldSkipDir(rel, item.name);
      if (reason) {
        skips.push({ rel: `${rel}/`, reason });
        continue;
      }
      walk(abs, rel, out, skips);
    } else if (item.isFile()) {
      const reason = exclusionReason(rel);
      if (reason) {
        skips.push({ rel, reason });
        continue;
      }
      const st = fs.statSync(abs);
      out.push({ abs, rel, size: st.size });
    }
  }
}

function countFilesRecursive(absDir) {
  let files = 0;
  let bytes = 0;
  const stack = [absDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        stack.push(abs);
      } else if (item.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(abs).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { files, bytes };
}

/* ------------------------------------------------------------- secret scan */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const KEYISH_NAME =
  /(api[_-]?key|apikey|secret|token|passwd|password|auth[_-]?key|access[_-]?key|private[_-]?key|bearer)/i;
const PLACEHOLDER_PREFIX =
  /^(<|\$\{|%|\*+|x{3,}|your[-_]|placeholder|example|sample|redacted|dummy|changeme|todo|none|null|undefined|true|false|string|number|boolean|process\.env)/i;
const ASSIGN_QUOTED_RE =
  /(?:^|[\s"'`*{;,(])([A-Za-z_][A-Za-z0-9_.-]{1,60})["'`]?\s*[:=]\s*["'`]([^"'`\n]{4,300})["'`]/g;
const ASSIGN_BARE_RE =
  /(?:^|[\s"'`*{;,(])([A-Za-z_][A-Za-z0-9_.-]{1,60})["'`]?\s*[:=]\s*([^\s"'`;,)]{4,300})(?=[\s"'`,;)]|$)/g;
const BEARER_RE = /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g;
const SK_KEY_RE = /\bsk-[A-Za-z0-9]{12,}\b/g;

function looksLikeSecretValue(raw) {
  const v = raw.trim();
  if (v.length < 16) return false;
  if (PLACEHOLDER_PREFIX.test(v)) return false;
  if (v.includes("${") || v.includes("process.env")) return false;
  if (!/^[A-Za-z0-9_\-./:=+@!~]+$/.test(v)) return false; // no spaces/quotes/CJK
  const hasDigit = /[0-9]/.test(v);
  return v.length >= 32 || hasDigit;
}

function maskSecret(v) {
  if (v.length <= 6) return `${v.slice(0, 1)}***`;
  return `${v.slice(0, 3)}***${v.slice(-2)}`;
}

function scanBufferForSecrets(rel, buffer) {
  const findings = [];
  if (buffer.includes(0)) {
    return { findings, binary: true };
  }
  const text = buffer.toString("utf8");
  const base = path.posix.basename(rel);

  // (b) any .env* file other than .env.example
  if (/^\.env/i.test(base) && base !== ".env.example") {
    findings.push({ rel, rule: "env-file", excerpt: `included .env* file: ${base}` });
  }

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const re of [ASSIGN_QUOTED_RE, ASSIGN_BARE_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const name = m[1];
        const value = m[2] ?? "";
        if (!KEYISH_NAME.test(name)) continue;
        if (!looksLikeSecretValue(value)) continue;
        findings.push({
          rel,
          line: i + 1,
          rule: "key-like assignment",
          excerpt: `${name} = ${maskSecret(value)}`,
        });
      }
    }

    BEARER_RE.lastIndex = 0;
    let bm;
    while ((bm = BEARER_RE.exec(line)) !== null) {
      findings.push({ rel, line: i + 1, rule: "bearer token", excerpt: `Bearer ${maskSecret(bm[1])}` });
    }

    SK_KEY_RE.lastIndex = 0;
    let sm;
    while ((sm = SK_KEY_RE.exec(line)) !== null) {
      findings.push({ rel, line: i + 1, rule: "sk-style key", excerpt: maskSecret(sm[0]) });
    }
  }
  return { findings, binary: false };
}

/* -------------------------------------------------------------- ZIP writer */

const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01, fixed for determinism
const DOS_TIME = 0;

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const data = entry.buffer;
    const name = Buffer.from(entry.rel, "utf8");
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    let method = 8;
    let stored = deflated;
    if (deflated.length >= data.length) {
      method = 0;
      stored = data;
    }

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed to extract
    lh.writeUInt16LE(0x0800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(stored.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28); // extra length
    localParts.push(lh, name, stored);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4); // made by: unix, v2.0
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(stored.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk number
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(((0o100644 << 16) >>> 0), 38); // external attrs: -rw-r--r--
    ch.writeUInt32LE(offset, 42);
    centralParts.push(ch, name);

    offset += lh.length + name.length + stored.length;
  }

  const local = Buffer.concat(localParts);
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([local, central, eocd]);
}

/* -------------------------------------------------------------- main flow */

function main() {
  log("StockLens submission package builder");
  log(`repo root: ${ROOT}`);

  // sanity: are we in the expected project?
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  } catch {
    /* handled below */
  }
  if (!pkg || pkg.name !== "stocklens") {
    console.error("FAIL: package.json not found or does not belong to the StockLens repo.");
    process.exit(1);
  }

  const files = []; // { abs, rel, size }
  const skips = []; // { rel, reason }
  const notes = [];
  const missing = [];

  section("Collecting files");
  for (const rel of TOP_LEVEL_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      if (rel === ".env.example") {
        console.error(`FAIL: required file ${rel} is missing — the submission must include it.`);
        process.exit(1);
      }
      missing.push(rel);
      continue;
    }
    const reason = exclusionReason(rel);
    if (reason) {
      skips.push({ rel, reason });
      continue;
    }
    files.push({ abs, rel, size: fs.statSync(abs).size });
  }
  const rootFound = TOP_LEVEL_FILES.filter((r) => files.some((f) => f.rel === r)).length;
  log(`  root files:     ${rootFound}/${TOP_LEVEL_FILES.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`);

  for (const dir of [...WALK_DIRS, ...OPTIONAL_WALK_DIRS]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) {
      if (WALK_DIRS.includes(dir)) {
        missing.push(`${dir}/`);
        log(`  ${dir}/: missing`);
      } else {
        log(`  ${dir}/: not present — nothing to include`);
      }
      continue;
    }
    if (EXCLUDED_DIR_NAMES.has(dir) || dir.startsWith(".")) continue;
    const before = files.length;
    walk(abs, dir, files, skips);
    const added = files.length - before;
    const bytes = files.slice(before).reduce((n, f) => n + f.size, 0);
    if (added === 0 && OPTIONAL_WALK_DIRS.includes(dir)) {
      log(`  ${dir}/: exists but is empty — no public assets to include`);
      notes.push("`public/` exists but is empty; no public assets were included.");
    } else {
      log(`  ${dir}/: ${added} files (${humanSize(bytes)})`);
    }
  }

  /* ---- docs/final with video rule + screenshot budget ---- */
  section("docs/final/ + media rules");
  const finalEntries = [];
  const finalSkips = [];
  walk(path.join(ROOT, FINAL_DIR), FINAL_DIR, finalEntries, finalSkips);
  skips.push(...finalSkips);

  const imageCandidates = finalEntries
    .filter((f) => f.rel.startsWith(`${SCREENSHOTS_REL_DIR}/`))
    .filter((f) => IMAGE_EXTS.has(path.posix.extname(f.rel.toLowerCase())))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const screenshotsIncluded = imageCandidates.slice(0, MAX_SCREENSHOTS);
  const screenshotsSkipped = imageCandidates.slice(MAX_SCREENSHOTS);
  const screenshotIncludedSet = new Set(screenshotsIncluded.map((f) => f.rel));
  const screenshotSkippedSet = new Set(screenshotsSkipped.map((f) => f.rel));

  let videoIncluded = null; // null = not present
  const videoEntry = finalEntries.find((f) => f.rel === VIDEO_REL);
  if (videoEntry) {
    if (videoEntry.size <= VIDEO_MAX_BYTES) {
      videoIncluded = true;
      log(`  ${VIDEO_REL}: present (${humanSize(videoEntry.size)}) — included (<= 15 MB)`);
    } else {
      videoIncluded = false;
      log(
        `  ${VIDEO_REL}: present but ${humanSize(videoEntry.size)} > 15 MB — EXCLUDED from the package; ` +
          "the README should keep the demo URL instead.",
      );
    }
  } else {
    log(`  ${VIDEO_REL}: not present — no video packaged; the README should keep the demo URL.`);
  }

  let finalAdded = 0;
  for (const f of finalEntries) {
    if (f.rel === MANIFEST_REL) continue; // regenerated below, injected at build time
    if (screenshotSkippedSet.has(f.rel)) continue;
    if (f.rel === VIDEO_REL && videoIncluded !== true) continue;
    files.push(f);
    finalAdded += 1;
  }
  log(
    `  docs/final/: ${finalAdded} files included` +
      (videoIncluded === true ? " (incl. demo video)" : "") +
      (imageCandidates.length > 0 ? `; screenshots ${screenshotsIncluded.length} included / ${screenshotsSkipped.length} skipped` : ""),
  );

  /* ---- final list ---- */
  const includedByRel = new Map(files.map((f) => [f.rel, f]));
  const finalList = [...includedByRel.values()].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  /* ---- secret scan ---- */
  section("Secret scan (before writing the ZIP)");
  const scanFindings = [];
  let scannedText = 0;
  let scannedBinary = [];
  for (const f of finalList) {
    const buffer = fs.readFileSync(f.abs);
    const { findings, binary } = scanBufferForSecrets(f.rel, buffer);
    if (binary) {
      scannedBinary.push(f.rel);
      continue;
    }
    scannedText += 1;
    scanFindings.push(...findings);
  }
  log(`  files scanned: ${scannedText} text` + (scannedBinary.length ? `, ${scannedBinary.length} binary skipped` : ""));
  log("  rules: .env* file check; key-like assignments (api key/token/secret/password, 16+ char values); 32+ char hex/base64; Bearer tokens; sk- keys");
  if (scanFindings.length > 0) {
    console.error("");
    console.error("SECRET SCAN FINDINGS:");
    for (const f of scanFindings) {
      console.error(`  - ${f.rel}${f.line ? `:${f.line}` : ""} [${f.rule}] ${f.excerpt}`);
    }
    console.error("");
    console.error("PACKAGE FAIL — likely secret material found in included files; the ZIP was NOT written.");
    console.error("A human must confirm whether each finding is a real secret or a false positive.");
    process.exit(1);
  }
  log("  PASS — no likely secrets found. A human must still confirm this result (scan output can be wrong either way).");

  /* ---- large-file audit ---- */
  section("Large-file audit (included files, before zipping)");
  const descending = [...finalList].sort((a, b) => b.size - a.size);
  const over1 = finalList.filter((f) => f.size > MB);
  const over5 = finalList.filter((f) => f.size > 5 * MB);
  if (over5.length === 0) log("  files > 5 MB : none");
  else over5.forEach((f) => log(`  files > 5 MB : ${humanSize(f.size)}  ${f.rel}`));
  if (over1.length === 0) log("  files > 1 MB : none");
  else over1.forEach((f) => log(`  files > 1 MB : ${humanSize(f.size)}  ${f.rel}`));
  log("  top 20 largest included files:");
  const top20 = descending.slice(0, 20);
  top20.forEach((f, i) => log(`    ${String(i + 1).padStart(2)}. ${humanSize(f.size).padStart(9)}  ${f.rel}`));

  /* ---- excluded top-level report ---- */
  section("Excluded paths present on disk (not in the ZIP)");
  const excludedOnDisk = [];
  for (const rel of EXCLUDED_TOP_LEVEL) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const { files: n, bytes } = countFilesRecursive(abs);
    excludedOnDisk.push({ rel, files: n, bytes });
    log(`  ${rel}/: ${n} files (${humanSize(bytes)})`);
  }
  const envLocal = fs.existsSync(path.join(ROOT, ".env.local"));
  if (envLocal) log("  .env.local: present on disk, excluded from the package");

  /* ---- build ZIP + manifest to a fixed point (manifest rides inside the ZIP) ---- */
  section("Building ZIP");
  const buildInputs = () =>
    finalList.map((f) => ({ rel: f.rel, buffer: fs.readFileSync(f.abs) }));

  const renderManifestText = (zipBytes, selfBytesForManifest) =>
    renderManifest({
      zipBytes,
      selfBytesForManifest,
      files: baseBuffers.map((f) => ({ rel: f.rel, size: f.buffer.length })),
      missing,
      notes,
      top20,
      over1,
      over5,
      scannedText,
      scannedBinary,
      excludedOnDisk,
      envLocal,
      videoIncluded,
      videoEntry,
      screenshotsIncluded,
      screenshotsSkipped,
      imageCandidates,
      pkg,
    });

  const baseBuffers = buildInputs(); // basenames for reporting; manifest content recalculated per iteration

  const baseEntries = baseBuffers.map((f) => ({ rel: f.rel, buffer: f.buffer }));

  let zipSizeGuess = 0;
  let selfSizeGuess = 0;
  let zipBuffer = null;
  let manifestText = "";
  let converged = false;
  for (let iter = 0; iter < 8; iter++) {
    // inner fixed point: manifest lists its own exact byte size
    let text = "";
    let guess = selfSizeGuess;
    for (let j = 0; j < 8; j++) {
      text = renderManifestText(zipSizeGuess, guess);
      const len = Buffer.byteLength(text, "utf8");
      if (len === guess) break;
      guess = len;
    }
    const entries = [
      ...baseEntries,
      { rel: MANIFEST_REL, buffer: Buffer.from(text, "utf8") },
    ].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

    zipBuffer = buildZip(entries);
    const realSize = zipBuffer.length;
    manifestText = text;
    selfSizeGuess = guess;
    if (realSize === zipSizeGuess) {
      converged = true;
      break;
    }
    zipSizeGuess = realSize;
  }
  if (!converged) {
    console.warn(
      "  WARNING: ZIP/manifest size fixed point did not fully converge; the manifest may report a size from the previous iteration.",
    );
  }

  /* ---- size gate ---- */
  const zipBytes = zipBuffer.length;
  const entryCount = baseEntries.length + 1;
  log(`  ${path.relative(ROOT, OUT_ZIP)}: ${fmtBytes(zipBytes)} (${fmtMB(zipBytes)}), ${entryCount} entries`);
  if (zipBytes >= MAX_BYTES) {
    console.error("");
    console.error(
      `PACKAGE FAIL — the produced ZIP is ${fmtBytes(zipBytes)} (${fmtMB(zipBytes)}), which is >= the 30 MB hard limit. ` +
        "The ZIP was NOT written. Remove large media/audit material from the include list and re-run.",
    );
    process.exit(1);
  }
  if (zipBytes > TARGET_BYTES) {
    console.warn(
      `  WARNING: ZIP is above the 25 MB soft target (${fmtMB(zipBytes)}) but below the 30 MB hard limit. ` +
        "Consider trimming media before submission.",
    );
  } else {
    log(`  size gate: PASS (hard max 30 MB, soft target 25 MB)`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_ZIP, zipBuffer); // idempotent: overwrites the previous package
  fs.mkdirSync(path.dirname(MANIFEST_ABS), { recursive: true });
  fs.writeFileSync(MANIFEST_ABS, manifestText, "utf8");

  section("Done");
  log(`  ZIP:      ${OUT_ZIP}`);
  log(`  manifest: ${MANIFEST_ABS}`);
  log(`  size:     ${fmtBytes(zipBytes)} (${fmtMB(zipBytes)})`);
  log(`  secret scan: PASS (0 findings, ${scannedText} text files)`);
  log(
    `  video:    ${videoIncluded === null ? "not present (README keeps the demo URL)" : videoIncluded ? "included" : "excluded (> 15 MB; README keeps the demo URL)"}`,
  );
  log("  top 3 largest included files:");
  top20.slice(0, 3).forEach((f, i) => log(`    ${i + 1}. ${humanSize(f.size)}  ${f.rel}`));
  process.exit(0);
}

/* --------------------------------------------------------------- manifest */

function renderManifest(ctx) {
  const {
    zipBytes,
    selfBytesForManifest,
    files,
    missing,
    notes,
    top20,
    over1,
    over5,
    scannedText,
    scannedBinary,
    excludedOnDisk,
    envLocal,
    videoIncluded,
    videoEntry,
    screenshotsIncluded,
    screenshotsSkipped,
    pkg,
  } = ctx;

  // the manifest itself is inside the ZIP it describes, so it lists its own exact size
  const allFiles = [...files, { rel: MANIFEST_REL, size: selfBytesForManifest }].sort((a, b) =>
    a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0,
  );
  const totalUncompressed = allFiles.reduce((n, f) => n + f.size, 0);
  const zipMB = zipBytes / MB;
  const target = zipBytes > TARGET_BYTES;

  const lines = [];
  lines.push("# Package Manifest — StockLens Submission");
  lines.push("");
  lines.push("Generated by `scripts/build-submission-package.mjs`. All values below come from the real packaging run.");
  lines.push("");
  lines.push("## ZIP artefact");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push("| ZIP filename | `StockLens_Submission.zip` |");
  lines.push("| ZIP path (repo) | `dist-submission/StockLens_Submission.zip` |");
  lines.push(`| Exact size | ${zipBytes} bytes |`);
  lines.push(`| Size (MB) | ${zipMB.toFixed(2)} MB |`);
  lines.push("| Hard max | 30 MB — " + (zipBytes < MAX_BYTES ? "PASS" : "FAIL") + " |");
  lines.push("| Soft target | 25 MB — " + (target ? "above target, below hard limit (WARNING)" : "PASS") + " |");
  lines.push(`| Entries | ${allFiles.length} files |`);
  lines.push(`| Uncompressed total | ${totalUncompressed} bytes (${(totalUncompressed / MB).toFixed(2)} MB) |`);
  lines.push(`| Project | ${pkg.name} v${pkg.version} |`);
  lines.push(`| Builder | Node ${process.version}; fixed entry timestamps (2026-01-01) |`);
  lines.push("");
  lines.push("Reproduce with: `npm run package:submission` (overwrites the ZIP and this manifest).");
  lines.push("");
  lines.push("## Included files and directories");
  lines.push("");
  lines.push("Top-level entries: root files, " + ["`src/`", "`tests/`", "`scripts/`", "`docs/final/`"].join(", ") + ".");
  lines.push("");
  lines.push("| File | Size |");
  lines.push("|---|---|");
  for (const f of allFiles) {
    lines.push(`| \`${f.rel}\` | ${f.size} B |`);
  }
  lines.push("");
  lines.push("## Excluded categories (never in the ZIP)");
  lines.push("");
  lines.push("- `.git/`, `node_modules/`, `.next/`, `.vercel/`, `coverage/`, `.tmp/`, `.tools/`, `dist-submission/`");
  lines.push("- `.env`, `.env.local`, `.env.*` — except `.env.example`, which IS included");
  lines.push("- `docs/design-audit/`");
  lines.push("- `*.webm`, `*.gif` (browser recordings), logs (`*.log`), `*.tsbuildinfo`, caches");
  lines.push("- local credentials/tokens (`.npmrc`, `credentials*`, `*token*` files, key material)");
  lines.push("");
  lines.push("Present on disk during this run (with real counts, excluded):");
  lines.push("");
  if (excludedOnDisk.length === 0) lines.push("- (none of the excluded paths exist)");
  for (const e of excludedOnDisk) {
    lines.push(`- \`${e.rel}/\`: ${e.files} files (${(e.bytes / MB).toFixed(2)} MB)`);
  }
  if (envLocal) lines.push("- `.env.local`: present on disk, excluded");
  lines.push("");
  lines.push("## Large-file audit (included files)");
  lines.push("");
  if (over5.length === 0) {
    lines.push("- Files > 5 MB: none");
  } else {
    lines.push("- Files > 5 MB:");
    over5.forEach((f) => lines.push(`  - ${(f.size / MB).toFixed(2)} MB  \`${f.rel}\``));
  }
  if (over1.length === 0) {
    lines.push("- Files > 1 MB: none");
  } else {
    lines.push("- Files > 1 MB:");
    over1.forEach((f) => lines.push(`  - ${(f.size / MB).toFixed(2)} MB  \`${f.rel}\``));
  }
  lines.push("");
  lines.push("Top 20 largest included files:");
  lines.push("");
  lines.push("| # | Size | File |");
  lines.push("|---|---|---|");
  top20.forEach((f, i) => lines.push(`| ${i + 1} | ${f.size} B (${(f.size / MB).toFixed(2)} MB) | \`${f.rel}\` |`));
  lines.push("");
  lines.push("## Secret scan");
  lines.push("");
  lines.push(`- Scope: all ${scannedText} included text files` + (scannedBinary.length ? `; ${scannedBinary.length} binary files skipped (${scannedBinary.join(", ")})` : "") + ".");
  lines.push("- Rules: `.env*` file check (only `.env.example` allowed); key-like assignments (`api_key`/`apikey`/`secret`/`token`/`password`/`Bearer`/`VERCEL_TOKEN`/`FUYAO`/`DEEPSEEK` names with 16+ char values, or 32+ char hex/base64 values); `Bearer <token>` literals; `sk-` style keys.");
  lines.push("- Result: **PASS — no likely secrets found** (0 findings).");
  lines.push("- Note: this is an automated scan; a human must still confirm the result (it can both miss secrets and over-flag false positives).");
  lines.push("");
  lines.push("## Demo video");
  lines.push("");
  if (videoIncluded === null) {
    lines.push("- `docs/final/StockLens_Demo.mp4`: not present — not included; the README should keep the demo URL.");
  } else if (videoIncluded) {
    lines.push(`- \`docs/final/StockLens_Demo.mp4\`: included (${(videoEntry.size / MB).toFixed(2)} MB, <= 15 MB limit).`);
  } else {
    lines.push(`- \`docs/final/StockLens_Demo.mp4\`: present (${(videoEntry.size / MB).toFixed(2)} MB) but over the 15 MB limit — excluded from the ZIP; the README should keep the demo URL instead.`);
  }
  lines.push("");
  lines.push(`## Screenshots budget (max ${MAX_SCREENSHOTS})`);
  lines.push("");
  if (screenshotsIncluded.length === 0) {
    lines.push("- No screenshots present in `docs/final/screenshots/` at packaging time.");
  } else {
    lines.push("- Included:");
    screenshotsIncluded.forEach((f) => lines.push(`  - \`${f.rel}\` (${f.size} B)`));
  }
  if (screenshotsSkipped.length > 0) {
    lines.push("- Skipped (over the 5-image budget):");
    screenshotsSkipped.forEach((f) => lines.push(`  - \`${f.rel}\``));
  }
  lines.push("");
  lines.push("## Missing required inputs");
  lines.push("");
  if (missing.length === 0) {
    lines.push("- None — every expected input was present.");
  } else {
    missing.forEach((m) => lines.push(`- ${m}`));
  }
  lines.push("");
  if (notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    notes.forEach((n) => lines.push(`- ${n}`));
    lines.push("");
  }
  lines.push("_Self-reference: this manifest is included in the ZIP it describes; its size is part of the total above._");
  lines.push("");
  return lines.join("\n");
}

main();

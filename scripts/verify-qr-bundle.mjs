import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.join(root, "public", "tools", "qr-code-generator.bundle.mjs");
const noticesPath = path.join(root, "public", "tools", "THIRD-PARTY-NOTICES.txt");

const actual = crypto.createHash("sha256").update(fs.readFileSync(bundlePath)).digest("hex");
const notices = fs.readFileSync(noticesPath, "utf8");
const match = notices.match(/^(?:Bandit Codes )?Bundle SHA-256:\s*([0-9a-f]{64})\r?$/m);
if (!match) {
  console.error("FAIL: Bundle SHA-256 line not found in public/tools/THIRD-PARTY-NOTICES.txt");
  process.exit(1);
}
const expected = match[1].toLowerCase();
if (actual !== expected) {
  console.error(
    `FAIL: qr-code-generator.bundle.mjs SHA-256 mismatch.\n  expected (THIRD-PARTY-NOTICES.txt): ${expected}\n  actual   (built bundle):            ${actual}`,
  );
  process.exit(1);
}
console.log(`OK: qr-code-generator.bundle.mjs SHA-256 matches THIRD-PARTY-NOTICES.txt (${actual})`);

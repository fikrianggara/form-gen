import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Load .env.test so integration tests hit the dedicated test database.
const envPath = path.resolve(__dirname, "..", ".env.test");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

// Ensure the test database schema is up to date (idempotent).
try {
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    env: { ...process.env },
  });
} catch (err) {
  // Non-fatal here: individual suites surface DB errors with clearer messages.
  console.warn("prisma migrate deploy during test setup failed:", String(err));
}

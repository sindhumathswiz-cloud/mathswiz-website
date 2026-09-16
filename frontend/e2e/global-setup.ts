import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Runs once before the whole Playwright suite (see playwright.config.ts's
 * globalSetup). Shells out to the fixture seed script rather than
 * importing it directly, matching how every other one-off DB script in
 * this repo is run (npx tsx ...) and avoiding any ESM/CJS self-invocation
 * ambiguity around importing a script that seeds and disconnects itself.
 */
export default function globalSetup() {
  const seedScript = path.join(__dirname, "fixtures", "seed.ts");
  // Quoted as a single command string (rather than execFileSync's args
  // array) -- with shell:true on Windows, an args array is concatenated
  // without quoting, which breaks on the spaces in this repo's path.
  execSync(`npx tsx "${seedScript}"`, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
}

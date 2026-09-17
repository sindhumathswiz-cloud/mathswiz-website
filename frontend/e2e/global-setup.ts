/**
 * Runs once before the whole Playwright suite (see playwright.config.ts's
 * globalSetup). Calls the fixture seed in-process rather than spawning it
 * as a subprocess (`npx tsx ...`) -- that was the original approach, but
 * shelling out from globalSetup has failed in at least one real Windows
 * environment with `SystemError: uv_os_get_passwd returned ENOMEM`, a
 * known libuv/Windows quirk unrelated to actual available memory. Direct
 * import avoids spawning a child process at all.
 */
import { closeSeedConnections, runSeed } from "./fixtures/seed";

export default async function globalSetup() {
  try {
    await runSeed();
  } finally {
    await closeSeedConnections();
  }
}

import type { Locator } from "@playwright/test";

/**
 * Polls for a locator to become visible within `timeoutMs`, returning
 * true/false instead of throwing. Locator.isVisible() looks like it should
 * do this given its `timeout` option, but it doesn't -- it's a single,
 * immediate check that ignores elapsed time, not a poll. Using it where a
 * real wait was intended silently races every async render in these specs
 * and reports "not visible" long before the app actually finishes loading.
 * Locator.waitFor() is the one that actually polls.
 */
export async function waitVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
  try {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

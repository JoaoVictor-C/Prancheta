/**
 * Test-run browser policy, loaded via --import from the `test` script.
 *
 * Launching Chromium costs roughly half a second and a full run pays it ~195
 * times, so the suite amortises one browser per test-file process. It lives
 * here rather than in pipeline.ts because reuse is a batch-caller's choice:
 * the CLI is short-lived and the MCP server long-lived, and neither should
 * inherit a browser that outlives the call that wanted it.
 *
 * Setting the variable here (rather than in the npm script) keeps the script
 * line portable -- `VAR=1 node ...` is not valid on Windows shells. pipeline.ts
 * reads the flag per call, so this assignment lands before any render despite
 * import hoisting.
 */

process.env.PRANCHETA_REUSE_BROWSER = "1";

import { after } from "node:test";
import { closeSharedBrowser } from "../src/pipeline.ts";

// Explicit teardown: the browser is an active handle, so without this the
// worker never exits and the run hangs after the last assertion passes.
after(async () => {
  await closeSharedBrowser();
});

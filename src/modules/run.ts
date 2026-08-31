/**
 * Running a figure module.
 *
 * A subprocess with a serialised JSON boundary in both directions. That
 * boundary is doing real work: a live in-process bridge would make the
 * module's own numbers the path of least resistance again — the core would read
 * them because they are simply there — and a segfault in a geospatial C
 * extension would take the core down with it. Neither is acceptable.
 */

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { BUNDLED_FONT_FAMILY } from "../export/fonts.ts";
import { theme } from "../theme.ts";
import { parseModuleOutput } from "./protocol.ts";
import type { ModuleOutput } from "./protocol.ts";
import { verifyModuleFigure } from "./verify.ts";
import type { ModuleVerification } from "./verify.ts";

export type RunModuleOptions = {
  command: string;
  args: string[];
  input: { width: number; height: number; spec?: unknown; parameterOverrides?: Record<string, number> };
  timeoutMs?: number;
};

/**
 * The face every module is told to draw in, and the core measures against.
 *
 * Injected here rather than left to each caller: a module invoked without it
 * would silently fall back to naming a font the measuring browser may not
 * have, which is the defect this exists to remove. A caller may still override
 * it -- the export layer has a real reason to, and nothing else does.
 */
export const MODULE_FONT_STACK = `${BUNDLED_FONT_FAMILY}, ${theme.text.family}`;

export async function runModule(options: RunModuleOptions): Promise<ModuleOutput> {
  const payload = JSON.stringify({
    fontFamily: MODULE_FONT_STACK,
    ...options.input,
  });
  return new Promise<ModuleOutput>((resolve, reject) => {
    const child = spawn(options.command, options.args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`module timed out after ${options.timeoutMs ?? 60_000}ms`));
    }, options.timeoutMs ?? 60_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`module exited ${code}: ${stderr.trim() || "(no stderr)"}`));
        return;
      }
      try {
        resolve(parseModuleOutput(JSON.parse(stdout)));
      } catch (error) {
        reject(
          new Error(
            `module output was not valid: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

export type ModuleRunResult = {
  output: ModuleOutput;
  verification: ModuleVerification;
};

export async function runAndVerifyModule(options: RunModuleOptions): Promise<ModuleRunResult> {
  const output = await runModule(options);
  const browser = await chromium.launch({
    args: ["--disable-lcd-text", "--force-color-profile=srgb"],
  });
  try {
    const verification = await verifyModuleFigure(browser, output);
    return { output, verification };
  } finally {
    await browser.close();
  }
}

// SLOW / INTEGRATION TEST: this file drives the real MCP server as a child
// process over stdio (real JSON-RPC framing), rather than importing its
// handlers in-process. It is the only test file that pays process-spawn cost.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { toolDefinitions, knowledgeResources } from "../src/mcp/server.ts";

const serverPath = fileURLToPath(new URL("../src/mcp/server.ts", import.meta.url));

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

/** Minimal newline-delimited JSON-RPC client driving the real server process. */
class McpClient {
  private child: ReturnType<typeof spawn>;
  private buffer = "";
  private pending = new Map<number, (response: JsonRpcResponse) => void>();
  private nextId = 1;
  stderr = "";

  constructor() {
    this.child = spawn(process.execPath, [serverPath], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout!.setEncoding("utf8");
    this.child.stdout!.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr!.setEncoding("utf8");
    this.child.stderr!.on("data", (chunk: string) => {
      this.stderr += chunk;
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length === 0) continue;
      const message = JSON.parse(line) as JsonRpcResponse;
      const resolve = this.pending.get(message.id);
      if (resolve !== undefined) {
        this.pending.delete(message.id);
        resolve(message);
      }
    }
  }

  request(method: string, params?: unknown): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin!.write(payload);
    });
  }

  kill(): void {
    this.child.kill();
  }
}

test(
  "MCP server over stdio: initialize, tools/list, resources/list, tools/call",
  { timeout: 60000 },
  async () => {
    const client = new McpClient();
    try {
      const initResponse = await client.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "prancheta-test-client", version: "0.0.0" },
      });
      assert.equal(initResponse.error, undefined, `initialize errored: ${JSON.stringify(initResponse.error)}`);
      const initResult = initResponse.result as {
        serverInfo: { name: string };
        instructions?: string;
      };
      assert.equal(initResult.serverInfo.name, "prancheta");
      assert.ok(
        typeof initResult.instructions === "string" && initResult.instructions.length > 0,
        "expected non-empty instructions",
      );

      // The SDK requires the initialized notification before further requests.
      client.request("notifications/initialized").catch(() => {});

      const toolsResponse = await client.request("tools/list");
      assert.equal(toolsResponse.error, undefined, `tools/list errored: ${JSON.stringify(toolsResponse.error)}`);
      const toolsResult = toolsResponse.result as { tools: { name: string }[] };
      assert.deepEqual(
        toolsResult.tools.map((tool) => tool.name),
        toolDefinitions().map((tool) => tool.name),
      );

      const resourcesResponse = await client.request("resources/list");
      assert.equal(
        resourcesResponse.error,
        undefined,
        `resources/list errored: ${JSON.stringify(resourcesResponse.error)}`,
      );
      const resourcesResult = resourcesResponse.result as { resources: { uri: string }[] };
      assert.deepEqual(
        resourcesResult.resources.map((resource) => resource.uri),
        knowledgeResources().map((resource) => resource.uri),
      );

      const presetsCallResponse = await client.request("tools/call", {
        name: "presets",
        arguments: {},
      });
      assert.equal(
        presetsCallResponse.error,
        undefined,
        `tools/call presets errored: ${JSON.stringify(presetsCallResponse.error)}`,
      );
      const presetsResult = presetsCallResponse.result as {
        isError: boolean;
        content: { type: string; text: string }[];
      };
      assert.equal(presetsResult.isError, false);
      const text = presetsResult.content.map((block) => block.text).join("\n");
      assert.ok(text.includes("labelled-blocks"), `expected "labelled-blocks" in presets output: ${text}`);
    } finally {
      client.kill();
    }
  },
);

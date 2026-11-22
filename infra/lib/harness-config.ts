import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..", "..");

export interface HarnessConfig {
  harnessName: string;
  model: { bedrockModelConfig: { modelId: string; maxTokens?: number; temperature?: number } };
  classifierModelId: string;
  allowedTools: string[];
  maxIterations: number;
  timeoutSeconds: number;
}

export function loadHarnessConfig(): HarnessConfig {
  return JSON.parse(readFileSync(join(REPO_ROOT, "harness", "harness.json"), "utf8"));
}

export function loadSystemPrompt(): string {
  return readFileSync(join(REPO_ROOT, "harness", "system-prompt.md"), "utf8").trim();
}

// harness.json uses the API's camelCase; CloudFormation wants PascalCase.
// JSON Schema bodies and free-form params are passed through untouched.
const OPAQUE_KEYS = new Set(["inputSchema", "additionalParams"]);

export function toCfn(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCfn);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), OPAQUE_KEYS.has(k) ? v : toCfn(v)]),
  );
}

/**
 * updateRegistry.js -- File Registry Updater
 *
 * When the Coder writes User.js, future tasks need to know:
 * "What does User.js export? What functions? What arguments?"
 *
 * The registry is a lightweight index: path -> exports.
 * Uses an LLM call to reliably extract exports from arbitrary JS code.
 */

import { safeCallLLM, makeTokenDelta, emptyTokenDelta } from "../utils/llm.js";
import { readFile } from "../utils/sandboxManager.js";

const REGISTRY_PROMPT = `You are analyzing JavaScript/JSX files to extract their public interface.

For each file, extract:
- Default export (if any): what it is and how to import it
- Named exports: list each with type and parameters
- The EXACT import statement other files should use

OUTPUT FORMAT (strict JSON):
{
  "files": [
    {
      "path": "backend/src/config/db.js",
      "defaultExport": null,
      "namedExports": ["pool", "connectDB"],
      "importStatement": "import { pool, connectDB } from '../config/db.js'",
      "interface": "pool: pg.Pool instance for queries. connectDB(): async, tests connection, returns void"
    }
  ]
}

RULES:
- importStatement must be a VALID ES module import that other files can copy-paste
- Use relative paths in importStatement (../models/User.js, not absolute)
- Be precise -- if it's "export default class User", defaultExport is "User"
- If it's "export const pool = ...", that's a namedExport
- List ALL exports, not just the main one
- Mark every function as "async" or "sync" in the interface description
- If a function returns a Promise or uses await, it is async -- the caller MUST use await`;

export async function updateRegistryNode(state) {
    console.log("\n[Update Registry] Indexing new files...\n");

    const { coderOutput, sandboxId } = state;

    if (!coderOutput?.files?.length) {
        console.log("   No files to index");
        return {};
    }

    // Read the actual file contents from sandbox
    const fileContents = [];
    for (const file of coderOutput.files) {
        if (file.error) continue;
        try {
            const content = readFile(sandboxId, file.path);
            if (content) {
                fileContents.push({ path: file.path, content });
            }
        } catch (e) {
            console.warn(`   Could not read ${file.path}: ${e.message}`);
        }
    }

    if (fileContents.length === 0) {
        console.log("   No file contents to analyze");
        return {};
    }

    const userPrompt = fileContents.map(f =>
        `--- ${f.path} ---\n${f.content}\n`
    ).join("\n");

    const result = await safeCallLLM({
        systemPrompt: REGISTRY_PROMPT,
        userPrompt,
        agentName: "updateRegistry",
        currentCost: state.tokenUsage?.estimatedCost || 0,
        tokenBudget: state.tokenBudget,
    });

    if (!result.ok) {
        console.error(`   [updateRegistry] LLM failed: ${result.error}`);
        return { error: `updateRegistry failed: ${result.error}`, tokenUsage: emptyTokenDelta("updateRegistry") };
    }

    const registryEntries = result.parsed.files || [];

    console.log(`   Indexed ${registryEntries.length} files:`);
    registryEntries.forEach(f => {
        console.log(`   - ${f.path} -> ${f.importStatement || "no import info"}`);
    });

    return {
        fileRegistry: registryEntries.map(f => ({
            path: f.path,
            defaultExport: f.defaultExport || null,
            namedExports: f.namedExports || [],
            exports: [...(f.namedExports || []), ...(f.defaultExport ? [f.defaultExport] : [])],
            importStatement: f.importStatement || "",
            interface: f.interface || "",
            updatedAt: Date.now(),
        })),
        tokenUsage: makeTokenDelta("updateRegistry", result.tokens),
    };
}

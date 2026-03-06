/**
 * setupSandbox.js - LangGraph Node
 *
 * Takes the Architect's folder structure and dependencies,
 * creates a real project workspace on disk.
 * Zero LLM calls.
 */

import { createSandbox } from "../utils/sandboxManager.js";

export async function setupSandboxNode(state) {
    console.log("\n[Setup Sandbox] Creating project workspace...\n");

    const { folderStructure, dependencies } = state.blueprint;

    try {
        const sandboxId = await createSandbox(folderStructure, dependencies);

        console.log(`   Sandbox created: ${sandboxId}\n`);

        return {
            sandboxId,
            currentPhase: "sandbox",
        };
    } catch (error) {
        console.error(`   Sandbox creation failed: ${error.message}`);
        return {
            sandboxId: "",
            error: `Sandbox creation failed: ${error.message}`,
        };
    }
}

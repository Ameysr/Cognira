/**
 * sandboxHealthCheck.js - LangGraph Node
 *
 * Runs health checks on the sandbox.
 * If healthy -> selectNextTask (start dev loop).
 * If unhealthy -> retry setup (max 2) or end with error.
 * Zero LLM calls.
 */

import { healthCheck, getSandboxPath } from "../utils/sandboxManager.js";

export async function sandboxHealthCheckNode(state) {
    console.log("\n[Sandbox Health Check] Verifying workspace...\n");

    const { sandboxId } = state;

    if (!sandboxId) {
        console.log("   No sandbox ID found");
        return {
            sandboxHealthy: false,
            error: "No sandbox ID -- setup may have failed",
        };
    }

    const result = await healthCheck(sandboxId);

    if (result.healthy) {
        console.log("   All health checks passed!");
        console.log(`   Sandbox path: ${result.sandboxPath}`);
        return {
            sandboxHealthy: true,
        };
    }

    console.log("   Health check failures:");
    result.failures.forEach(f => console.log(`   - ${f}`));

    return {
        sandboxHealthy: false,
        error: `Sandbox unhealthy: ${result.failures.join("; ")}`,
    };
}

export function sandboxHealthRouter(state) {
    if (state.sandboxHealthy) {
        return "selectNextTask";
    }

    console.log("   Sandbox unhealthy -- ending with error. Fix manually and retry.");
    return "__end__";
}

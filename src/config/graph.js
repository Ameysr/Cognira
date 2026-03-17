/**
 * graph.js - Complete LangGraph Definition
 *
 * Full Pipeline:
 *
 * Phase 1-3 (Planning):
 * START -> pmAgent <-> humanInput
 *   -> architectStep1 -> 2 -> 3 -> 4 -> 5 -> blueprintValidator
 *       (validator can loop back to step 2/3/4)
 *   -> plannerAgent -> setupSandbox -> sandboxHealthCheck
 *
 * Phase 4 (Dev Loop):
 *   sandboxHealthCheck -> selectNextTask
 *   selectNextTask -> contextBuilder | phaseVerification | presentToUser
 *   contextBuilder -> coderAgent -> updateRegistry -> reviewerAgent
 *   reviewerAgent -> executorAgent | contextBuilder (retry) | simplifyTask
 *   executorAgent -> snapshotManager | debuggerAgent
 *   debuggerAgent -> contextBuilder (retry) | humanEscalation
 *   humanEscalation -> selectNextTask | contextBuilder | simplifyTask
 *   snapshotManager -> stateCompactor -> selectNextTask
 *   phaseVerification -> patternExtractor -> stateCompactor -> selectNextTask
 *   simplifyTask -> selectNextTask
 *   presentToUser -> END
 */

import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentState } from "../config/state.js";

// Phase 1-3 (Planning)
import { pmAgentNode } from "../agents/pmAgent.js";
import { humanInputNode } from "../nodes/humanInput.js";
import {
    architectStep1Node, architectStep2Node, architectStep3Node,
    architectStep4Node, architectStep5Node,
} from "../agents/architectAgent.js";
import { blueprintValidatorNode, blueprintValidatorRouter } from "../agents/blueprintValidator.js";
import { plannerAgentNode } from "../agents/plannerAgent.js";
import { setupSandboxNode } from "../nodes/setupSandbox.js";
import { sandboxHealthCheckNode, sandboxHealthRouter } from "../nodes/sandboxHealthCheck.js";

// Phase 4 (Dev Loop)
import { selectNextTaskNode, selectNextTaskRouter } from "../nodes/selectNextTask.js";
import { contextBuilderNode } from "../nodes/contextBuilder.js";
import { coderAgentNode } from "../agents/coderAgent.js";
import { updateRegistryNode } from "../nodes/updateRegistry.js";
import { reviewerAgentNode, reviewerRouter } from "../agents/reviewerAgent.js";
import { executorAgentNode, executorRouter } from "../agents/executorAgent.js";
import { debuggerAgentNode, debuggerRouter } from "../agents/debuggerAgent.js";
import { snapshotManagerNode } from "../nodes/snapshotManager.js";
import { simplifyTaskNode } from "../nodes/simplifyTask.js";
import { humanEscalationNode, humanEscalationRouter } from "../nodes/humanEscalation.js";
import { phaseVerificationNode, phaseVerificationRouter } from "../nodes/phaseVerification.js";
import { patternExtractorNode } from "../nodes/patternExtractor.js";
import { stateCompactorNode } from "../nodes/stateCompactor.js";
import { presentToUserNode } from "../nodes/presentToUser.js";

export function buildGraph(options = {}) {
    const { checkpointer } = options;
    const graph = new StateGraph(AgentState);

    // ===== Phase 1-3 Nodes (Planning) =====
    graph.addNode("pmAgent", pmAgentNode);
    graph.addNode("humanInput", humanInputNode);

    graph.addNode("architectStep1", architectStep1Node);
    graph.addNode("architectStep2", architectStep2Node);
    graph.addNode("architectStep3", architectStep3Node);
    graph.addNode("architectStep4", architectStep4Node);
    graph.addNode("architectStep5", architectStep5Node);
    graph.addNode("blueprintValidator", blueprintValidatorNode);

    graph.addNode("plannerAgent", plannerAgentNode);
    graph.addNode("setupSandbox", setupSandboxNode);
    graph.addNode("sandboxHealthCheck", sandboxHealthCheckNode);

    // ===== Phase 4 Nodes (Dev Loop) =====
    graph.addNode("selectNextTask", selectNextTaskNode);
    graph.addNode("contextBuilder", contextBuilderNode);
    graph.addNode("coderAgent", coderAgentNode);
    graph.addNode("updateRegistry", updateRegistryNode);
    graph.addNode("reviewerAgent", reviewerAgentNode);
    graph.addNode("executorAgent", executorAgentNode);
    graph.addNode("debuggerAgent", debuggerAgentNode);
    graph.addNode("snapshotManager", snapshotManagerNode);
    graph.addNode("simplifyTask", simplifyTaskNode);
    graph.addNode("humanEscalation", humanEscalationNode);
    graph.addNode("phaseVerification", phaseVerificationNode);
    graph.addNode("patternExtractor", patternExtractorNode);
    graph.addNode("stateCompactor", stateCompactorNode);
    graph.addNode("presentToUser", presentToUserNode);

    // ===== Phase 1-3 Edges (Planning) =====

    // PM Agent
    graph.addEdge(START, "pmAgent");

    graph.addConditionalEdges("pmAgent", (state) => {
        if (state.pmStatus === "needs_clarification") return "humanInput";
        if (state.pmStatus === "spec_ready") return "architectStep1";
        return END;
    });

    graph.addEdge("humanInput", "pmAgent");

    // Architect chain
    graph.addEdge("architectStep1", "architectStep2");
    graph.addEdge("architectStep2", "architectStep3");
    graph.addEdge("architectStep3", "architectStep4");
    graph.addEdge("architectStep4", "architectStep5");
    graph.addEdge("architectStep5", "blueprintValidator");

    // Blueprint Validator -> Planner
    graph.addConditionalEdges("blueprintValidator", blueprintValidatorRouter, {
        __end__: "plannerAgent",
        architectStep2: "architectStep2",
        architectStep3: "architectStep3",
        architectStep4: "architectStep4",
    });

    // Planner -> Sandbox
    graph.addEdge("plannerAgent", "setupSandbox");
    graph.addEdge("setupSandbox", "sandboxHealthCheck");

    // Sandbox Health Check -> Dev Loop or END
    graph.addConditionalEdges("sandboxHealthCheck", sandboxHealthRouter, {
        selectNextTask: "selectNextTask",
        __end__: END,
    });

    // ===== Phase 4 Edges (Dev Loop) =====

    // Task Selection: routes to contextBuilder, phaseVerification, or presentToUser
    graph.addConditionalEdges("selectNextTask", selectNextTaskRouter, {
        contextBuilder: "contextBuilder",
        phaseVerification: "phaseVerification",
        presentToUser: "presentToUser",
    });

    // Core Dev Loop: context -> code -> registry -> review
    graph.addEdge("contextBuilder", "coderAgent");
    graph.addEdge("coderAgent", "updateRegistry");
    graph.addEdge("updateRegistry", "reviewerAgent");

    // Reviewer: approved -> executor, rejected -> context (retry), 3+ rejects -> simplify
    graph.addConditionalEdges("reviewerAgent", reviewerRouter, {
        executorAgent: "executorAgent",
        contextBuilder: "contextBuilder",
        simplifyTask: "simplifyTask",
    });

    // Executor: pass -> snapshot, fail -> debugger
    graph.addConditionalEdges("executorAgent", executorRouter, {
        snapshotManager: "snapshotManager",
        debuggerAgent: "debuggerAgent",
    });

    // Debugger: tier 1-2 -> context (retry), tier 3 -> human escalation
    graph.addConditionalEdges("debuggerAgent", debuggerRouter, {
        contextBuilder: "contextBuilder",
        humanEscalation: "humanEscalation",
    });

    // Human Escalation: skip -> selectNext, guide -> context, simplify -> simplify
    graph.addConditionalEdges("humanEscalation", humanEscalationRouter, {
        selectNextTask: "selectNextTask",
        contextBuilder: "contextBuilder",
        simplifyTask: "simplifyTask",
    });

    // Snapshot -> State Compactor -> Next Task
    graph.addEdge("snapshotManager", "stateCompactor");
    graph.addEdge("stateCompactor", "selectNextTask");

    // Simplify -> Select Next Task (sub-tasks injected into queue)
    graph.addEdge("simplifyTask", "selectNextTask");

    // Phase Verification -> Pattern Extractor -> State Compactor (loops back to selectNextTask)
    graph.addConditionalEdges("phaseVerification", phaseVerificationRouter, {
        patternExtractor: "patternExtractor",
    });
    graph.addEdge("patternExtractor", "stateCompactor");

    // Present to User -> END
    graph.addEdge("presentToUser", END);

    // ===== Compile =====
    const saver = checkpointer || new MemorySaver();
    const compiled = graph.compile({ checkpointer: saver });

    console.log("[OK] Graph compiled (PM + Architect + Planner + Sandbox + Dev Loop)");
    return compiled;
}

export async function createCheckpointer() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        try {
            const { RedisSaver } = await import("@langchain/langgraph-checkpoint-redis");
            const saver = await RedisSaver.fromUrl(redisUrl);
            console.log("[OK] Redis checkpointer connected");
            return saver;
        } catch (error) {
            console.warn(`[WARN] Redis failed: ${error.message}. Using in-memory.`);
        }
    } else {
        console.log("[INFO] No REDIS_URL. Using in-memory checkpointer.");
    }
    return new MemorySaver();
}

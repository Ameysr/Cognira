/**
 * state.js - Complete State Definition
 *
 * In LangGraph, state is the ONLY way nodes communicate.
 * This file defines the full state shape for all nodes.
 *
 * Reducers:
 * - Simple fields: "last write wins" -- no reducer needed
 * - Array fields that accumulate: need a reducer that merges old + new
 */

import { Annotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({

    // -- User Input --
    userRequirement: Annotation({
        reducer: (_, y) => y ?? "",
        default: () => "",
    }),

    // -- PM Agent --
    pmStatus: Annotation({
        reducer: (_, y) => y ?? "idle",
        default: () => "idle",
    }),

    pmQuestions: Annotation({
        reducer: (_, y) => y ?? [],
        default: () => [],
    }),

    pmConversation: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            if (Array.isArray(incoming)) return [...existing, ...incoming];
            return [...existing, incoming];
        },
        default: () => [],
    }),

    clarifiedSpec: Annotation({
        reducer: (_, y) => y ?? null,
        default: () => null,
    }),

    // -- Architect Agent --
    blueprint: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            return { ...existing, ...incoming };
        },
        default: () => ({
            entities: [],
            dbSchema: {},
            apiEndpoints: [],
            frontendPages: [],
            folderStructure: "",
            dependencies: {},
        }),
    }),

    // -- Blueprint Validator --
    blueprintValidation: Annotation({
        reducer: (_, y) => y ?? { isValid: false, issues: [], validationCycles: 0 },
        default: () => ({ isValid: false, issues: [], validationCycles: 0 }),
    }),

    // -- Planner Agent --
    taskQueue: Annotation({
        reducer: (_, y) => y ?? { phases: [] },
        default: () => ({ phases: [] }),
    }),

    currentPhaseIndex: Annotation({
        reducer: (_, y) => y ?? 0,
        default: () => 0,
    }),

    currentTaskIndex: Annotation({
        reducer: (_, y) => y ?? 0,
        default: () => 0,
    }),

    // -- File Interface Registry --
    fileRegistry: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            if (Array.isArray(incoming)) {
                const map = new Map(existing.map((f) => [f.path, f]));
                for (const entry of incoming) {
                    map.set(entry.path, entry);
                }
                return Array.from(map.values());
            }
            return existing;
        },
        default: () => [],
    }),

    // -- Project Patterns --
    projectPatterns: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            return { ...existing, ...incoming };
        },
        default: () => ({
            errorHandling: "",
            namingConvention: "",
            responseFormat: "",
            importStyle: "",
            stateManagement: "",
            commentStyle: "",
        }),
    }),

    // -- Sandbox --
    sandboxId: Annotation({
        reducer: (_, y) => y ?? "",
        default: () => "",
    }),

    sandboxHealthy: Annotation({
        reducer: (_, y) => y ?? false,
        default: () => false,
    }),

    // -- Reviewer --
    reviewResult: Annotation({
        reducer: (_, y) => y ?? { verdict: "", issues: [], reviewCycle: 0 },
        default: () => ({ verdict: "", issues: [], reviewCycle: 0 }),
    }),

    // -- Executor --
    executionResult: Annotation({
        reducer: (_, y) => y ?? { result: "", output: "", errors: "" },
        default: () => ({ result: "", output: "", errors: "" }),
    }),

    // -- Debugger --
    debugState: Annotation({
        reducer: (_, y) => y ?? { tier: 1, attempts: 0, maxAttempts: 3, rollbackAttempted: false },
        default: () => ({ tier: 1, attempts: 0, maxAttempts: 3, rollbackAttempted: false }),
    }),

    // -- User Feedback --
    userFeedback: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            if (Array.isArray(incoming)) return [...existing, ...incoming];
            return [...existing, incoming];
        },
        default: () => [],
    }),

    feedbackIteration: Annotation({
        reducer: (_, y) => y ?? 0,
        default: () => 0,
    }),

    maxFeedbackIterations: Annotation({
        reducer: (_, y) => y ?? 3,
        default: () => 3,
    }),

    scopeDrift: Annotation({
        reducer: (_, y) => y ?? 0.0,
        default: () => 0.0,
    }),

    userSatisfied: Annotation({
        reducer: (_, y) => y ?? false,
        default: () => false,
    }),

    // -- Deployment --
    deploymentConfig: Annotation({
        reducer: (_, y) => y ?? { platform: "", files: [], instructions: [] },
        default: () => ({ platform: "", files: [], instructions: [] }),
    }),

    // -- Token Tracking --
    tokenUsage: Annotation({
        reducer: (existing, incoming) => {
            if (!incoming) return existing;
            return {
                calls: [...(existing.calls || []), ...(incoming.newCalls || [])],
                totalInput: existing.totalInput + (incoming.addedInput || 0),
                totalOutput: existing.totalOutput + (incoming.addedOutput || 0),
                estimatedCost: existing.estimatedCost + (incoming.addedCost || 0),
            };
        },
        default: () => ({
            calls: [],
            totalInput: 0,
            totalOutput: 0,
            estimatedCost: 0.0,
        }),
    }),

    tokenBudget: Annotation({
        reducer: (_, y) => y ?? 2.0,
        default: () => 2.0,
    }),

    // -- Control --
    currentPhase: Annotation({
        reducer: (_, y) => y ?? "pm",
        default: () => "pm",
    }),

    error: Annotation({
        reducer: (_, y) => y ?? null,
        default: () => null,
    }),
});

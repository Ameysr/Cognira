/**
 * plannerAgent.js - Planner Agent
 *
 * Takes the Architect's blueprint and creates a BUILD ORDER:
 * which file to write first, which depends on what,
 * and which things can happen in parallel.
 *
 * Mandatory phase order:
 * 1. Project Setup + Database + Models
 * 2. Common Middleware + Utilities
 * 3. Backend API Routes
 * 4. Frontend Pages + Components
 * 5. Integration + End-to-End Wiring
 */

import { callLLM, makeTokenDelta } from "../utils/llm.js";

const PLANNER_PROMPT = `You are the Planner Agent in an AI software development team.

ROLE: Senior tech lead who creates the build plan.

GOAL: Break the architecture blueprint into an ordered sequence of coding tasks,
grouped into phases, with dependency tracking and parallelization flags.

MANDATORY PHASE ORDER:
1. "setup" — Project scaffolding, DB connection, models/schemas
2. "middleware" — Auth middleware, error handler, validators, utilities
3. "backend" — API routes (one task per resource/entity)
4. "frontend" — React pages + components (one task per page)
5. "integration" — Wiring frontend to backend, environment configs, final touches

OUTPUT FORMAT (strict JSON):
{
  "phases": [
    {
      "phaseNumber": 1,
      "phaseName": "setup",
      "description": "What this phase accomplishes",
      "tasks": [
        {
          "taskId": "setup-1",
          "title": "Short task title",
          "description": "What exactly to build in this task",
          "filesToCreate": ["/backend/src/models/User.js", "/backend/src/config/db.js"],
          "filesNeeded": [],
          "acceptanceCriteria": ["DB connects successfully", "User model has all fields"],
          "canParallelize": false,
          "estimatedTokens": 500
        }
      ],
      "verificationCommand": "Command to verify this phase works (e.g., 'node backend/src/config/db.js')"
    }
  ],
  "totalTasks": 15,
  "estimatedTotalTokens": 8000
}

RULES:
- Each task creates 1-3 files max. Small, focused tasks.
- "filesNeeded" lists files this task READS (must already exist from prior tasks).
- "filesToCreate" lists files this task WRITES.
- Tasks within the SAME phase can have canParallelize: true ONLY if their filesNeeded don't overlap.
- Phase 1 tasks are usually sequential (each builds on the last).
- Phase 3 tasks (API routes) are often parallelizable (each route is independent).
- Phase 4 tasks (frontend pages) are often parallelizable.
- Give each task a unique taskId: "phaseName-number" (e.g., "setup-1", "backend-3").
- Include a verification command per phase to test if the phase works.
- estimatedTokens = rough guess of how many output tokens the Coder will need.
- Keep task count reasonable: 10-20 tasks for a typical CRUD app.`;

export async function plannerAgentNode(state) {
    console.log("\n[Planner Agent] Creating build plan...\n");

    const { blueprint, clarifiedSpec } = state;

    const blueprintSummary = {
        databaseType: blueprint.dbSchema?.databaseType,
        tables: blueprint.dbSchema?.tables?.map(t => ({
            name: t.name,
            fieldCount: t.fields?.length,
            foreignKeys: t.foreignKeys?.map(fk => fk.references),
        })),
        apiEndpoints: blueprint.apiEndpoints?.map(e => ({
            method: e.method,
            path: e.path,
            relatedTable: e.relatedTable,
            requiresAuth: e.requiresAuth,
        })),
        frontendPages: blueprint.frontendPages?.map(p => ({
            name: p.name,
            route: p.route,
            componentCount: p.components?.length,
        })),
        folderStructure: blueprint.folderStructure,
        backendDeps: Object.keys(blueprint.dependencies?.backend?.dependencies || {}),
        frontendDeps: Object.keys(blueprint.dependencies?.frontend?.dependencies || {}),
    };

    const result = await callLLM({
        systemPrompt: PLANNER_PROMPT,
        userPrompt: `App: ${clarifiedSpec.appName}\n\nBlueprint Summary:\n${JSON.stringify(blueprintSummary, null, 2)}\n\nSpec:\n${JSON.stringify(clarifiedSpec, null, 2)}`,
        agentName: "plannerAgent",
        currentCost: state.tokenUsage?.estimatedCost || 0,
        tokenBudget: state.tokenBudget,
    });

    const plan = result.parsed;

    console.log(`   Total phases: ${plan.phases?.length || 0}`);
    console.log(`   Total tasks: ${plan.totalTasks || "?"}`);
    console.log(`   Estimated tokens: ${plan.estimatedTotalTokens || "?"}`);
    console.log("");

    if (plan.phases) {
        for (const phase of plan.phases) {
            const parallelCount = phase.tasks?.filter(t => t.canParallelize).length || 0;
            console.log(`   Phase ${phase.phaseNumber}: ${phase.phaseName} -- ${phase.tasks?.length || 0} tasks (${parallelCount} parallelizable)`);
            phase.tasks?.forEach(t => {
                console.log(`     ${t.canParallelize ? "||" : "->"} ${t.taskId}: ${t.title} (${t.filesToCreate?.length || 0} files)`);
            });
        }
    }

    return {
        taskQueue: plan,
        currentPhaseIndex: 0,
        currentTaskIndex: 0,
        tokenUsage: makeTokenDelta("plannerAgent", result.tokens),
        currentPhase: "sandbox",
    };
}

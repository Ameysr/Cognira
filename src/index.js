/**
 * index.js - Cognira Main Entry Point
 *
 * Run: node src/index.js "Build me a todo app with user authentication"
 * Or:  node src/index.js   (will prompt you for the requirement)
 *
 * Flow:
 * 1. Initializes LLM (Gemini or DeepSeek based on LLM_PROVIDER env)
 * 2. Creates LangGraph with checkpointer
 * 3. Takes your requirement
 * 4. Runs the multi-agent pipeline:
 *    Phase 1: PM Agent clarifies requirements
 *    Phase 2: Architect designs the system
 *    Phase 3: Planner creates the build order + Sandbox sets up workspace
 *    Phase 4: Dev Loop (Code -> Review -> Execute -> Debug -> Snapshot)
 * 5. Presents completed project
 */

import "dotenv/config";
import * as readline from "readline";
import { initLLM, getActiveProvider } from "./utils/llm.js";
import { printTokenSummary } from "./utils/tokenTracker.js";
import { buildGraph, createCheckpointer } from "./config/graph.js";

// -- Helpers -----------------------------------------------------------------

function askUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function printBanner() {
    console.log("");
    console.log("+----------------------------------------------------------+");
    console.log("|                                                          |");
    console.log("|    COGNIRA - Multi-Agent Development System              |");
    console.log("|                                                          |");
    console.log("|    PM + Architect + Planner + Sandbox + Dev Loop         |");
    console.log("|    Code -> Review -> Execute -> Debug -> Deploy          |");
    console.log("|                                                          |");
    console.log("+----------------------------------------------------------+");
    console.log("");
}

function printSpec(spec) {
    console.log("\n" + "=".repeat(60));
    console.log("  FINAL PROJECT SPECIFICATION");
    console.log("=".repeat(60));
    console.log(JSON.stringify(spec, null, 2));
    console.log("=".repeat(60));
}

function printBlueprint(blueprint, validation) {
    console.log("\n" + "=".repeat(60));
    console.log("  ARCHITECTURE BLUEPRINT");
    console.log("=".repeat(60));

    if (blueprint.entities?.length) {
        console.log(`\n  Entities (${blueprint.entities.length}):`);
        blueprint.entities.forEach(e => {
            console.log(`     - ${e.name} -- ${e.description || ""}`);
        });
    }

    if (blueprint.dbSchema?.tables?.length) {
        console.log(`\n  Database: ${blueprint.dbSchema.databaseType} (${blueprint.dbSchema.tables.length} tables)`);
        blueprint.dbSchema.tables.forEach(t => {
            console.log(`     - ${t.name} (${t.fields?.length || 0} fields)`);
        });
    }

    if (blueprint.apiEndpoints?.length) {
        console.log(`\n  API Endpoints (${blueprint.apiEndpoints.length}):`);
        blueprint.apiEndpoints.forEach(e => {
            const lock = e.requiresAuth ? "[auth]" : "      ";
            console.log(`     ${lock} ${e.method?.padEnd(7)} ${e.path}`);
        });
    }

    if (blueprint.frontendPages?.length) {
        console.log(`\n  Frontend Pages (${blueprint.frontendPages.length}):`);
        blueprint.frontendPages.forEach(p => {
            console.log(`     - ${p.route?.padEnd(20)} ${p.name}`);
        });
    }

    if (blueprint.folderStructure) {
        console.log(`\n  Folder Structure:`);
        const lines = typeof blueprint.folderStructure === "string"
            ? blueprint.folderStructure.split("\n")
            : [JSON.stringify(blueprint.folderStructure)];
        lines.slice(0, 25).forEach(l => console.log(`     ${l}`));
        if (lines.length > 25) console.log(`     ... (${lines.length - 25} more lines)`);
    }

    if (validation) {
        console.log(`\n  Validation: ${validation.isValid ? "PASSED" : "FAILED"} (${validation.validationCycles} cycles)`);
        if (validation.issues?.length) {
            validation.issues.forEach(i => {
                console.log(`     [${i.severity}] ${i.message}`);
            });
        }
    }

    console.log("\n" + "=".repeat(60));
}

// -- Main --------------------------------------------------------------------

async function main() {
    printBanner();

    // 1. Initialize LLM
    const provider = process.env.LLM_PROVIDER || "gemini";

    try {
        initLLM({
            provider,
            geminiApiKey: process.env.GEMINI_API_KEY,
            deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        });

        const model = provider === "gemini"
            ? (process.env.GEMINI_MODEL || "gemini-2.5-flash")
            : (process.env.DEEPSEEK_MODEL || "deepseek-chat");

        console.log(`[OK] LLM initialized (provider: ${provider}, model: ${model})`);
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        console.error("   Create a .env file from .env.example and add your API key");
        process.exit(1);
    }

    // 2. Create checkpointer
    const checkpointer = await createCheckpointer();

    // 3. Build graph
    const graph = buildGraph({ checkpointer });

    // 4. Get requirement from CLI args or prompt
    let requirement = process.argv.slice(2).join(" ");

    if (!requirement) {
        console.log("  What do you want to build?\n");
        console.log("  Examples:");
        console.log('  - "Build a todo app with categories and due dates"');
        console.log('  - "Create an e-commerce store with admin panel"');
        console.log('  - "Build a blog platform with comments and tags"\n');
        requirement = await askUser("  Your idea: ");
    }

    if (!requirement) {
        console.log("  No requirement provided. Exiting.");
        process.exit(0);
    }

    console.log(`\n  Requirement: "${requirement}"\n`);
    console.log("-".repeat(60));

    // 5. Run the graph
    const threadId = `project-${Date.now()}`;
    const config = {
        configurable: {
            thread_id: threadId,
        },
    };

    try {
        const finalState = await graph.invoke(
            {
                userRequirement: requirement,
                tokenBudget: parseFloat(process.env.TOKEN_BUDGET || "2.0"),
            },
            config
        );

        // 6. Display results

        // Spec
        if (finalState.clarifiedSpec) {
            printSpec(finalState.clarifiedSpec);
        }

        // Blueprint
        if (finalState.blueprint?.entities?.length) {
            printBlueprint(finalState.blueprint, finalState.blueprintValidation);
        }

        // Build Plan
        if (finalState.taskQueue?.phases?.length) {
            console.log("\n" + "=".repeat(60));
            console.log("  BUILD PLAN");
            console.log("=".repeat(60));
            for (const phase of finalState.taskQueue.phases) {
                const tasksDone = phase.tasks?.filter(t =>
                    finalState.taskStatuses?.[t.taskId] === "done"
                ).length || 0;
                const totalTasks = phase.tasks?.length || 0;
                const statusIcon = tasksDone === totalTasks ? "[done]" : `[${tasksDone}/${totalTasks}]`;

                console.log(`\n  Phase ${phase.phaseNumber}: ${phase.phaseName} ${statusIcon}`);
                phase.tasks?.forEach(t => {
                    const status = finalState.taskStatuses?.[t.taskId] || "pending";
                    const icon = status === "done" ? "[x]" : status === "in_progress" ? "[>]" : "[ ]";
                    console.log(`    ${icon} ${t.taskId}: ${t.title}`);
                    t.filesToCreate?.forEach(f => console.log(`      ${f}`));
                });
            }
            console.log("=".repeat(60));
        }

        // Sandbox info
        if (finalState.sandboxId) {
            console.log(`\n  Sandbox: ${finalState.sandboxId}`);
            console.log(`  Healthy: ${finalState.sandboxHealthy ? "Yes" : "No"}`);

            try {
                const { getFileList, getSandboxPath } = await import("./utils/sandboxManager.js");
                const files = getFileList(finalState.sandboxId);
                const codeFiles = files.filter(f =>
                    !f.includes("node_modules") && !f.includes(".git") && !f.includes("package-lock")
                );
                console.log(`  Files created: ${codeFiles.length}`);
                codeFiles.slice(0, 25).forEach(f => console.log(`     ${f}`));
                if (codeFiles.length > 25) console.log(`     ... and ${codeFiles.length - 25} more`);

                const sandboxPath = getSandboxPath(finalState.sandboxId);
                console.log(`\n  Project location: ${sandboxPath}`);
            } catch (e) { /* sandbox may be cleaned up */ }
        }

        // Deployment
        if (finalState.deploymentConfig?.files?.length) {
            console.log("\n  Deployment:");
            console.log(`  Platform: ${finalState.deploymentConfig.platform}`);
            finalState.deploymentConfig.instructions?.forEach(i => console.log(`     ${i}`));
        }

        if (!finalState.clarifiedSpec && !finalState.blueprint?.entities?.length) {
            console.log("\n  No output generated.");
        }

        // 7. Token usage summary
        printTokenSummary(finalState.tokenUsage);

    } catch (error) {
        if (error.message?.includes("TOKEN_BUDGET_EXCEEDED")) {
            console.error("\n  Token budget exceeded! Increase TOKEN_BUDGET in .env");
        } else {
            console.error("\n  Error:", error.message);
            if (process.env.DEBUG) {
                console.error(error.stack);
            }
        }
        process.exit(1);
    }
}

main().catch(console.error);

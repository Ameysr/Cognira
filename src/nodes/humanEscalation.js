/**
 * humanEscalation.js -- Human Escalation
 *
 * Last resort when the Debugger can't fix the issue.
 * Presents the problem and lets the user decide: guide, skip, or simplify.
 */

import readline from "readline";

export async function humanEscalationNode(state) {
    console.log("\n[Human Escalation] Need your help!\n");
    console.log("=".repeat(50));
    console.log(`Task: ${state.currentTask?.title || "Unknown"}`);
    console.log(`Error: ${state.executionResult?.errors || "Unknown error"}`);
    console.log("=".repeat(50));
    console.log("\nOptions:");
    console.log("  1. Provide guidance (type your fix suggestion)");
    console.log("  2. Skip this task (move to next)");
    console.log("  3. Simplify this feature");
    console.log("");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise((resolve) => {
        rl.question("Your choice (1/2/3): ", (ans) => {
            rl.close();
            resolve(ans.trim());
        });
    });

    if (answer === "2") {
        console.log("   Skipping task");
        return {
            taskStatuses: { [state.currentTask?.taskId]: "done" },
            currentTask: null,
            reviewResult: { verdict: "", issues: [], reviewCycle: 0 },
            debugState: { tier: 1, attempts: 0, maxAttempts: 3, rollbackAttempted: false },
        };
    }

    if (answer === "3") {
        console.log("   Will simplify task");
        return {};
    }

    const guidanceRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const guidance = await new Promise((resolve) => {
        guidanceRl.question("Your guidance: ", (ans) => {
            guidanceRl.close();
            resolve(ans.trim());
        });
    });

    console.log("   Guidance received, sending back to Coder");

    return {
        reviewResult: {
            verdict: "rejected",
            issues: [`HUMAN GUIDANCE: ${guidance}`],
            reviewCycle: 0,
        },
        debugState: { tier: 1, attempts: 0, maxAttempts: 3, rollbackAttempted: false },
    };
}

/**
 * Router: skip -> selectNextTask, simplify -> simplifyTask, guidance -> contextBuilder
 */
export function humanEscalationRouter(state) {
    if (state.taskStatuses?.[state.currentTask?.taskId] === "done" || !state.currentTask) {
        return "selectNextTask";
    }
    if (state.reviewResult?.issues?.some(i => i.startsWith("HUMAN GUIDANCE"))) {
        return "contextBuilder";
    }
    return "simplifyTask";
}

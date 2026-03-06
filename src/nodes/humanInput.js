/**
 * humanInput.js - Human Input Node
 *
 * When the PM Agent asks questions, this node pauses the graph,
 * gets the user's answer via terminal, and resumes.
 */

import * as readline from "readline";

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

export async function humanInputNode(state) {
    console.log("\n" + "=".repeat(60));
    console.log("  YOUR INPUT NEEDED");
    console.log("=".repeat(60));

    const questions = state.pmQuestions;

    if (!questions || questions.length === 0) {
        console.log("  No questions to answer. Moving on...");
        return {};
    }

    console.log("\n  Please answer the PM Agent's questions.\n");
    console.log("  TIP: You can answer all at once, separated by commas,");
    console.log("     or just give a general description.\n");

    questions.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q}`);
    });

    console.log("");

    const answer = await askUser("  Your answers: ");

    console.log("\n  Got it! Sending your answers to the PM Agent...\n");

    return {
        pmConversation: [
            { role: "user", answers: answer },
        ],
        pmStatus: "idle",
    };
}

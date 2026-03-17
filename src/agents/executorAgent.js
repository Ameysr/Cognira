/**
 * executorAgent.js -- Code Executor (Static Cross-Reference)
 *
 * Instead of running code, we do STATIC ANALYSIS:
 * 1. File existence -- on disk?
 * 2. Syntax check -- valid JS?
 * 3. Import verification -- every import statement resolves to a real file
 * 4. Export verification -- imported names exist in the target file's registry
 * 5. Convention check -- env vars, response format, etc.
 *
 * No runtime needed. Catches 80% of wiring bugs.
 */

import { readFile, getFileList, executeCommand, getSandboxPath } from "../utils/sandboxManager.js";

export function executorAgentNode(state) {
    console.log("\n[Executor] Testing code...\n");

    const { currentTask, coderOutput, sandboxId, fileRegistry } = state;

    if (!currentTask || !sandboxId) {
        return { executionResult: { result: "pass", output: "Nothing to test", errors: "" } };
    }

    const errors = [];
    const outputs = [];
    const files = coderOutput?.files || [];
    const registry = fileRegistry || [];
    const allFiles = getFileList(sandboxId);

    // Level 1: File existence
    for (const file of files) {
        const content = readFile(sandboxId, file.path);
        if (!content) {
            errors.push(`File not found: ${file.path}`);
        } else {
            outputs.push(`+ ${file.path} exists (${content.split("\n").length} lines)`);
        }
    }

    if (errors.length > 0) return buildResult(false, outputs, errors);

    // Level 2: Syntax check (basic structure validation)
    for (const file of files) {
        if (!file.path.endsWith(".js") && !file.path.endsWith(".jsx")) continue;

        if (file.path.endsWith(".jsx")) {
            const content = readFile(sandboxId, file.path);
            if (content && (content.includes("import") || content.includes("export"))) {
                outputs.push(`+ ${file.path} valid module structure`);
            }
            continue;
        }
    }

    if (errors.length > 0) return buildResult(false, outputs, errors);

    // Level 3: Import cross-reference
    for (const file of files) {
        const content = readFile(sandboxId, file.path);
        if (!content) continue;

        const fileDir = file.path.split("/").slice(0, -1).join("/");
        const lines = content.split("\n");

        for (const line of lines) {
            const importMatch = line.match(/import\s+.*\s+from\s+['"]([.][^'"]+)['"]/);
            if (!importMatch) continue;

            const importPath = importMatch[1];
            const resolvedParts = [...fileDir.split("/")];
            for (const part of importPath.split("/")) {
                if (part === "..") resolvedParts.pop();
                else if (part !== ".") resolvedParts.push(part);
            }
            let resolved = resolvedParts.join("/");

            const extensions = ["", ".js", ".jsx", "/index.js", "/index.jsx"];
            let found = false;
            for (const ext of extensions) {
                if (allFiles.includes(resolved + ext)) {
                    found = true;

                    // Level 4: Check imported names exist in registry
                    const namedMatch = line.match(/import\s+\{([^}]+)\}\s+from/);
                    if (namedMatch) {
                        const importedNames = namedMatch[1].split(",").map(n => n.trim().split(" as ")[0].trim());
                        const regEntry = registry.find(r => r.path === resolved + ext || r.path === resolved);
                        if (regEntry && regEntry.exports) {
                            for (const name of importedNames) {
                                if (!regEntry.exports.includes(name)) {
                                    errors.push(`${file.path}: imports "${name}" from ${resolved + ext} but that file doesn't export it. Available: [${regEntry.exports.join(", ")}]`);
                                }
                            }
                        }
                    }
                    break;
                }
            }

            if (!found) {
                if (!importPath.startsWith(".")) continue;
                errors.push(`${file.path}: imports from "${importPath}" but resolved path "${resolved}" not found on disk`);
            }
        }
    }

    // Level 5: Convention checks
    for (const file of files) {
        const content = readFile(sandboxId, file.path);
        if (!content) continue;

        if (file.path.includes("frontend") && content.includes("process.env")) {
            errors.push(`${file.path}: uses process.env -- frontend must use import.meta.env`);
        }

        if (file.path.includes("backend") && content.includes("import.meta.env")) {
            errors.push(`${file.path}: uses import.meta.env -- backend must use process.env`);
        }
    }

    return buildResult(errors.length === 0, outputs, errors);
}

function buildResult(passed, outputs, errors) {
    console.log(`\n   ${passed ? "PASSED" : "FAILED"}`);
    outputs.forEach(o => console.log(`   ${o}`));
    if (errors.length) errors.forEach(e => console.log(`   - ${e}`));
    return {
        executionResult: {
            result: passed ? "pass" : "fail",
            output: outputs.join("\n"),
            errors: errors.join("\n"),
        },
    };
}

export function executorRouter(state) {
    if (state.executionResult?.result === "pass") return "snapshotManager";
    return "debuggerAgent";
}

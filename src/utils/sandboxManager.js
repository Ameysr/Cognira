/**
 * sandboxManager.js - Project Sandbox (Local Filesystem)
 *
 * The sandbox is the workspace where AI-generated code lives.
 * Uses a local folder under os.tmpdir() for Phase 3.
 * In Phase 4, a Docker adapter can replace this with zero agent changes.
 *
 * Interface:
 * - createSandbox(folderStructure, dependencies) -> sandboxId
 * - healthCheck(sandboxId) -> { healthy, failures }
 * - writeFile(sandboxId, path, content)
 * - readFile(sandboxId, path) -> string | null
 * - executeCommand(sandboxId, command) -> { stdout, stderr, exitCode }
 * - snapshot(sandboxId, message) -> git commit + tag
 * - rollback(sandboxId, tag) -> git checkout
 * - getFileList(sandboxId) -> string[]
 * - destroySandbox(sandboxId) -> cleanup
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const sandboxes = new Map();

export async function createSandbox(folderStructure, dependencies) {
    const sandboxId = `sandbox-${Date.now()}`;
    const sandboxPath = path.join(os.tmpdir(), "cognira", sandboxId);

    console.log(`   Creating sandbox: ${sandboxPath}`);

    fs.mkdirSync(sandboxPath, { recursive: true });

    const backendPath = path.join(sandboxPath, "backend");
    const frontendPath = path.join(sandboxPath, "frontend");
    fs.mkdirSync(backendPath, { recursive: true });
    fs.mkdirSync(frontendPath, { recursive: true });

    const backendDirs = ["src", "src/models", "src/routes", "src/middleware", "src/config", "src/utils"];
    const frontendDirs = ["src", "src/pages", "src/components", "src/hooks", "src/context", "src/utils"];

    backendDirs.forEach(d => fs.mkdirSync(path.join(backendPath, d), { recursive: true }));
    frontendDirs.forEach(d => fs.mkdirSync(path.join(frontendPath, d), { recursive: true }));

    if (typeof folderStructure === "string") {
        const lines = folderStructure.split("\n");
        for (const line of lines) {
            const match = line.match(/(?:├──|└──|│\s+├──|│\s+└──|\s+)\s*(.+)/);
            if (match) {
                const item = match[1].trim().replace(/\/$/, "");
                if (item && !item.includes(".") && item.length < 100) {
                    try {
                        fs.mkdirSync(path.join(sandboxPath, item), { recursive: true });
                    } catch (e) { /* ignore invalid paths */ }
                }
            }
        }
    }

    if (dependencies?.backend) {
        const backendPkg = {
            name: dependencies.backend.name || "backend",
            version: "1.0.0",
            type: "module",
            main: "src/index.js",
            scripts: {
                start: "node src/index.js",
                dev: "nodemon src/index.js",
            },
            dependencies: dependencies.backend.dependencies || {},
            devDependencies: dependencies.backend.devDependencies || {},
        };
        fs.writeFileSync(
            path.join(backendPath, "package.json"),
            JSON.stringify(backendPkg, null, 2)
        );
    }

    if (dependencies?.frontend) {
        const frontendPkg = {
            name: dependencies.frontend.name || "frontend",
            version: "1.0.0",
            type: "module",
            scripts: {
                dev: "vite",
                build: "vite build",
                preview: "vite preview",
            },
            dependencies: dependencies.frontend.dependencies || {},
            devDependencies: dependencies.frontend.devDependencies || {},
        };
        fs.writeFileSync(
            path.join(frontendPath, "package.json"),
            JSON.stringify(frontendPkg, null, 2)
        );
    }

    fs.writeFileSync(
        path.join(backendPath, ".env.example"),
        "PORT=5000\nDATABASE_URL=postgresql://user:pass@localhost:5432/dbname\nJWT_SECRET=your_secret\n"
    );
    fs.writeFileSync(
        path.join(frontendPath, ".env.example"),
        "VITE_API_URL=http://localhost:5000/api\n"
    );

    try {
        execSync("git init", { cwd: sandboxPath, stdio: "pipe" });
        execSync("git add -A", { cwd: sandboxPath, stdio: "pipe" });
        execSync('git commit -m "Initial scaffold" --allow-empty', { cwd: sandboxPath, stdio: "pipe" });
        execSync("git tag v0.0.0", { cwd: sandboxPath, stdio: "pipe" });
        console.log("   Git initialized with initial commit");
    } catch (e) {
        console.warn(`   Git init failed: ${e.message}`);
    }

    sandboxes.set(sandboxId, {
        path: sandboxPath,
        backendPath,
        frontendPath,
        createdAt: Date.now(),
        snapshotCount: 0,
    });

    return sandboxId;
}

export async function healthCheck(sandboxId) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) return { healthy: false, failures: ["Sandbox not found"] };

    const failures = [];

    if (!fs.existsSync(sandbox.backendPath)) failures.push("Backend directory missing");
    if (!fs.existsSync(sandbox.frontendPath)) failures.push("Frontend directory missing");

    if (!fs.existsSync(path.join(sandbox.backendPath, "package.json"))) {
        failures.push("Backend package.json missing");
    }
    if (!fs.existsSync(path.join(sandbox.frontendPath, "package.json"))) {
        failures.push("Frontend package.json missing");
    }

    try {
        execSync("git status", { cwd: sandbox.path, stdio: "pipe" });
    } catch (e) {
        failures.push("Git not initialized");
    }

    const requiredDirs = [
        "backend/src", "backend/src/models", "backend/src/routes",
        "frontend/src", "frontend/src/pages", "frontend/src/components",
    ];
    for (const dir of requiredDirs) {
        if (!fs.existsSync(path.join(sandbox.path, dir))) {
            failures.push(`Missing directory: ${dir}`);
        }
    }

    try {
        const tmpStats = fs.statfsSync(os.tmpdir());
        const freeMB = (tmpStats.bfree * tmpStats.bsize) / (1024 * 1024);
        if (freeMB < 100) failures.push(`Low disk space: ${Math.floor(freeMB)}MB free`);
    } catch (e) {
        // statfsSync may not be available on all platforms
    }

    return {
        healthy: failures.length === 0,
        failures,
        sandboxPath: sandbox.path,
    };
}

export function writeFile(sandboxId, filePath, content) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const fullPath = path.join(sandbox.path, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
}

export function readFile(sandboxId, filePath) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const fullPath = path.join(sandbox.path, filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, "utf-8");
}

export function executeCommand(sandboxId, command, timeout = 30000) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
        const stdout = execSync(command, {
            cwd: sandbox.path,
            timeout,
            stdio: "pipe",
            encoding: "utf-8",
        });
        return { stdout: stdout || "", stderr: "", exitCode: 0 };
    } catch (error) {
        return {
            stdout: error.stdout || "",
            stderr: error.stderr || error.message,
            exitCode: error.status || 1,
        };
    }
}

export function snapshot(sandboxId, message) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    sandbox.snapshotCount++;
    const tag = `v0.${sandbox.snapshotCount}.0`;

    try {
        execSync("git add -A", { cwd: sandbox.path, stdio: "pipe" });
        execSync(`git commit -m "${message}" --allow-empty`, { cwd: sandbox.path, stdio: "pipe" });
        execSync(`git tag ${tag}`, { cwd: sandbox.path, stdio: "pipe" });
        return { success: true, tag, message };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function rollback(sandboxId, tag) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    try {
        execSync(`git checkout ${tag}`, { cwd: sandbox.path, stdio: "pipe" });
        return { success: true, rolledBackTo: tag };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export function getFileList(sandboxId) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) throw new Error(`Sandbox ${sandboxId} not found`);

    const files = [];
    function walk(dir, prefix = "") {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name), rel);
            } else {
                files.push(rel);
            }
        }
    }
    walk(sandbox.path);
    return files;
}

export function getSandboxPath(sandboxId) {
    const sandbox = sandboxes.get(sandboxId);
    return sandbox?.path || null;
}

export function destroySandbox(sandboxId) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) return;

    try {
        fs.rmSync(sandbox.path, { recursive: true, force: true });
    } catch (e) { /* best effort cleanup */ }
    sandboxes.delete(sandboxId);
}

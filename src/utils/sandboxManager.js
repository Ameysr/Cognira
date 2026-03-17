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

export async function createSandbox(folderStructure, dependencies, dbSchema) {
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

    // Detect DB type
    const dbType = dependencies?.backend?.dependencies?.mongoose ? "mongo" : "postgres";

    // .env files (actual, not just example)
    fs.writeFileSync(path.join(backendPath, ".env"), [
        "PORT=5000",
        `DATABASE_URL=${dbType === "mongo" ? "mongodb://localhost:27017/appdb" : "postgresql://postgres:postgres@localhost:5432/appdb"}`,
        "JWT_SECRET=dev-secret-change-in-production",
        "NODE_ENV=development",
    ].join("\n") + "\n");

    fs.writeFileSync(path.join(frontendPath, ".env"), [
        "VITE_API_URL=http://localhost:5000/api",
    ].join("\n") + "\n");

    // .gitignore
    fs.writeFileSync(path.join(sandboxPath, ".gitignore"), [
        "node_modules/", ".env", "dist/", ".DS_Store", "*.log",
    ].join("\n") + "\n");

    // --- Deterministic scaffold files ---
    // These NEVER change between projects. Generating them here
    // means the LLM only writes business logic (models, routes, pages).

    // Backend: src/config/db.js
    if (dbType === "postgres") {
        fs.writeFileSync(path.join(backendPath, "src/config/db.js"), `import pg from 'pg';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

export { pool };

export async function connectDB() {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    client.release();
  } catch (err) {
    console.error('DB connection failed:', err.message);
  }
}
`);
    } else {
        fs.writeFileSync(path.join(backendPath, "src/config/db.js"), `import mongoose from 'mongoose';
import 'dotenv/config';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('DB connection failed:', err.message);
  }
}

export default mongoose;
`);
    }

    // Backend: src/index.js (Express skeleton)
    fs.writeFileSync(path.join(backendPath, "src/index.js"), `import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { connectDB } from './config/db.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ROUTE IMPORTS (auto-assembled after all routes are built)
// ROUTE_IMPORTS_PLACEHOLDER
// ROUTE_MOUNTS_PLACEHOLDER

// Error handler (must be last)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

// Start
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
  });
});

export default app;
`);

    // Backend: src/middleware/auth.js (JWT skeleton)
    fs.writeFileSync(path.join(backendPath, "src/middleware/auth.js"), `import jwt from 'jsonwebtoken';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

export function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    next();
  };
}
`);

    // Frontend: index.html
    fs.writeFileSync(path.join(frontendPath, "index.html"), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`);

    // Frontend: src/main.jsx
    fs.writeFileSync(path.join(frontendPath, "src/main.jsx"), `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);

    // Frontend: src/App.jsx (shell -- pages assembled later)
    fs.writeFileSync(path.join(frontendPath, "src/App.jsx"), `import { BrowserRouter, Routes, Route } from 'react-router-dom';

// PAGE IMPORTS (auto-assembled after all pages are built)
// PAGE_IMPORTS_PLACEHOLDER

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center"><p>Loading...</p></div>} />
        {/* PAGE_ROUTES_PLACEHOLDER */}
      </Routes>
    </BrowserRouter>
  );
}
`);

    // Frontend: src/index.css (Tailwind)
    fs.writeFileSync(path.join(frontendPath, "src/index.css"), `@tailwind base;
@tailwind components;
@tailwind utilities;
`);

    // Frontend: tailwind.config.js
    fs.writeFileSync(path.join(frontendPath, "tailwind.config.js"), `/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`);

    // Frontend: postcss.config.js
    fs.writeFileSync(path.join(frontendPath, "postcss.config.js"), `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`);

    // Frontend: vite.config.js
    fs.writeFileSync(path.join(frontendPath, "vite.config.js"), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
`);

    // Frontend: src/utils/api.js (axios instance)
    fs.writeFileSync(path.join(frontendPath, "src/utils/api.js"), `import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = \`Bearer \${token}\`;
  return config;
});

export default api;
`);

    console.log("   Scaffold: backend skeleton, frontend boilerplate, configs created");

    // Git init
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
        dbType,
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

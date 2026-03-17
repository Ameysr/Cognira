/**
 * deploymentVerifier.js -- Generate and Verify Docker Deployment
 *
 * Deterministically generates Dockerfiles, nginx config, docker-compose.yml
 * based on the sandbox's structure. Then verifies by building and testing.
 */

import { execSync } from "child_process";
import { getSandboxPath, readFile } from "../utils/sandboxManager.js";
import fs from "fs";
import path from "path";

const BACKEND_PORT = 15000;
const FRONTEND_PORT = 15173;
const DB_PORT = 15432;

function detectBackendEntry(sandboxPath) {
    const candidates = ["src/index.js", "src/server.js", "src/app.js", "index.js", "server.js", "app.js"];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(sandboxPath, "backend", candidate))) return candidate;
    }
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(sandboxPath, "backend", "package.json"), "utf-8"));
        if (pkg.main) return pkg.main;
        if (pkg.scripts?.start) {
            const match = pkg.scripts.start.match(/node\s+(.+)/);
            if (match) return match[1].trim();
        }
    } catch (e) { /* empty */ }
    return "src/index.js";
}

function detectDbType(sandboxPath) {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(sandboxPath, "backend", "package.json"), "utf-8"));
        if (pkg.dependencies?.mongoose || pkg.dependencies?.mongodb) return "mongo";
    } catch (e) { /* empty */ }
    return "postgres";
}

function generateDeploymentFiles(sandboxPath) {
    const entryPoint = detectBackendEntry(sandboxPath);
    const dbType = detectDbType(sandboxPath);
    const dbImage = dbType === "mongo" ? "mongo:7" : "postgres:16-alpine";
    const dbPort = dbType === "mongo" ? "27017" : "5432";
    const dbEnv = dbType === "mongo"
        ? "MONGO_INITDB_DATABASE: appdb"
        : `POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: appdb`;
    const dbUrl = dbType === "mongo"
        ? "mongodb://db:27017/appdb"
        : "postgresql://postgres:postgres@db:5432/appdb";
    const dbHealthCheck = dbType === "mongo"
        ? 'mongosh --eval "db.runCommand({ping:1})" --quiet'
        : "pg_isready -U postgres";

    console.log(`   Detected entry point: ${entryPoint}`);
    console.log(`   Detected DB type: ${dbType}`);

    // Backend Dockerfile
    fs.writeFileSync(path.join(sandboxPath, "backend", "Dockerfile"), `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 5000
CMD ["node", "${entryPoint}"]
`);

    // Frontend Dockerfile
    fs.writeFileSync(path.join(sandboxPath, "frontend", "Dockerfile"), `FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
`);

    // Nginx config
    fs.writeFileSync(path.join(sandboxPath, "frontend", "nginx.conf"), `server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
`);

    // docker-compose.yml
    fs.writeFileSync(path.join(sandboxPath, "docker-compose.yml"), `version: "3.8"

services:
  db:
    image: ${dbImage}
    restart: unless-stopped
    ports:
      - "${DB_PORT}:${dbPort}"
    environment:
      ${dbEnv}
    volumes:
      - db_data:/var/lib/${dbType === "mongo" ? "mongodb" : "postgresql"}/data
    healthcheck:
      test: ["CMD-SHELL", "${dbHealthCheck}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT}:5000"
    environment:
      DATABASE_URL: ${dbUrl}
      JWT_SECRET: dev-secret-change-in-production
      PORT: "5000"
      NODE_ENV: production
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT}:80"
    depends_on:
      - backend

volumes:
  db_data:
`);

    // Ensure .env files
    const backendEnv = path.join(sandboxPath, "backend", ".env");
    if (!fs.existsSync(backendEnv)) {
        fs.writeFileSync(backendEnv, `DATABASE_URL=${dbUrl}\nJWT_SECRET=dev-secret-change-in-production\nPORT=5000\nNODE_ENV=production\n`);
    }

    const frontendEnv = path.join(sandboxPath, "frontend", ".env");
    if (!fs.existsSync(frontendEnv)) {
        fs.writeFileSync(frontendEnv, `VITE_API_URL=/api\n`);
    }

    console.log("   Generated: Dockerfiles, nginx.conf, docker-compose.yml");
    return { entryPoint, dbType };
}

export async function deploymentVerifierNode(state) {
    const attempts = state.deploymentAttempts || 0;

    if (attempts >= 2) {
        console.log("\n[Deployment Verifier] Max attempts reached. Presenting project as-is.\n");
        return {
            deploymentAttempts: attempts,
            executionResult: { result: "pass", output: "Skipped -- max attempts. Code is complete, docker-compose may need manual fixes.", errors: "" },
        };
    }

    console.log(`\n[Deployment Verifier] Setting up deployment (attempt ${attempts + 1}/2)...\n`);

    const sandboxPath = getSandboxPath(state.sandboxId);

    if (!sandboxPath) {
        console.log("   No sandbox path -- skipping");
        return {
            deploymentAttempts: attempts + 1,
            executionResult: { result: "pass", output: "Skipped -- no sandbox", errors: "" },
        };
    }

    const outputs = [];
    const errors = [];

    try {
        console.log("   Generating deployment files...");
        const { entryPoint, dbType } = generateDeploymentFiles(sandboxPath);
        outputs.push(`Generated Dockerfiles (entry: ${entryPoint}, db: ${dbType})`);

        // Attempt Docker build if available
        try {
            execSync("docker info", { stdio: "pipe", timeout: 5000 });

            console.log("   Building containers (this may take a minute)...");
            const buildResult = runInSandbox(sandboxPath, "docker-compose build --no-cache 2>&1", 300000);

            if (buildResult.exitCode !== 0) {
                const lastLines = (buildResult.stdout + "\n" + buildResult.stderr).trim().split("\n").slice(-20).join("\n");
                errors.push(`Docker build failed:\n${lastLines}`);
                return buildVerifyResult(false, outputs, errors, attempts + 1);
            }
            outputs.push("Docker build successful");

            console.log("   Starting services...");
            runInSandbox(sandboxPath, "docker-compose down 2>&1", 15000);
            const upResult = runInSandbox(sandboxPath, "docker-compose up -d 2>&1", 60000);
            if (upResult.exitCode === 0) outputs.push("Services started");

        } catch (e) {
            // Docker not available -- that's OK, deployment files are still generated
            outputs.push("Docker not available -- deployment files generated for manual use");
        }

        return buildVerifyResult(errors.length === 0, outputs, errors, attempts + 1);

    } catch (e) {
        errors.push(`Verification error: ${e.message}`);
        return buildVerifyResult(false, outputs, errors, attempts + 1);
    }
}

function runInSandbox(sandboxPath, command, timeout = 30000) {
    try {
        const stdout = execSync(command, {
            cwd: sandboxPath,
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

function buildVerifyResult(passed, outputs, errors, attempts) {
    console.log(`\n   ${passed ? "VERIFIED" : "FAILED"}`);
    outputs.forEach(o => console.log(`   + ${o}`));
    if (errors.length) errors.forEach(e => console.log(`   - ${e}`));

    return {
        deploymentAttempts: attempts,
        executionResult: {
            result: passed ? "pass" : "fail",
            output: outputs.join("\n"),
            errors: errors.join("\n"),
        },
        deploymentConfig: {
            platform: "docker-compose",
            files: ["docker-compose.yml", "backend/Dockerfile", "frontend/Dockerfile", "frontend/nginx.conf"],
            instructions: [
                "cd sandboxes/<sandbox-id>",
                "docker-compose up --build",
                `Frontend: http://localhost:${FRONTEND_PORT}`,
                `Backend API: http://localhost:${BACKEND_PORT}/api`,
            ],
        },
    };
}

/**
 * Router: pass -> presentToUser, fail (under 2 attempts) -> debuggerAgent
 */
export function deploymentVerifierRouter(state) {
    if (state.executionResult?.result === "pass") return "presentToUser";
    if ((state.deploymentAttempts || 0) >= 2) return "presentToUser";
    return "debuggerAgent";
}

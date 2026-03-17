/**
 * server/index.js -- Express + WebSocket Server
 *
 * The glue between:
 *   1. React Dashboard (frontend, port 5173)
 *   2. LangGraph Pipeline (backend logic)
 *
 * Provides:
 *   - REST API on /api/* for project management
 *   - WebSocket on /ws for real-time streaming
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";

import { initLLM } from "../src/utils/llm.js";
import projectRoutes from "./routes/projects.js";
import { initWebSocket } from "./ws/handler.js";

const PORT = process.env.SERVER_PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
        console.log(`   ${req.method} ${req.path}`);
    }
    next();
});

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        version: "1.0.0",
        provider: process.env.LLM_PROVIDER || "gemini",
        timestamp: Date.now(),
    });
});

app.use("/api/projects", projectRoutes);

const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });
initWebSocket(wss);

async function start() {
    console.log("");
    console.log("+----------------------------------------------------------+");
    console.log("|                                                          |");
    console.log("|    COGNIRA -- Mission Control Server                     |");
    console.log("|    Dashboard + WebSocket + REST API                      |");
    console.log("|                                                          |");
    console.log("+----------------------------------------------------------+");
    console.log("");

    const provider = process.env.LLM_PROVIDER || "gemini";
    try {
        initLLM({
            provider,
            geminiApiKey: process.env.GEMINI_API_KEY,
            deepseekApiKey: process.env.DEEPSEEK_API_KEY,
        });
        console.log(`   [OK] LLM initialized (provider: ${provider})`);
    } catch (error) {
        console.warn(`   [WARN] LLM not available: ${error.message}`);
        console.warn("      Set API key in .env for full functionality");
    }

    server.listen(PORT, () => {
        console.log(`   [OK] REST API:    http://localhost:${PORT}/api`);
        console.log(`   [OK] WebSocket:   ws://localhost:${PORT}/ws`);
        console.log(`   [OK] Dashboard:   ${FRONTEND_URL}`);
        console.log("");
        console.log("   Waiting for dashboard connections...");
        console.log("");
    });
}

start().catch((error) => {
    console.error("   Server failed to start:", error);
    process.exit(1);
});

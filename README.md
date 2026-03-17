# Cognira

AI-Powered Multi-Agent Software Development System built with LangGraph + Gemini/DeepSeek.

Give it a software idea. It analyzes requirements, designs the architecture, creates a build plan, sets up a project workspace, and **writes the entire codebase** -- all autonomously, with a **real-time web dashboard** to watch every agent work live.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A Gemini API key ([get one free](https://aistudio.google.com/apikey)) or DeepSeek API key ([get one](https://platform.deepseek.com/api_keys))
- (Optional) Redis for state persistence: `docker run -d -p 6379:6379 redis:latest`

### 2. Setup

```bash
npm install
cd dashboard && npm install && cd ..

# Create your .env file
cp .env.example .env

# Edit .env and add your API key + choose your provider
```

### 3a. Run with Dashboard (Recommended)

Open **two terminals**:

```bash
# Terminal 1 — Start the server (Express + WebSocket)
npm run server

# Terminal 2 — Start the dashboard (React + Vite)
npm run dashboard
```

Then open **http://localhost:5173** in your browser. Type your requirement and click **LAUNCH**.

### 3b. Run via CLI (Terminal only)

```bash
# Pass requirement directly
node src/index.js "Build a todo app with categories and due dates"

# Interactive mode (will prompt you)
node src/index.js
```

### 4. What Happens

**Phase 1-3 (Planning):**
1. **PM Agent** analyzes your requirement, asks clarifying questions
2. **Architect Agent** designs entities, DB schema, API endpoints, frontend pages, folder structure (5 steps)
3. **Blueprint Validator** cross-checks the architecture for contradictions (zero LLM calls)
4. **Planner Agent** creates a phased build order with dependency tracking
5. **Sandbox** sets up a real project workspace with scaffold files

**Phase 4 (Dev Loop -- fully autonomous):**
6. **Select Next Task** picks the next task from the queue
7. **Context Builder** assembles smart context (3-tier dependency lookup, DB schema, patterns)
8. **Coder Agent** writes one file per LLM call (scaffold-aware, retry-aware)
9. **Update Registry** indexes new file exports for dependency tracking
10. **Reviewer Agent** static code review (max 2 rejection cycles)
11. **Executor Agent** cross-references imports, exports, conventions (no runtime needed)
12. **Snapshot Manager** creates Git snapshots after each successful task
13. **Debugger Agent** 3-tier escalation (fix -> broader context -> rollback)
14. **Human Escalation** lets you guide, skip, or simplify stuck tasks
15. **Simplify Task** breaks complex failures into sub-tasks
16. **Phase Verification** verifies files + auto-wires entry points (routes, pages)
17. **Pattern Extractor** distills code patterns to prevent style drift
18. **State Compactor** trims completed state to keep context lean
19. **Present to User** shows final project summary

---

## Dashboard

The web dashboard gives you a real-time view of the entire pipeline:

| Feature | Description |
|---------|-------------|
| **Pipeline Visualizer** | Horizontal phase blocks (PM → Architect → Planner → Dev Loop → Deploy) with live status dots |
| **Event Log** | Real-time scrolling log of every node execution with timestamps |
| **Output Tabs** | Spec, Blueprint, Tasks (with progress bar), Code, Result |
| **Human Input Panel** | PM asks questions → answer in browser. Debugger escalates → choose guide/skip/simplify |
| **Token Budget Bar** | Live cost tracking with color-coded progress (green → yellow → red) |
| **Status Pills** | RUNNING, AWAITING INPUT, COMPLETE, ERROR with abort/retry buttons |
| **WebSocket** | Every node update appears instantly — no polling |

```
Browser (localhost:5173)    Express Server (localhost:3000)    LangGraph Pipeline
        |                           |                              |
        |--POST /api/projects------>|                              |
        |                           |--graph.stream()------------->|
        |                           |                              |
        |--WS connect-------------->|                              |
        |<--node_complete-----------|<--yield {nodeName: data}-----|
        |<--task_progress-----------|                              |
        |<--human_input_needed------|                              |
        |--human_response---------->|--InputBridge.resolve()------>|
        |<--run_complete------------|                              |
```

---

## LLM Providers

Cognira supports two LLM backends. Set `LLM_PROVIDER` in your `.env`:

| Provider | Env Var | Model Default | Pricing |
|----------|---------|---------------|---------| 
| **Gemini** | `GEMINI_API_KEY` | `gemini-2.5-flash` | $0.15/1M in, $0.60/1M out |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | $0.14/1M in, $0.28/1M out |

```env
# Use Gemini (recommended -- more stable)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here

# Or use DeepSeek
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here

# Optional: server port and frontend URL
SERVER_PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Testing

```bash
# Graph skeleton test (no API key needed)
npm run test:graph

# Dev loop wiring test (no API key needed -- 14 assertions)
npm run test:devloop

# PM Agent with real LLM API
npm run test:pm

# Architect + Validator
npm run test:architect

# Planner Agent
npm run test:planner

# Sandbox Manager (no API key needed)
npm run test:sandbox

# All mock tests (graph + validator + sandbox + devloop)
npm run test:all:mock
```

---

## Project Structure

```
cognira/
├── src/                            # Core pipeline
│   ├── index.js                    # CLI entry point
│   ├── agents/
│   │   ├── pmAgent.js              # PM Agent -- requirement -> spec
│   │   ├── architectAgent.js       # Architect Agent -- spec -> blueprint (5 steps)
│   │   ├── blueprintValidator.js   # Cross-validates blueprint (no LLM)
│   │   ├── plannerAgent.js         # Planner Agent -- blueprint -> build order
│   │   ├── coderAgent.js           # Coder Agent -- one file per LLM call
│   │   ├── reviewerAgent.js        # Reviewer Agent -- static code review
│   │   ├── executorAgent.js        # Executor Agent -- cross-reference verification
│   │   └── debuggerAgent.js        # Debugger Agent -- 3-tier error escalation
│   ├── nodes/
│   │   ├── humanInput.js           # Terminal input for Q&A (CLI mode)
│   │   ├── setupSandbox.js         # Creates workspace + seeds registry
│   │   ├── sandboxHealthCheck.js   # Verifies sandbox -> starts dev loop
│   │   ├── selectNextTask.js       # Task queue foreman (zero LLM)
│   │   ├── contextBuilder.js       # Smart context builder (3-tier lookup)
│   │   ├── updateRegistry.js       # File interface registry updater
│   │   ├── snapshotManager.js      # Git snapshot after successful task
│   │   ├── simplifyTask.js         # Breaks failed tasks into sub-tasks
│   │   ├── humanEscalation.js      # Human intervention (guide/skip/simplify)
│   │   ├── phaseVerification.js    # Phase integrity check + assembly
│   │   ├── assembleEntryPoints.js  # Auto-wire routes + pages
│   │   ├── patternExtractor.js     # Code pattern extraction
│   │   ├── stateCompactor.js       # State trimmer (zero LLM)
│   │   ├── presentToUser.js        # Final project presentation
│   │   └── deploymentVerifier.js   # Docker deployment verifier
│   ├── config/
│   │   ├── state.js                # LangGraph state definition
│   │   └── graph.js                # LangGraph wiring (28 nodes)
│   └── utils/
│       ├── llm.js                  # Unified LLM provider (Gemini + DeepSeek)
│       ├── tokenTracker.js         # Token usage display
│       └── sandboxManager.js       # Sandbox operations + scaffold generation
├── server/                         # Web dashboard backend
│   ├── index.js                    # Express + WebSocket server (port 3000)
│   ├── routes/
│   │   └── projects.js             # REST API (/api/projects/*)
│   ├── services/
│   │   └── graphRunner.js          # LangGraph <-> WebSocket bridge + InputBridge
│   └── ws/
│       └── handler.js              # WebSocket connection handler
├── dashboard/                      # Web dashboard frontend
│   ├── src/
│   │   ├── App.jsx                 # Main dashboard layout
│   │   ├── index.css               # Industrial dark theme
│   │   ├── store/
│   │   │   └── projectStore.js     # Zustand global state
│   │   ├── hooks/
│   │   │   └── useWebSocket.js     # WS connection hook (auto-reconnect)
│   │   ├── lib/
│   │   │   └── api.js              # REST API client
│   │   └── components/
│   │       ├── PipelineVisualizer.jsx  # Live phase + node status display
│   │       ├── LogStream.jsx           # Real-time event log
│   │       ├── OutputPanel.jsx         # Tabbed output (Spec/Blueprint/Tasks/Code)
│   │       ├── HumanInputPanel.jsx     # PM Q&A + escalation UI
│   │       └── TokenBudgetBar.jsx      # Live cost tracker
│   ├── package.json                # React + Zustand + Vite
│   └── vite.config.js              # Dev server with API proxy
├── tests/
│   ├── test-graph-skeleton.js
│   ├── test-pm-agent.js
│   ├── test-architect.js
│   ├── test-planner.js
│   ├── test-validator.js
│   ├── test-sandbox.js
│   └── test-devloop.js             # Dev loop wiring test (14 assertions)
├── docs/
│   └── TECHNICAL.md                # Deep technical documentation
├── .env.example
├── .gitignore
└── package.json
```

---

## Architecture

```
START -> [PM Agent] <-> [Human Input]
              |
              v (spec ready)
        [Architect Step 1] -> [Step 2] -> [Step 3] -> [Step 4] -> [Step 5]
              |
              v
        [Blueprint Validator] -- (issues?) --> loops back to relevant step
              |
              v (valid)
        [Planner Agent]
              |
              v
        [Setup Sandbox] -> [Health Check]
              |
              v (healthy)
        [Select Next Task] <--+-----------------------------+
              |                |                             |
              v                |                             |
        [Context Builder] -> [Coder] -> [Registry] -> [Reviewer]
                                                         |
                                          approved       rejected (<=2)
                                            |              |
                                            v              +-> [Context Builder] (retry)
                                       [Executor]         rejected (3+)
                                         |    |            |
                                       pass  fail          +-> [Simplify Task] -> [Select Next]
                                         |    |
                                         v    v
                                    [Snapshot] [Debugger]
                                         |       |     |
                                         v    fix     tier 3
                                    [Compactor]  |      |
                                         |       v      v
                                         v  [Context] [Human Escalation]
                                    [Select Next]        |     |     |
                                                      guide  skip  simplify
              (all done)                                 |     |     |
              v                                          v     v     v
        [Phase Verification] -> [Pattern Extractor] -> [Compactor] -> [Select Next]
              ...
        [Present to User] -> END
```

All nodes communicate through a shared LangGraph state. No direct function calls between nodes. State is checkpointed after every node (Redis or in-memory).

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **One file per LLM call** | Prevents truncation, each response is small and complete |
| **Scaffold files are deterministic** | LLM only writes business logic, not boilerplate |
| **3-tier dependency lookup** | Exact match -> fuzzy match -> disk fallback |
| **File registry** | Coder always knows exact import statements |
| **Pattern extraction** | Prevents style drift across phases |
| **Git snapshots** | Debugger can rollback to last known good state |
| **Max 2 review cycles** | Then simplify task instead of infinite retries |
| **State compaction** | Keeps state lean as task count grows |
| **Multi-LLM** | Gemini or DeepSeek via unified `callLLM()` |
| **InputBridge pattern** | Graph nodes pause mid-execution, wait for WebSocket input from dashboard |
| **Zustand over Redux** | Zero boilerplate, works outside React (WebSocket hook updates store directly) |

---

## Documentation

For a deep technical breakdown of every component, data flow, state management, error handling, and design decisions, see [docs/TECHNICAL.md](docs/TECHNICAL.md).

---

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A Gemini API key ([get one free](https://aistudio.google.com/apikey)) or DeepSeek API key ([get one](https://platform.deepseek.com/api_keys))
- (Optional) Redis for state persistence: `docker run -d -p 6379:6379 redis:latest`
- (Optional) Docker for deployment verification

### 2. Setup

```bash
npm install

# Create your .env file
cp .env.example .env

# Edit .env and add your API key + choose your provider
```

### 3. Run

```bash
# Pass requirement directly
node src/index.js "Build a todo app with categories and due dates"

# Interactive mode (will prompt you)
node src/index.js
```

### 4. What Happens

**Phase 1-3 (Planning):**
1. **PM Agent** analyzes your requirement, asks clarifying questions
2. **Architect Agent** designs entities, DB schema, API endpoints, frontend pages, folder structure (5 steps)
3. **Blueprint Validator** cross-checks the architecture for contradictions (zero LLM calls)
4. **Planner Agent** creates a phased build order with dependency tracking
5. **Sandbox** sets up a real project workspace with scaffold files

**Phase 4 (Dev Loop -- fully autonomous):**
6. **Select Next Task** picks the next task from the queue
7. **Context Builder** assembles smart context (3-tier dependency lookup, DB schema, patterns)
8. **Coder Agent** writes one file per LLM call (scaffold-aware, retry-aware)
9. **Update Registry** indexes new file exports for dependency tracking
10. **Reviewer Agent** static code review (max 2 rejection cycles)
11. **Executor Agent** cross-references imports, exports, conventions (no runtime needed)
12. **Snapshot Manager** creates Git snapshots after each successful task
13. **Debugger Agent** 3-tier escalation (fix -> broader context -> rollback)
14. **Human Escalation** lets you guide, skip, or simplify stuck tasks
15. **Simplify Task** breaks complex failures into sub-tasks
16. **Phase Verification** verifies files + auto-wires entry points (routes, pages)
17. **Pattern Extractor** distills code patterns to prevent style drift
18. **State Compactor** trims completed state to keep context lean
19. **Present to User** shows final project summary

---

## LLM Providers

Cognira supports two LLM backends. Set `LLM_PROVIDER` in your `.env`:

| Provider | Env Var | Model Default | Pricing |
|----------|---------|---------------|---------|
| **Gemini** | `GEMINI_API_KEY` | `gemini-2.5-flash` | $0.15/1M in, $0.60/1M out |
| **DeepSeek** | `DEEPSEEK_API_KEY` | `deepseek-chat` | $0.14/1M in, $0.28/1M out |

```env
# Use Gemini (default)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_key_here

# Or use DeepSeek
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_key_here
```

---

## Testing

```bash
# Graph skeleton test (no API key needed)
npm run test:graph

# Dev loop wiring test (no API key needed -- 14 assertions)
npm run test:devloop

# PM Agent with real LLM API
npm run test:pm

# Architect + Validator
npm run test:architect

# Planner Agent
npm run test:planner

# Sandbox Manager (no API key needed)
npm run test:sandbox

# All mock tests (graph + validator + sandbox + devloop)
npm run test:all:mock
```

---

## Project Structure

```
cognira/
├── src/
│   ├── index.js                    # Main entry point (CLI)
│   ├── agents/
│   │   ├── pmAgent.js              # PM Agent -- requirement -> spec
│   │   ├── architectAgent.js       # Architect Agent -- spec -> blueprint (5 steps)
│   │   ├── blueprintValidator.js   # Cross-validates blueprint (no LLM)
│   │   ├── plannerAgent.js         # Planner Agent -- blueprint -> build order
│   │   ├── coderAgent.js           # Coder Agent -- one file per LLM call
│   │   ├── reviewerAgent.js        # Reviewer Agent -- static code review
│   │   ├── executorAgent.js        # Executor Agent -- cross-reference verification
│   │   └── debuggerAgent.js        # Debugger Agent -- 3-tier error escalation
│   ├── nodes/
│   │   ├── humanInput.js           # Terminal input for Q&A
│   │   ├── setupSandbox.js         # Creates workspace + seeds registry
│   │   ├── sandboxHealthCheck.js   # Verifies sandbox -> starts dev loop
│   │   ├── selectNextTask.js       # Task queue foreman (zero LLM)
│   │   ├── contextBuilder.js       # Smart context builder (3-tier lookup)
│   │   ├── updateRegistry.js       # File interface registry updater
│   │   ├── snapshotManager.js      # Git snapshot after successful task
│   │   ├── simplifyTask.js         # Breaks failed tasks into sub-tasks
│   │   ├── humanEscalation.js      # Human intervention (guide/skip/simplify)
│   │   ├── phaseVerification.js    # Phase integrity check + assembly
│   │   ├── assembleEntryPoints.js  # Auto-wire routes + pages
│   │   ├── patternExtractor.js     # Code pattern extraction
│   │   ├── stateCompactor.js       # State trimmer (zero LLM)
│   │   ├── presentToUser.js        # Final project presentation
│   │   └── deploymentVerifier.js   # Docker deployment verifier
│   ├── config/
│   │   ├── state.js                # LangGraph state definition
│   │   └── graph.js                # LangGraph wiring (28 nodes)
│   └── utils/
│       ├── llm.js                  # Unified LLM provider (Gemini + DeepSeek)
│       ├── tokenTracker.js         # Token usage display
│       └── sandboxManager.js       # Sandbox operations + scaffold generation
├── tests/
│   ├── test-graph-skeleton.js
│   ├── test-pm-agent.js
│   ├── test-architect.js
│   ├── test-planner.js
│   ├── test-validator.js
│   ├── test-sandbox.js
│   └── test-devloop.js             # Dev loop wiring test (14 assertions)
├── docs/
│   └── TECHNICAL.md                # Deep technical documentation
├── .env.example
├── .gitignore
└── package.json
```

---

## Architecture

```
START -> [PM Agent] <-> [Human Input]
              |
              v (spec ready)
        [Architect Step 1] -> [Step 2] -> [Step 3] -> [Step 4] -> [Step 5]
              |
              v
        [Blueprint Validator] -- (issues?) --> loops back to relevant step
              |
              v (valid)
        [Planner Agent]
              |
              v
        [Setup Sandbox] -> [Health Check]
              |
              v (healthy)
        [Select Next Task] <--+-----------------------------+
              |                |                             |
              v                |                             |
        [Context Builder] -> [Coder] -> [Registry] -> [Reviewer]
                                                         |
                                          approved       rejected (<=2)
                                            |              |
                                            v              +-> [Context Builder] (retry)
                                       [Executor]         rejected (3+)
                                         |    |            |
                                       pass  fail          +-> [Simplify Task] -> [Select Next]
                                         |    |
                                         v    v
                                    [Snapshot] [Debugger]
                                         |       |     |
                                         v    fix     tier 3
                                    [Compactor]  |      |
                                         |       v      v
                                         v  [Context] [Human Escalation]
                                    [Select Next]        |     |     |
                                                       guide  skip  simplify
              (all done)                                 |     |     |
              v                                          v     v     v
        [Phase Verification] -> [Pattern Extractor] -> [Compactor] -> [Select Next]
              ...
        [Present to User] -> END
```

All nodes communicate through a shared LangGraph state. No direct function calls between nodes. State is checkpointed after every node (Redis or in-memory).

---

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **One file per LLM call** | Prevents truncation, each response is small and complete |
| **Scaffold files are deterministic** | LLM only writes business logic, not boilerplate |
| **3-tier dependency lookup** | Exact match -> fuzzy match -> disk fallback |
| **File registry** | Coder always knows exact import statements |
| **Pattern extraction** | Prevents style drift across phases |
| **Git snapshots** | Debugger can rollback to last known good state |
| **Max 2 review cycles** | Then simplify task instead of infinite retries |
| **State compaction** | Keeps state lean as task count grows |
| **Multi-LLM** | Gemini or DeepSeek via unified `callLLM()` |

---

## Documentation

For a deep technical breakdown of every component, data flow, state management, error handling, and design decisions, see [docs/TECHNICAL.md](docs/TECHNICAL.md).

# Cognira - Complete Technical Documentation

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Project Structure](#2-project-structure)
3. [Architecture & Design Principles](#3-architecture--design-principles)
4. [Application Entry Point](#4-application-entry-point)
5. [Execution Flow](#5-execution-flow)
6. [Core Components](#6-core-components)
7. [State Management](#7-state-management)
8. [Agent Details](#8-agent-details)
9. [Utility Systems](#9-utility-systems)
10. [Data Flow](#10-data-flow)
11. [Configuration & Dependencies](#11-configuration--dependencies)
12. [Error Handling & Edge Cases](#12-error-handling--edge-cases)
13. [Testing](#13-testing)
14. [Performance Considerations](#14-performance-considerations)
15. [Phase 4 Dev Loop Reference](#15-phase-4-dev-loop-reference)
16. [Dashboard (Phase 5)](#16-dashboard-phase-5)

---

## 1. System Overview

### What is Cognira?

Cognira is an autonomous multi-agent system that transforms a software requirement into a complete, working application. It uses LangGraph (a state machine framework) and LLM APIs (Gemini or DeepSeek) to orchestrate multiple specialized AI agents that work together like a real development team.

### Current Implementation: Phase 4 (Full Dev Loop)

- **Phase 1**: PM Agent - Converts vague requirements into detailed specifications
- **Phase 2**: Architect Agent - Designs database schema, APIs, and frontend structure
- **Phase 3**: Planner Agent - Creates an ordered build plan and sets up a sandbox workspace
- **Phase 4**: Dev Loop - Coder + Reviewer + Executor + Debugger with autonomous code generation

### Technology Stack

- **Runtime**: Node.js 18+ (ES Modules)
- **AI Framework**: LangGraph v1.2.0 (state machine orchestration)
- **LLM**: Google Gemini 2.5 Flash or DeepSeek V3 (configurable)
- **State Persistence**: Redis (optional) or in-memory
- **Language**: JavaScript (ES6+)

---

## 2. Project Structure

```
cognira/
├── src/                            # Core LangGraph pipeline
│   ├── index.js                    # CLI entry point
│   ├── agents/
│   │   ├── pmAgent.js              # Project Manager Agent
│   │   ├── architectAgent.js       # Architect Agent (5 steps)
│   │   ├── blueprintValidator.js   # Blueprint validation (no LLM)
│   │   ├── plannerAgent.js         # Planner Agent
│   │   ├── coderAgent.js           # Coder Agent (one file per LLM call)
│   │   ├── reviewerAgent.js        # Reviewer Agent (static review)
│   │   ├── executorAgent.js        # Executor Agent (import cross-check)
│   │   └── debuggerAgent.js        # Debugger Agent (3-tier escalation)
│   ├── nodes/
│   │   ├── humanInput.js           # Terminal input handler (CLI mode)
│   │   ├── setupSandbox.js         # Sandbox creation + scaffold seeding
│   │   ├── sandboxHealthCheck.js   # Sandbox verification
│   │   ├── selectNextTask.js       # Task queue foreman (zero LLM)
│   │   ├── contextBuilder.js       # Smart context builder (3-tier lookup)
│   │   ├── updateRegistry.js       # File interface registry updater
│   │   ├── snapshotManager.js      # Git snapshot after each task
│   │   ├── simplifyTask.js         # Breaks failed tasks into sub-tasks
│   │   ├── humanEscalation.js      # Human intervention node
│   │   ├── phaseVerification.js    # Phase integrity + assembly trigger
│   │   ├── assembleEntryPoints.js  # Auto-wire routes + pages
│   │   ├── patternExtractor.js     # Code pattern extraction
│   │   ├── stateCompactor.js       # State trimmer (zero LLM)
│   │   ├── presentToUser.js        # Final project summary
│   │   └── deploymentVerifier.js   # Docker deployment verifier
│   ├── config/
│   │   ├── state.js                # Complete LangGraph state definition
│   │   └── graph.js                # LangGraph wiring (28 nodes)
│   └── utils/
│       ├── llm.js                  # Unified LLM provider (Gemini + DeepSeek)
│       ├── tokenTracker.js         # Token usage tracking
│       └── sandboxManager.js       # Sandbox filesystem operations
├── server/                         # Web dashboard backend
│   ├── index.js                    # Express + WebSocket server (port 3000)
│   ├── routes/
│   │   └── projects.js             # REST API: /api/projects/*
│   ├── services/
│   │   └── graphRunner.js          # LangGraph <-> WebSocket bridge + InputBridge
│   └── ws/
│       └── handler.js              # WebSocket connection handler
├── dashboard/                      # Web dashboard frontend (React + Vite)
│   ├── src/
│   │   ├── App.jsx                 # Main layout
│   │   ├── index.css               # Industrial dark theme
│   │   ├── store/projectStore.js   # Zustand global state
│   │   ├── hooks/useWebSocket.js   # WS hook with auto-reconnect
│   │   ├── lib/api.js              # Fetch wrapper for REST endpoints
│   │   └── components/
│   │       ├── PipelineVisualizer.jsx
│   │       ├── LogStream.jsx
│   │       ├── OutputPanel.jsx
│   │       ├── HumanInputPanel.jsx
│   │       └── TokenBudgetBar.jsx
│   ├── package.json
│   └── vite.config.js
├── tests/
├── docs/
│   └── TECHNICAL.md                # This file
├── package.json
├── .env.example
└── README.md
```

### File Responsibilities

| File | Purpose | LLM Calls |
|------|---------|-----------|
| `index.js` | Entry point, CLI handling, output formatting | No |
| `pmAgent.js` | Requirement clarification & spec generation | Yes (1-2) |
| `architectAgent.js` | 5-step architecture design | Yes (5) |
| `blueprintValidator.js` | Cross-validation of architecture | No |
| `plannerAgent.js` | Build plan generation | Yes (1) |
| `humanInput.js` | User Q&A via terminal | No |
| `setupSandbox.js` | Create project workspace | No |
| `sandboxHealthCheck.js` | Verify sandbox integrity | No |
| `state.js` | State schema definition | No |
| `graph.js` | LangGraph node wiring | No |
| `llm.js` | Unified LLM calls & token tracking | No |
| `tokenTracker.js` | Token usage display | No |
| `sandboxManager.js` | Filesystem operations | No |

---

## 3. Architecture & Design Principles

### State Machine Architecture

The system is built on LangGraph, which models workflows as directed graphs where:

1. **Nodes** = Functions that perform work (agents, validators, I/O)
2. **Edges** = Transitions between nodes (conditional or direct)
3. **State** = Shared data structure that ALL nodes read from and write to
4. **Checkpointing** = Automatic state persistence after each node

### Key Design Decisions

#### 1. No Direct Function Calls Between Nodes

```javascript
// WRONG: Direct coupling
function nodeA() {
  const result = nodeB();
  return result;
}

// CORRECT: State-based communication
function nodeA(state) {
  return { dataForB: "value" };
}

function nodeB(state) {
  const data = state.dataForB;
  return { result: "processed" };
}
```

Why? Checkpointing requires serializable state. Direct function calls can't be saved/resumed.

#### 2. Token Tracking via Deltas

```javascript
// WRONG: Mutating shared object (causes duplication)
function agent(state) {
  state.tokenUsage.calls.push(newCall);
  return state.tokenUsage;
}

// CORRECT: Return delta, let reducer merge
function agent(state) {
  return {
    tokenUsage: {
      newCalls: [newCall],
      addedInput: 100,
      addedOutput: 200,
      addedCost: 0.0001
    }
  };
}
```

Why? LangGraph reducers merge old + new state. Returning full objects causes exponential duplication.

#### 3. Deterministic Validation (No LLM)

The Blueprint Validator uses pure JavaScript logic instead of LLM calls because:
- Validation is deterministic (checking if table X exists)
- 100% accurate vs. LLM's probabilistic nature
- Zero tokens spent
- Instant execution

#### 4. Sandbox Isolation

All generated code lives in an isolated sandbox:
- Prevents AI from modifying system files
- Enables git-based snapshots and rollbacks
- Prepares for Docker containerization in Phase 4

---

## 4. Application Entry Point

### File: `src/index.js`

### Initialization Sequence

```javascript
async function main() {
  printBanner();

  // Step 1: Initialize LLM (Gemini or DeepSeek)
  initLLM({
    provider: process.env.LLM_PROVIDER || "gemini",
    geminiApiKey: process.env.GEMINI_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  });

  // Step 2: Create checkpointer (Redis or in-memory)
  const checkpointer = await createCheckpointer();

  // Step 3: Build the LangGraph
  const graph = buildGraph({ checkpointer });

  // Step 4: Get user requirement
  let requirement = process.argv.slice(2).join(" ");
  if (!requirement) {
    requirement = await askUser("Your idea: ");
  }

  // Step 5: Run the graph
  const finalState = await graph.invoke({
    userRequirement: requirement,
    tokenBudget: 2.0
  }, config);

  // Step 6: Display results
  printSpec(finalState.clarifiedSpec);
  printBlueprint(finalState.blueprint);
  printTokenSummary(finalState.tokenUsage);
}
```

### Command-Line Interface

```bash
# Pass requirement as argument
node src/index.js "Build a todo app with categories"

# Interactive prompt
node src/index.js
```

---

## 5. Execution Flow

### Flow Diagram

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
        [Setup Sandbox] -> [Health Check] -> END
```

### Step-by-Step

1. **PM Agent** analyzes the requirement
   - If ambiguous -> asks 3-8 clarifying questions -> routes to Human Input
   - If clear -> generates spec -> routes to Architect
2. **Human Input** collects user answers, routes back to PM Agent
3. **Architect Steps 1-5** progressively build the blueprint:
   - Step 1: Entities & relationships
   - Step 2: Database schema
   - Step 3: API endpoints
   - Step 4: Frontend pages
   - Step 5: Folder structure & dependencies
4. **Blueprint Validator** cross-checks for consistency (no LLM)
   - Valid -> proceed to Planner
   - Invalid -> route back to relevant Architect step (max 2 cycles)
5. **Planner Agent** creates phased build order with dependency tracking
6. **Setup Sandbox** creates isolated project workspace with git
7. **Health Check** verifies sandbox integrity

---

## 6. Core Components

### LangGraph State Machine (graph.js)

```javascript
export function buildGraph(options = {}) {
  const graph = new StateGraph(AgentState);

  // Add all nodes
  graph.addNode("pmAgent", pmAgentNode);
  graph.addNode("humanInput", humanInputNode);
  graph.addNode("architectStep1", architectStep1Node);
  // ... etc

  // PM routing
  graph.addEdge(START, "pmAgent");
  graph.addConditionalEdges("pmAgent", (state) => {
    if (state.pmStatus === "needs_clarification") return "humanInput";
    if (state.pmStatus === "spec_ready") return "architectStep1";
    return END;
  });

  // Architect chain
  graph.addEdge("architectStep1", "architectStep2");
  // ... sequential edges

  // Validator routing (can loop back)
  graph.addConditionalEdges("blueprintValidator", blueprintValidatorRouter, {
    __end__: "plannerAgent",
    architectStep2: "architectStep2",
    architectStep3: "architectStep3",
    architectStep4: "architectStep4"
  });

  return graph.compile({ checkpointer });
}
```

### Checkpointing

- **Redis**: State persists across restarts, enables resume after crashes
- **In-Memory**: Default, no setup needed, lost on exit

---

## 7. State Management

### Reducer Patterns

**Last Write Wins** (simple values):
```javascript
userRequirement: Annotation({
  reducer: (_, y) => y ?? "",
  default: () => ""
})
```

**Array Accumulation**:
```javascript
pmConversation: Annotation({
  reducer: (existing, incoming) => {
    if (!incoming) return existing;
    return [...existing, ...incoming];
  },
  default: () => []
})
```

**Object Merging**:
```javascript
blueprint: Annotation({
  reducer: (existing, incoming) => {
    if (!incoming) return existing;
    return { ...existing, ...incoming };
  },
  default: () => ({ entities: [], dbSchema: {} })
})
```

**Delta Accumulation** (token tracking):
```javascript
tokenUsage: Annotation({
  reducer: (existing, incoming) => {
    if (!incoming) return existing;
    return {
      calls: [...existing.calls, ...incoming.newCalls],
      totalInput: existing.totalInput + incoming.addedInput,
      totalOutput: existing.totalOutput + incoming.addedOutput,
      estimatedCost: existing.estimatedCost + incoming.addedCost
    };
  }
})
```

---

## 8. Agent Details

### PM Agent (pmAgent.js)

- **Role**: Convert vague requirements into detailed specifications
- **LLM Calls**: 1-2 (1 if clear, 2 if Q&A needed)
- **Input**: `state.userRequirement`, `state.pmConversation`
- **Output**: `pmStatus`, `pmQuestions`, `clarifiedSpec`, `tokenUsage`

### Architect Agent (architectAgent.js)

- **Role**: Design complete system architecture in 5 steps
- **LLM Calls**: 5 (one per step)
- **Steps**: Entities -> DB Schema -> API Endpoints -> Frontend Pages -> Folder Structure
- **Key Feature**: Each step can be re-run independently if validator finds issues

### Blueprint Validator (blueprintValidator.js)

- **Role**: Cross-validate architecture for consistency
- **LLM Calls**: 0 (pure JavaScript logic)
- **Checks**: Entity-table mapping, FK integrity, API-table mapping, page-API mapping, auth consistency
- **Max Cycles**: 2 (force proceeds after)

### Planner Agent (plannerAgent.js)

- **Role**: Create ordered build plan with dependency tracking
- **LLM Calls**: 1
- **Output**: Phased task queue with filesToCreate, filesNeeded, canParallelize flags

---

## 9. Utility Systems

### Unified LLM Provider (llm.js)

Supports both Gemini and DeepSeek through an adapter pattern:

- **Budget Enforcement**: Throws error if cost exceeds TOKEN_BUDGET
- **Automatic Retries**: 3 attempts with exponential backoff
- **JSON Parsing**: Handles markdown code blocks
- **Token Tracking**: Uses API metadata or estimates
- **Provider Agnostic**: Agents call `callLLM()` without knowing which provider

### Sandbox Manager (sandboxManager.js)

- **createSandbox()**: Creates isolated project workspace with git
- **healthCheck()**: Verifies directories, package.json, git status
- **writeFile() / readFile()**: Safe filesystem operations
- **snapshot() / rollback()**: Git-based versioning
- **executeCommand()**: Run shell commands in sandbox
- **destroySandbox()**: Clean up workspace

---

## 10. Data Flow

### State Transitions Summary

```
Initial -> PM Agent adds: pmStatus, pmQuestions/clarifiedSpec, tokenUsage
        -> Architect adds: blueprint.entities, dbSchema, apiEndpoints, frontendPages, folderStructure
        -> Validator adds: blueprintValidation.isValid, issues
        -> Planner adds: taskQueue with phased tasks
        -> Sandbox adds: sandboxId, sandboxHealthy
```

### Token Usage (Typical Run)

| Agent | Calls | Tokens | Cost |
|-------|-------|--------|------|
| PM Agent | 1-2 | 400-800 | ~$0.0005 |
| Architect (5 steps) | 5 | 3000-5000 | ~$0.0040 |
| Planner | 1 | 1000-2000 | ~$0.0025 |
| **Total** | **7-8** | **5000-8000** | **$0.004-0.007** |

---

## 11. Configuration & Dependencies

### Environment Variables

```env
# Required (one of these)
GEMINI_API_KEY=your_key_here
DEEPSEEK_API_KEY=your_key_here

# Provider selection
LLM_PROVIDER=gemini          # or "deepseek"

# Optional
GEMINI_MODEL=gemini-2.5-flash
DEEPSEEK_MODEL=deepseek-chat
TOKEN_BUDGET=2.0
REDIS_URL=redis://localhost:6379
DEBUG=true
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| @langchain/langgraph | ^1.2.0 | State machine framework |
| @google/genai | ^1.43.0 | Gemini API client |
| openai | ^4.80.0 | DeepSeek API client (OpenAI-compatible) |
| dotenv | ^16.4.7 | Environment variable loader |
| readline | ^1.3.0 | Terminal I/O |

---

## 12. Error Handling & Edge Cases

| Error | Cause | Handling |
|-------|-------|---------|
| TOKEN_BUDGET_EXCEEDED | Cost exceeds limit | Fails fast with user message |
| API timeout | Network/rate limiting | 3 retries with exponential backoff |
| JSON parse failure | LLM returns invalid JSON | Strip markdown, retry |
| Validation loop | Architect can't fix issues | Force proceed after 2 cycles |
| Sandbox ENOSPC | Disk full | Clear error message |
| Missing API key | No .env | Clear setup instructions |

---

## 13. Testing

```bash
# Mock tests (no API key needed)
node tests/test-graph-skeleton.js    # Graph wiring (20 assertions)
node tests/test-validator.js         # Blueprint validation (11 assertions)
node tests/test-sandbox.js           # Sandbox operations (16 assertions)
node tests/test-devloop.js           # Dev loop wiring (14 assertions)

# Real API tests (requires API key in .env)
node tests/test-pm-agent.js
node tests/test-architect.js
node tests/test-planner.js

# All mock tests at once
npm run test:all:mock
```

---

## 14. Performance

| Phase | Duration | Bottleneck |
|-------|----------|------------|
| PM Agent (1-2 calls) | 5-12s | LLM API latency |
| Architect (5 steps) | 15-30s | LLM API latency |
| Validator | <1s | Pure JS |
| Planner | 3-8s | LLM API latency |
| Sandbox Setup | 1-2s | Filesystem I/O |
| Dev Loop (per task) | 10-30s | LLM calls (coder + reviewer + registry) |
| **Total (small app)** | **2-5 min** | |
| **Total (medium app)** | **5-15 min** | |

---

## 15. Phase 4: Dev Loop Architecture

### 15.1 New Agents

| Agent | LLM Calls | Purpose |
|-------|-----------|----------|
| **Coder Agent** | 1 per file | Writes code. ONE file per LLM call to prevent truncation. Scaffold-aware (won't overwrite db.js, auth.js). |
| **Reviewer Agent** | 1 per cycle | Static code review. Checks imports, exports, async/await, response format, auth patterns. Max 2 rejection cycles. |
| **Executor Agent** | 0 | Cross-reference verification. Checks file existence, import resolution, convention compliance. No runtime needed. |
| **Debugger Agent** | 1 per attempt | 3-tier escalation: Tier 1 (failing files), Tier 2 (broader context), Tier 2.5 (rollback), Tier 3 (human). |

### 15.2 New Nodes (Zero LLM)

| Node | Purpose |
|------|---------|
| **Select Next Task** | Queue foreman. Picks next pending task, routes to context builder or phase verification. |
| **Context Builder** | Assembles smart context for the coder. 3-tier dependency lookup (exact -> fuzzy -> disk). Auto-includes models for routes, api util for pages. |
| **Update Registry** | Indexes file exports so future files know exactly how to import them. |
| **Snapshot Manager** | Git commit + tag after each successful task. Creates rollback points. |
| **Simplify Task** | LLM call to break a failed task into 2-3 simpler sub-tasks. |
| **Human Escalation** | Three options: provide guidance, skip task, or simplify. |
| **Phase Verification** | Checks all expected files exist. Triggers entry point assembly. |
| **Assemble Entry Points** | Auto-wires backend routes into index.js and frontend pages into App.jsx from the registry. Zero LLM. |
| **Pattern Extractor** | Reads code and distills patterns (error handling, naming, imports) to prevent style drift. |
| **State Compactor** | Trims completed task data to keep state within context window limits. |
| **Present to User** | Final project summary with file list, task status, and deployment instructions. |
| **Deployment Verifier** | Generates Dockerfiles, nginx config, docker-compose.yml. Optionally builds and tests. |

### 15.3 Dev Loop Flow

```
Task Queue: [t1, t2, t3, ...]

For each task:
  1. selectNextTask    -- pick next pending task
  2. contextBuilder    -- assemble dependencies, schema, patterns
  3. coderAgent        -- write files (1 LLM call per file)
  4. updateRegistry    -- index exports (1 LLM call)
  5. reviewerAgent     -- review code (1 LLM call)
       |-> rejected: retry from step 2 (max 2 cycles)
       |-> 3+ rejects: simplifyTask -> back to step 1
  6. executorAgent     -- cross-reference check (0 LLM calls)
       |-> fail: debuggerAgent -> retry or escalate
  7. snapshotManager   -- git commit + tag
  8. stateCompactor    -- trim state
  9. back to step 1

After all tasks in a phase:
  phaseVerification -> assembleEntryPoints -> patternExtractor

After all phases:
  presentToUser -> END
```

### 15.4 Error Recovery Paths

| Situation | Recovery |
|-----------|---------|
| Reviewer rejects (1-2x) | Fresh context + retry with issues as feedback |
| Reviewer rejects (3x) | Simplify task into sub-tasks |
| Executor fails | Debugger Tier 1: read failing files |
| Debugger fails (3x) | Tier 2: read MORE project files |
| Debugger Tier 2 fails | Tier 2.5: rollback to last good git tag |
| Rollback fails | Human escalation: guide / skip / simplify |
| LLM call fails | safeCallLLM catches error, returns {ok: false} |
| Token budget exceeded | Hard stop, preserves partial progress |

---

## 16. Dashboard (Phase 5)

The web dashboard provides a real-time GUI on top of the LangGraph pipeline.

### Architecture

```
Browser (localhost:5173)   Express Server (localhost:3000)   LangGraph
        |                          |                              |
        |--POST /api/projects----->|                              |
        |                          |--graph.stream()------------->|
        |--WS connect ------------>|                              |
        |<--node_complete----------|<--yield {nodeName: data}-----|
        |<--human_input_needed-----|                              |
        |--human_response--------->|--InputBridge.resolve()------>|
        |<--run_complete-----------|                              |
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Express Server | `server/index.js` | HTTP + WebSocket server on port 3000 |
| REST Routes | `server/routes/projects.js` | Start, list, resume, cancel, sandbox file access |
| Graph Runner | `server/services/graphRunner.js` | Runs `graph.stream()`, pipes events to WebSocket |
| InputBridge | inside graphRunner.js | Promise-based pause/resume for human-in-the-loop |
| WS Handler | `server/ws/handler.js` | Client registry, message routing (human_response, cancel, ping) |
| Zustand Store | `dashboard/src/store/projectStore.js` | Central state: pipeline phases, events, outputs, token usage |
| useWebSocket | `dashboard/src/hooks/useWebSocket.js` | WS connection with auto-reconnect (5 attempts) |
| PipelineVisualizer | `dashboard/src/components/` | Horizontal phase blocks with animated node dots |
| LogStream | `dashboard/src/components/` | Auto-scrolling real-time event log |
| OutputPanel | `dashboard/src/components/` | Tabbed view: Spec / Blueprint / Tasks / Code / Result |
| HumanInputPanel | `dashboard/src/components/` | PM Q&A form + escalation decision UI |
| TokenBudgetBar | `dashboard/src/components/` | Live cost/budget progress bar |

### InputBridge Pattern

The key challenge: LangGraph nodes run synchronously inside `graph.stream()`, but human input arrives asynchronously from the browser. The `InputBridge` class solves this with a Promise:

```javascript
// Node calls this -- suspends the stream
const answer = await inputBridge.waitForInput("pm_clarification", { questions });

// WebSocket receives user response -- resumes the stream
inputBridge.provideInput(data); // resolves the Promise above
```

### WebSocket Event Protocol

| Event (Server → Client) | Payload |
|-------------------------|---------|
| `node_complete` | `{ node, data }` |
| `phase_change` | `{ phase }` |
| `spec_ready` | `{ spec }` |
| `blueprint_update` | `{ blueprint }` |
| `taskqueue_ready` | `{ taskQueue }` |
| `task_started` | `{ task }` |
| `task_progress` | `{ statuses }` |
| `code_written` | `{ files }` |
| `review_result` | `{ review }` |
| `human_input_needed` | `{ inputType, questions, task, error }` |
| `token_update` | `{ usage }` |
| `run_complete` | `{ finalState }` |
| `error` | `{ message, recoverable }` |

| Event (Client → Server) | Payload |
|-------------------------|---------|
| `human_response` | `{ data }` |
| `cancel` | — |
| `ping` | — |

### Running the Dashboard

```bash
# Terminal 1
npm run server        # Starts Express + WS on port 3000

# Terminal 2
npm run dashboard     # Starts Vite dev server on port 5173

# Then open http://localhost:5173
```

---

## 17. Roadmap

| Phase | What Gets Added |
|-------|----------------|
| Phase 6 | Parallel Task Execution (multiple coders at once) |
| Phase 7 | Docker Runtime Testing (actually run the generated code) |
| Phase 8 | User Feedback Loop (iterate on generated code in browser) |

---

**Document Version**: 3.0
**Last Updated**: Phase 5 — Dashboard Implementation

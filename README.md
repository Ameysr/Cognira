# Cognira

AI-Powered Multi-Agent Software Development System built with LangGraph + Gemini/DeepSeek.

Give it a software idea. It analyzes requirements, designs the architecture, creates a build plan, and sets up a project workspace -- all autonomously.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+ installed
- A Gemini API key ([get one free](https://aistudio.google.com/apikey)) or DeepSeek API key ([get one](https://platform.deepseek.com/api_keys))
- (Optional) Redis for state persistence: `docker run -d -p 6379:6379 redis:latest`

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

1. **PM Agent** analyzes your requirement
2. If ambiguous, asks you 3-8 clarifying questions
3. You answer in the terminal
4. PM Agent generates a structured project specification
5. **Architect Agent** designs entities, DB schema, API endpoints, frontend pages, folder structure (5 steps)
6. **Blueprint Validator** cross-checks the architecture for contradictions (zero LLM calls)
7. **Planner Agent** creates a phased build order with dependency tracking
8. **Sandbox** sets up a real project workspace on disk
9. Token usage summary displayed

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
# Graph skeleton test (no API key needed - all mocked)
npm run test:graph

# PM Agent with real LLM API
npm run test:pm

# Architect + Validator
npm run test:architect

# Planner Agent
npm run test:planner

# Sandbox Manager (no API key needed)
npm run test:sandbox

# All mock tests
npm run test:all:mock
```

---

## Project Structure

```
cognira/
├── src/
│   ├── index.js              # Main entry point (CLI)
│   ├── agents/
│   │   ├── pmAgent.js        # PM Agent -- requirement -> spec
│   │   ├── architectAgent.js # Architect Agent -- spec -> blueprint (5 steps)
│   │   ├── blueprintValidator.js  # Cross-validates blueprint (no LLM)
│   │   └── plannerAgent.js   # Planner Agent -- blueprint -> build order
│   ├── nodes/
│   │   ├── humanInput.js     # Terminal input for Q&A
│   │   ├── setupSandbox.js   # Creates project workspace
│   │   └── sandboxHealthCheck.js  # Verifies sandbox health
│   ├── config/
│   │   ├── state.js          # LangGraph state definition
│   │   └── graph.js          # LangGraph wiring + checkpointer
│   └── utils/
│       ├── llm.js            # Unified LLM provider (Gemini + DeepSeek)
│       ├── tokenTracker.js   # Token usage display
│       └── sandboxManager.js # Sandbox filesystem operations
├── tests/
│   ├── test-graph-skeleton.js
│   ├── test-pm-agent.js
│   ├── test-architect.js
│   ├── test-planner.js
│   ├── test-validator.js
│   └── test-sandbox.js
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
        [Setup Sandbox] -> [Health Check] -> END
```

All nodes communicate through a shared LangGraph state. No direct function calls between nodes. State is checkpointed after every node (Redis or in-memory).

---

## Roadmap

| Phase | What Gets Added |
|-------|----------------|
| Phase 4 | Context Builder + Coder Agent + Registry + Snapshots |
| Phase 5 | Reviewer + SimplifyTask + Executor + Debugger |
| Phase 6 | Feedback Loop + Deploy Agent + Token Budget |
| Phase 7 | React Frontend Dashboard |

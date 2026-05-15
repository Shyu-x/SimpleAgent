# SimpleAgent

A modern AI conversation platform built with React 19, Next.js 16, Zustand 5, and Express.

## License

Copyright (c) 2025-2026 SimpleAgent Contributors

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

## Project Overview

SimpleAgent is a full-stack AI conversation application that demonstrates modern AI application architecture and engineering practices.

Core Features:
- SSE streaming responses with typewriter effect
- MiniMax Token Plan API integration (M2.7, VL-01, image-01)
- Intent detection and clarification
- ReAct-based Agent engine with tool calling
- RAG knowledge base with hybrid search (vector + keyword)
- Session memory management with sliding window
- Multi-agent collaboration via A2A protocol
- HITL (Human-In-The-Loop) confirmation system
- Enterprise admin dashboard

## Architecture

```
+------------------------------------------------------------------+
|                         Frontend (Port 3001)                        |
|   React 19 + Next.js 16 + Zustand 5 + TypeScript                 |
+------------------------------------------------------------------+
                              SSE
+------------------------------------------------------------------+
|                         Backend (Port 30000)                        |
|   Node.js + Express + Layered Architecture                        |
+------------------------------------------------------------------+
                              API
+------------------------------------------------------------------+
|                      MiniMax API (External)                       |
|   M2.7 / VL-01 / image-01                                        |
+------------------------------------------------------------------+
```

### Backend Architecture (Layered)

```
backend/src/
├── application/     # Application orchestration
├── domain/          # Core business logic (model/rag/agent/search)
├── infra/           # Infrastructure (metrics/alert/config/queue)
├── common/          # Common utilities (errors/)
├── routes/          # API endpoints (30+ routes)
└── services/       # Business logic layer
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+ or pnpm 8+
- MiniMax API Key (Token Plan)

### Backend

```bash
cd backend
npm install
cp ../.env.example .env
# Edit .env and add your MINIMAX_API_KEY
npm start
# Runs on port 30000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on port 3001
```

Open http://localhost:3001 in your browser.

### Environment Variables

```env
# Backend (.env)
MINIMAX_API_KEY=your_token_plan_api_key
PORT=30000

# Frontend (.env.local)
NEXT_PUBLIC_BACKEND_URL=http://localhost:30000
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Next.js 16, Zustand 5, TypeScript |
| Backend | Express, Node.js, SSE |
| AI Model | MiniMax M2.7 (Token Plan) |
| Vector DB | Qdrant (optional), In-memory (default) |
| Infrastructure | Prometheus metrics, Redis cache |

## Features

### Intent Detection

Five intent types with clarification for low-confidence cases:
- `tool_use`: Tool execution request
- `knowledge`: RAG knowledge query
- `creative`: Creative generation
- `task`: Task execution
- `conversation`: General chat

### Agent Engine

ReAct (Reasoning + Acting) execution loop:
- Thought: Analyze current state and goal
- Action: Select and execute tool or LLM
- Observation: Process result
- Loop until completion or max iterations

### RAG Pipeline

1. Query Rewrite - contextualize incomplete queries
2. Query Decompose - split complex questions
3. Hybrid Search - vector + keyword retrieval
4. Reranking - multi-strategy fusion (CrossEncoder, BM25, Semantic, Diversity)
5. Citation Assembly - source attribution

### Enterprise Features

- Circuit breaker with automatic failover
- Queue-based rate limiting
- Prometheus metrics endpoint
- Configuration hot-reload
- Priority task queue with SSE notifications
- Alert management (critical/warning/info)

## Documentation

- [CLAUDE.md](./CLAUDE.md) - Project instructions and architecture
- [CHANGELOG.md](./CHANGELOG.md) - Version history
- [docs/](./docs/) - Technical documentation

## Performance Metrics

Based on benchmark tests (2026-03-18):

| Task | Method | Accuracy | Latency |
|------|--------|----------|---------|
| Intent Classification | Keyword Matching | 70% | <1ms |
| Tool Selection | Keyword Matching | 90% | <1ms |

| Mode | Time | Speedup |
|------|------|---------|
| Serial (10 tasks) | 620ms | 1.0x |
| Parallel 4 concurrent | 186ms | 3.3x |

## Contributing

Contributions are welcome under AGPL-3.0 license terms.

## References

- [Next.js Documentation](https://nextjs.org/docs)
- [React 19](https://react.dev)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [ReAct: Synergizing Reasoning and Acting](https://arxiv.org/abs/2210.03629)
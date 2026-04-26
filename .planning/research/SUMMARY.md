# Project Research Summary

**Project:** AI Chat 玩具
**Domain:** AI Agent Platform (RAG/A2A/HITL)
**Researched:** 2026-04-26
**Confidence:** HIGH

## Executive Summary

AI Chat 玩具 is a modern AI dialogue platform with enterprise-grade capabilities including RAG knowledge retrieval, multi-agent collaboration (A2A), and human-in-the-loop confirmation (HITL). Built on MiniMax Token Plan API with Next.js 15 + React 19 + Zustand 5 frontend and Express 4.18 backend, the architecture follows a six-layer DDD pattern.

The project has achieved 87/100 Agent evaluation score with strong RAG (98/100) and tool calling (94/100) capabilities. Current version v2.3.0 is in Phase 1 architecture consolidation with the primary risk being business logic still embedded in routes (~9,782 lines), violating layered architecture principles. The recommended path forward is completing Phase 1 by migrating business logic to services, removing mock data residuals, and addressing security concerns (sessionStorage XSS vulnerability) before advancing to Phase 2-3 RAG and Agent enhancements.

## Key Findings

### Recommended Stack

The research confirms the project's technology choices align with 2025 AI Agent platform standards. Next.js 15 App Router with React 19 provides optimal React 19 support, while Zustand 5 offers lightweight state management without Provider nesting. SSE (not WebSocket) is the standard for AI streaming responses.

**Core technologies:**
- **Next.js 15 (App Router)**: React 19 native support, Turbopack 76.7% faster dev startup — 95% confidence
- **Zustand 5**: TypeScript-native, minimal bundle, React 19 compatible — 90% confidence
- **Express 4.18**: Stable, flexible for AI backend orchestration — 90% confidence
- **SSE + AI SDK**: Standard for streaming AI responses, provider abstraction — 90% confidence
- **Qdrant**: Production vector search, superior to pgvector for AI use cases — 90% confidence
- **Vitest + Playwright**: Vite-native testing, fast refresh for AI UI iteration — 90% confidence

### Expected Features

**Must have (table stakes):**
- SSE streaming with typewriter effect — implemented
- Multi-turn memory (sliding window, 10-20 turns) — implemented
- Stream cancel/interrupt — implemented
- Markdown rendering (shiki + dompurify) — implemented
- Intent detection (5 categories + clarification) — implemented
- Tool calling with timeout and validation — implemented (30+ tools)
- CORS, rate limiting, security headers — implemented

**Should have (competitive differentiators):**
- ReAct execution loop with thought chain visualization — implemented
- A2A multi-agent collaboration (team_leader/collaborative/autonomous) — implemented
- Session Note Tool for persistent memory — implemented
- RAG query rewrite + decompose + multi-strategy rerank — implemented (CrossEncoder/BM25/Semantic/Diversity)
- HITL confirmation system (risk levels, countdown, shortcuts) — implemented (11 endpoints)
- Circuit breaker + structured logging + Prometheus metrics — implemented
- Ollama local vector model support — implemented

**Defer (v2+):**
- HyDE (hypothetical document embedding) — not implemented
- Self-introspective retrieval — not implemented
- Version management for RAG documents — not implemented
- Access control per user for knowledge base — not implemented
- Distributed vector storage (Qdrant clustering) — not implemented
- Data lineage tracing — not implemented

### Architecture Approach

The six-layer DDD architecture (routes → services → application → domain → infra → common) is the correct pattern for enterprise AI Agent platforms. The ReAct loop follows standard state machine pattern (IDLE → OBSERVING → PLANNING → ACTING → REASONING → COMPLETING) with asyncio.Event-style cancel mechanism. RAG integrates as a Tool within the Agent loop, retrieved at Planning or Reasoning phases based on intent detection.

**Major components:**
1. **AgentEngine** — ReAct execution loop, cancel mechanism, token management
2. **ToolExecutor + ToolRegistry** — parameter validation, timeout control, result merging
3. **RAGPipeline** — query rewrite, multi-channel retrieval, reranking, citation assembly
4. **CircuitBreaker + RateLimiter** — system protection, elastic scaling
5. **MetricsCollector + AlertManager** — Prometheus observability, three-tier alerting

### Critical Pitfalls

1. **Infinite loop without maxIterations** — Agent may循环 indefinitely consuming tokens. Fix: implement `maxTurns` limit (default 50) in AgentEngine loop.

2. **Mock data in production** — SSE Service returned Lorem ipsum, PerformanceMonitor used Math.random(). Fix: grep for mock/lorem/Math.random patterns, add NODE_ENV=production check.

3. **Business logic sunk in Routes layer** — 9,782 lines across routes files violates layered architecture. Fix: migrate to services, target routes ≤150 lines with only validation/response assembly.

4. **Vector fallback returns fake data** — VectorSearchChannel._mockEmbed() silently degrades. Fix: strict mode throws error when embedding fails, monitor vector_fallback_count.

5. **API key in sessionStorage (XSS vulnerability)** — sessionStorage accessible via XSS. Fix: use httpOnly cookies, add request origin verification.

6. **Token consumption unbounded** — Long conversations grow context infinitely. Fix: implement MemoryWindowManager with 80% token limit trigger for summarization.

7. **Frontend-backend API path mismatch** — KnowledgeBase, ToolRegistry, IntentTreeEditor had path inconsistencies. Fix: OpenAPI specification, shared type definitions, integration tests.

## Implications for Roadmap

### Phase 1: Architecture Foundation (P0)
**Rationale:** Business logic in routes is violation of layered architecture and blocks maintainability. Phase 1 is ~60-70% complete but stalled.

**Delivers:** Clean layered architecture with business logic in services
**Addresses:** Table stakes stability, mock data cleanup, console.log cleanup (544 occurrences)
**Avoids:** Routes bloat, maintenance deadlock

### Phase 2: RAG Enhancement (P1)
**Rationale:** RAG is a core differentiator (98/100 score). Current implementation needs hallucination control and confidence scoring.

**Delivers:** Production-ready RAG with confidence thresholds, HyDE support, data lineage
**Uses:** Qdrant cluster, CrossEncoder reranking
**Implements:** CitationAssembler confidence scoring

### Phase 3: Agent Maturation (P1)
**Rationale:** Tool ecosystem at 30+ tools but MCP marketplace only 40%. Multi-agent协作 needs refinement.

**Delivers:** Full MCP tool marketplace, enhanced A2A coordination modes
**Implements:** Tool permission tiers, cooling timers

### Phase 4: Production Scale (P2)
**Rationale:** Current single-process architecture limits to ~1k users. Qdrant production parameters unoptimized.

**Delivers:** Redis caching, connection pooling, distributed vector storage
**Uses:** QueueManager, CircuitBreaker, MetricsCollector

### Phase 5: Enterprise Features (P3)
**Rationale:** Access control, async indexing, multi-tenant isolation for large-scale deployment.

**Delivers:** Per-user knowledge base permissions, async document pipeline
**Uses:** WebSocket real-time sync, background job queues

### Phase Ordering Rationale

- Phase 1 first because architecture debt blocks all future work
- Phase 2 before 3 because RAG is higher maturity and revenue differentiator
- Phase 4 before 5 because scaling infrastructure enables enterprise features
- Dependencies: RAG enhancement needs stable Agent loop (Phase 1), enterprise needs scale (Phase 4)

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2:** HyDE implementation has limited documentation, needs API research
- **Phase 4:** Qdrant cluster configuration is complex, production parameters need tuning
- **Phase 5:** Multi-tenant isolation pattern has sparse documentation

**Phases with standard patterns (skip extensive research):**
- **Phase 1:** DDD layered architecture is well-documented with clear migration patterns
- **Phase 3:** MCP protocol has official spec, A2A has established patterns from project already

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified against official docs and 2025 standards |
| Features | HIGH | Table stakes and differentiators confirmed with project implementation |
| Architecture | HIGH | ReAct pattern, DDD layers, scaling patterns all standard and verified |
| Pitfalls | HIGH | All pitfalls identified from project-specific codebase analysis (CONCERNS.md) |

**Overall confidence:** HIGH

### Gaps to Address

- **Phase 1 completion measurement:** Need clear KPI for "business logic migrated" — suggest lines of code per route file as metric (target ≤150)
- **Mock data detection:** Need automated test that fails if mock patterns detected in production bundle
- **Token consumption monitoring:** Current implementation mentions but doesn't show MetricsCollector integration for token tracking

## Sources

### Primary (HIGH confidence)
- Project codebase mapping: `backend/src/routes/`, `backend/src/services/agentEngine.js`, `backend/src/domain/rag/`
- CLAUDE.md: Project instructions, architecture decisions, bug fix history
- STACK.md: 2025 AI Agent platform technology recommendations

### Secondary (MEDIUM confidence)
- FEATURES.md: Feature classification based on industry analysis, competitive landscape
- PITFALLS.md: Anti-patterns from project CONCERNS.md analysis and industry best practices
- ARCHITECTURE.md: Agent patterns from LangGraph, MiniMax Mini-Agent, industry standards

### Tertiary (LOW confidence)
- Scaling projections (Phase 2-3 user estimates): Based on architecture patterns, not validated with load testing

---
*Research completed: 2026-04-26*
*Ready for roadmap: yes*

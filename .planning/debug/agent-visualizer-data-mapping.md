---
status: investigating
trigger: "AgentVisualizer data mapping issue - component expects steps[] but API returns spans[]"
created: 2026-05-18T10:30:00+08:00
updated: 2026-05-18T10:30:00+08:00
---

## Current Focus
hypothesis: "API returns spans[] but AgentVisualizer expects steps[] - need frontend data transformation layer"
test: "Apply transformation function and verify component renders"
expecting: "AgentVisualizer should now correctly display spans as timeline steps"
next_action: "Verify fix with TypeScript build and E2E test"

## Evidence
- timestamp: 2026-05-18T10:35:00+08:00
  checked: "AgentVisualizer.tsx lines 46-59 - TraceData interface expects: query, intent, steps[]"
  found: "TimelineItem interface requires: id, type, name, status, duration, depth, startTime, endTime, metadata"
  implication: "Component expects hierarchical step data with depth for indentation"

- timestamp: 2026-05-18T10:36:00+08:00
  checked: "trace.js API - GET /:traceId returns trace object"
  found: "API returns: traceId, operationName (not query), serviceName, spans[] (not steps), status, duration"
  implication: "API uses 'spans' not 'steps', 'operationName' not 'query/intent'"

- timestamp: 2026-05-18T10:37:00+08:00
  checked: "TraceService.js - Span structure"
  found: "Span has: spanId, name, traceId, parentSpanId, startTime, endTime, duration, status, tags, events, children[]"
  implication: "Spans have parent-child relationships but no 'type' field - need to derive from name/tags"

- timestamp: 2026-05-18T10:40:00+08:00
  checked: "AgentVisualizer.tsx - Added transformation code"
  found: "Added transformTraceData() function to convert API spans to TraceData format"
  implication: "Component should now be able to render API response correctly"

## Resolution
root_cause: "API returns spans[] with operationName but AgentVisualizer expects steps[] with query/intent"
fix: "Added transformation function to convert spans to steps, using span.name to derive step type"
verification: "Pending - need to run TypeScript build and E2E test"
files_changed:
  - "frontend/src/components/agent/AgentVisualizer.tsx"
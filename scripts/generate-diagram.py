#!/usr/bin/env python3
"""Generate architecture diagram using mermaid.ink web service"""

import urllib.request
import urllib.parse
import base64
import json

def create_mermaid_diagram():
    mermaid_code = """
graph TB
    subgraph Frontend["<b>Frontend (Port 3001)</b>"]
        NextJS["Next.js 16<br/>React 19"]
        Zustand["Zustand 5<br/>State Management"]
        SSEClient["SSE Client<br/>Typewriter Effect"]
    end

    subgraph Backend["<b>Backend (Port 30000)</b>"]
        Express["Express Router"]
        ChatOrch["ChatOrchestrator"]
    end

    subgraph Domain["<b>Domain Layer</b>"]
        AgentEngine["AgentEngine<br/>ReAct Loop"]
        RAG["RAG Service"]
        Intent["IntentClassifier<br/>5 Types"]
        Memory["MemoryService"]
    end

    subgraph Infra["<b>Infrastructure</b>"]
        Circuit["CircuitBreaker"]
        RateLimit["RateLimiter"]
        Metrics["MetricsCollector"]
        Config["ConfigCenter"]
    end

    subgraph Routes["<b>API Routes</b>"]
        ChatRoute["chat.js"]
        AdminRoute["admin/*"]
        A2ARoute["a2a.js"]
    end

    subgraph External["<b>External</b>"]
        MiniMax["MiniMax API"]
        Qdrant["Qdrant DB"]
    end

    NextJS --> Express
    Express --> ChatRoute
    ChatRoute --> ChatOrch
    ChatOrch --> Intent
    Intent --> AgentEngine
    AgentEngine --> RAG
    AgentEngine --> Memory
    ChatOrch --> MiniMax
    ChatOrch --> AdminRoute
    AgentEngine --> A2ARoute

    classDef frontend fill:#E3F2FD,stroke:#1976D2
    classDef backend fill:#E8F5E9,stroke:#388E3C
    classDef domain fill:#FFF3E0,stroke:#F57C00
    classDef infra fill:#F3E5F5,stroke:#7B1FA2
    classDef routes fill:#FFEBEE,stroke:#D32F2F
    classDef external fill:#ECEFF1,stroke:#455A64

    class NextJS,Zustand,SSEClient frontend
    class Express,ChatOrch backend
    class AgentEngine,RAG,Intent,Memory domain
    class Circuit,RateLimit,Metrics,Config infra
    class ChatRoute,AdminRoute,A2ARoute routes
    class MiniMax,Qdrant external
"""

    # Encode for mermaid.ink
    b64 = base64.urlsafe_b64encode(mermaid_code.encode()).decode().rstrip('=')
    url = f"https://mermaid.ink/img/{b64}"

    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()

        output_path = 'docs/architecture-diagram.png'
        with open(output_path, 'wb') as f:
            f.write(data)
        print(f'Architecture diagram saved to {output_path}')
        return output_path
    except Exception as e:
        print(f'Failed to generate diagram: {e}')
        # Fallback: create SVG URL
        svg_url = f"https://mermaid.ink/svg/{b64}"
        print(f'SVG URL: {svg_url}')
        return None

if __name__ == '__main__':
    create_mermaid_diagram()
# Load Protection Patterns

## Pattern 1: BullMQ (Redis-based Queue)

- **How it works**: BullMQ is a Redis-based message queue for Node.js that provides reliable job processing with priorities, delayed jobs, retries, and rate limiting. It uses Redis as both backend and pub/sub mechanism for job orchestration.
- **When to use**: Background job processing, async task queues, rate limiting incoming traffic, decoupling services
- **Implementation complexity**: Low (npm install, connect to Redis, define workers)
- **Commercial grade**: ⭐⭐⭐⭐⭐

**Key Features for Traffic Handling:**
- Priority queues (handle VIP users first during spikes)
- Delayed jobs (spread load over time)
- Rate limiter (prevent system overwhelm)
- Retry with exponential backoff
- Job deduplication

**Scaling**: Supports Redis Cluster for horizontal scaling

---

## Pattern 2: Kafka (Distributed Event Streaming)

- **How it works**: Distributed log-based messaging system that durably stores messages and allows multiple consumers. Handles millions of messages/day with replay capability.
- **When to use**: High-throughput event streaming, audit trails, real-time analytics, micro-batch processing
- **Implementation complexity**: High (requires cluster management, partition strategy, offset management)
- **Commercial grade**: ⭐⭐⭐⭐⭐

**Key Features for Traffic Handling:**
- Partition-based parallel processing
- Consumer group load balancing
- Message retention and replay
- Exactly-once semantics
- Backpressure via consumer lag monitoring

**Scaling**: Linear horizontal scaling via partition addition

---

## Pattern 3: In-Memory Queue (Node.js native)

- **How it works**: Using `EventEmitter` or simple array-based queues within the process. Zero network latency, but no persistence.
- **When to use**: Ultra-low latency requirements, single instance deployments, cross-session in-process communication
- **Implementation complexity**: Lowest
- **Commercial grade**: ⭐⭐

**Key Features for Traffic Handling:**
- Zero network overhead
- Instant processing
- Lost on crash (no durability)
- Good for non-critical, low-volume traffic smoothing

---

## Pattern 4: PM2 Cluster Mode

- **How it works**: PM2 spawns multiple Node.js processes (one per CPU core) and load-balances HTTP requests across them using the built-in cluster module. Zero code changes required.
- **When to use**: Production Node.js deployments, multi-core utilization, zero-downtime restarts
- **Implementation complexity**: Very low (just `-i max` flag or config)
- **Commercial grade**: ⭐⭐⭐⭐

**Configuration Example:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    script: 'api.js',
    instances: 'max',        // Spawn as many as CPU cores
    exec_mode: 'cluster',    // Enable load balancer
    max_memory_restart: '1G' // Restart if memory exceeds 1GB
  }]
}
```

**Key Features for Traffic Handling:**
- Automatic load distribution
- Graceful reload (zero downtime)
- Memory cap per worker
- Max workers limit for stability

---

## Pattern 5: Nginx Upstream Load Balancing

- **How it works**: Nginx acts as reverse proxy, distributing traffic to multiple backend Node.js instances using various algorithms (round-robin, least-connected, ip-hash).
- **When to use**: Production deployments with multiple servers, SSL termination, static file serving
- **Implementation complexity**: Medium
- **Commercial grade**: ⭐⭐⭐⭐⭐

**Configuration:**
```nginx
upstream backend {
    least_conn;                    # Least connections algorithm
    server 127.0.0.1:30001 weight=3;
    server 127.0.0.1:30002 weight=2;
    server 127.0.0.1:30003 weight=1;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

**Key Features for Traffic Handling:**
- Health checks (removes dead backends)
- Weighted load balancing
- Connection pooling
- SSL offloading
- Rate limiting per IP

---

## Pattern 6: Kubernetes HPA (Horizontal Pod Autoscaler)

- **How it works**: K8s automatically scales Pod replicas based on CPU/memory utilization or custom metrics. Requires metrics-server and proper resource requests defined.
- **When to use**: Containerized deployments on K8s, auto-scaling production environments
- **Implementation complexity**: Medium-High
- **Commercial grade**: ⭐⭐⭐⭐⭐

**Configuration:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**Key Features for Traffic Handling:**
- Automatic scale-out during traffic spikes
- Scale-in during low traffic (cost optimization)
- Multi-metric support (CPU, memory, custom)
- PodDisruptionBudget for availability
- Stability zones spread (multi-AZ)

---

## Pattern 7: Circuit Breaker (opossum)

- **How it works**: Monitors failure rates and "trips" the circuit to stop cascading failures. States: CLOSED (normal) -> OPEN (failing fast) -> HALF-OPEN (probe recovery).
- **When to use**: External API calls, database connections, any potentially flaky dependency
- **Implementation complexity**: Low
- **Commercial grade**: ⭐⭐⭐⭐

**Implementation (already in project):**
```javascript
const CircuitBreaker = require('opossum');

const options = {
  timeout: 3000,           // If response > 3s, consider failure
  errorThresholdPercentage: 50,  // Trip circuit at 50% failures
  resetTimeout: 10000     // Try recovery after 10s
};

const breaker = new CircuitBreaker(callExternalService, options);
breaker.fire(params);
```

**Key Features:**
- Timeout protection
- Failure rate monitoring
- Automatic recovery
- Fallback functions
- Event metrics for monitoring

---

## Pattern 8: Resilience4j-style Bulkhead Isolation

- **How it works**: Limits concurrent executions to a max number (like a semaphore), isolating failures to prevent resource exhaustion.
- **When to use**: Prevent one slow operation from blocking all others, protect against resource exhaustion
- **Implementation complexity**: Medium
- **Commercial grade**: ⭐⭐⭐⭐

**Concept for Node.js:**
```javascript
// Semaphore pattern for concurrent connection limits
class Bulkhead {
  constructor(maxConcurrent) {
    this.semaphore = new Semaphore(maxConcurrent);
  }

  async execute(fn) {
    return this.semaphore.acquire().then(async () => {
      try {
        return await fn();
      } finally {
        this.semaphore.release();
      }
    });
  }
}
```

---

# Recommended Stack for SimpleAgent

## Target: 10k+ Concurrent Connections

### Architecture Overview

```
                    ┌─────────────────────────────────────────┐
                    │           Kubernetes Cluster            │
                    │                                          │
  Internet ──► [Nginx Ingress] ──► [Service] ──► [Pod x N]  │
                                        │            │        │
                                        │      ┌─────┴─────┐  │
                                        │      │PM2 Cluster │  │
                                        │      │  (4 core)  │  │
                                        │      └───────────┘  │
                                        │            │        │
                                    [BullMQ]    [API Server]  │
                                        │            │        │
                                      [Redis]       [MiniMax] │
                                        │                      │
                                   [Consumer]      [External]  │
                                        │                      │
                                    [Workers]                    │
                                        │                      │
                                   [DB/Vector]                  │
                                        │                      │
                                     [Qdrant]                   │
                                        │                      │
                                    [Storage]                   │
                                        │                      │
                                     [Redis]                    │
                                        │                      │
```

### Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Load Balancer** | Nginx Ingress | Production-grade, SSL termination, health checks |
| **Process Manager** | PM2 Cluster Mode | Multi-core utilization, zero-downtime reloads |
| **Queue System** | BullMQ | Redis-based, proven in Node.js ecosystem, priority support |
| **Circuit Breaker** | opossum (existing) | Already integrated, timeout + fallback support |
| **Auto-scaling** | Kubernetes HPA | Pod-level horizontal scaling based on CPU/memory |
| **Rate Limiting** | QueueRateLimiter (existing) + Nginx | Two-layer protection |

### Implementation Priority

1. **Phase 1 (Immediate)** - Queue-based load shedding
   - Integrate BullMQ for async task processing
   - Add rate limiter middleware before Express routes
   - Protect MiniMax API calls with opossum circuit breaker

2. **Phase 2 (Short-term)** - Multi-instance deployment
   - Configure PM2 cluster mode with `instances: 'max'`
   - Set memory limit per worker (`max_memory_restart: '1G'`)
   - Add graceful shutdown handling

3. **Phase 3 (Medium-term)** - Kubernetes HPA
   - Containerize application (Docker)
   - Define resource requests/limits
   - Configure HPA with CPU 70% target
   - Set min/max replicas (3-20)

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 1000 jobs | Scale consumers, enable backpressure |
| Circuit breaker failure rate | > 50% | Trip and show fallback |
| PM2 memory per worker | > 1GB | Restart worker |
| Response time P99 | > 5s | Scale horizontally |
| Worker CPU utilization | > 80% | HPA scale-out |

### Traffic Spike Handling Strategy

```
Traffic Spike Detection:
┌─────────────────────────────────────────────────┐
│  Monitor Queue Depth + Response Latency        │
│           │                                     │
│           ▼                                     │
│  ┌─────────────────┐   NO   ┌───────────────┐  │
│  │ Queue > 1000?   │ ──────►│ Normal Flow   │  │
│  └────────┬────────┘        └───────────────┘  │
│           │ YES                                      │
│           ▼                                          │
│  ┌─────────────────┐                                 │
│  │ Enable Backpressure│                              │
│  │ (429 + Retry-After)│                             │
│  └────────┬────────┘                                │
│           │                                          │
│           ▼                                          │
│  ┌─────────────────┐   YES   ┌───────────────┐    │
│  │ Auto-scale Pods │ ──────►│ Scale to max   │    │
│  └─────────────────┘         └───────────────┘    │
│           │                                          │
│           ▼                                          │
│  ┌─────────────────┐                                 │
│  │ BullMQ Priority │ ── High priority users first   │
│  │ Job Priority     │                                 │
│  └─────────────────┘                                 │
└─────────────────────────────────────────────────┘
```

### Configuration Reference

**PM2 (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log'
  }]
}
```

**BullMQ Queue Setup:**
```javascript
const queue = new Queue('agent-tasks', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
});
```

**opossum Circuit Breaker:**
```javascript
const breaker = new CircuitBreaker(callMiniMaxAPI, {
  timeout: 10000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10
});
```

---

## Summary

For **SimpleAgent** handling 10k+ concurrent connections:

1. **Queue-based load shedding** with BullMQ is the most practical approach for async task processing
2. **PM2 cluster mode** should be the baseline (already in ecosystem.config.js concept)
3. **opossum circuit breaker** should wrap all external API calls (MiniMax)
4. **Kubernetes HPA** for production auto-scaling when containerized

The combination provides:
- **Resilience**: Circuit breakers prevent cascade failures
- **Elasticity**: PM2 + K8s HPA for horizontal scaling
- **Reliability**: BullMQ for job persistence and retry
- **Performance**: Redis-based queuing with minimal latency overhead
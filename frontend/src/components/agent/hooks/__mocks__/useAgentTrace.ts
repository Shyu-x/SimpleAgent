/**
 * useAgentTrace Mock
 * 用于 AgentVisualizer 组件测试
 */

export function useAgentTrace(traceId?: string) {
  return {
    trace: null,
    steps: [],
    loading: false,
    error: null
  };
}

export function useTraceSubscription(traceId?: string) {
  return {
    steps: [],
    loading: false,
    error: null
  };
}
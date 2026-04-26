/**
 * Circuit Event Enum - 熔断器事件枚举
 */
export enum CircuitEvent {
  CLOSE = 'circuit:close',
  OPEN = 'circuit:open',
  HALF_OPEN = 'circuit:half_open',
  SUCCESS = 'circuit:success',
  FAILURE = 'circuit:failure',
  PROBE_SUCCESS = 'circuit:probe_success',
  PROBE_FAILURE = 'circuit:probe_failure',
}

/**
 * Circuit State Enum - 熔断器状态枚举
 * 定义熔断器的三种状态
 */
export enum CircuitState {
  /** 闭合状态：正常运行，允许请求通过 */
  CLOSED = 'CLOSED',
  /** 打开状态：故障触发，拒绝所有请求直接返回失败 */
  OPEN = 'OPEN',
  /** 半开状态：探测恢复，允许一个请求尝试通过 */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit Event Enum - 熔断器事件枚举
 * 定义熔断器状态转换和相关事件
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

/**
 * CircuitOpenError - 熔断器打开时抛出的错误
 * 当熔断器处于 OPEN 状态时，请求会被拒绝并抛出此错误
 */
export class CircuitOpenError extends Error {
  constructor(
    public circuitName: string,
    public state: CircuitState,
    public retryAfter: number,
  ) {
    super(`Circuit '${circuitName}' is ${state}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * TimeoutError - 超时错误
 * 当操作超过指定时间未完成时抛出
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

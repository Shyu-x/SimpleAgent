import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  CheckpointStatus,
  CheckpointType,
} from './dto/hitl.dto';

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  title: string;
  description?: string;
  context: Record<string, any>;
  options: Array<{ label?: string; value?: string; description?: string }>;
  defaultOption?: string;
  timeout: number;
  required: boolean;
  status: CheckpointStatus;
  createdAt: number;
  respondedAt?: number;
  respondedBy?: string;
  response?: {
    option?: string;
    comment?: string;
    reason?: string;
  };
}

@Injectable()
export class HitlService {
  private readonly logger = new Logger(HitlService.name);
  private checkpoints: Map<string, Checkpoint> = new Map();
  private history: Checkpoint[] = [];
  private handlers: Map<string, Function[]> = new Map();

  private readonly config = {
    defaultTimeout: 300000,
    autoApprove: false,
    autoApproveDelay: 60000,
    maxHistorySize: 1000,
  };

  constructor() {
    this.logger.log('HitlService initialized');
  }

  createCheckpoint(config: {
    type?: CheckpointType;
    title: string;
    description?: string;
    context?: Record<string, any>;
    options?: Array<{ label?: string; value?: string; description?: string }>;
    defaultOption?: string;
    timeout?: number;
    required?: boolean;
  }): Checkpoint {
    const checkpoint: Checkpoint = {
      id: `cp_${uuidv4()}`,
      type: config.type || CheckpointType.DECISION,
      title: config.title,
      description: config.description,
      context: config.context || {},
      options: config.options || [],
      defaultOption: config.defaultOption,
      timeout: config.timeout || this.config.defaultTimeout,
      required: config.required !== false,
      status: CheckpointStatus.PENDING,
      createdAt: Date.now(),
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.emit('checkpoint:created', checkpoint);

    if (this.config.autoApprove && !config.required) {
      setTimeout(() => {
        const cp = this.checkpoints.get(checkpoint.id);
        if (cp && cp.status === CheckpointStatus.PENDING) {
          this.approveCheckpoint(
            checkpoint.id,
            checkpoint.defaultOption,
            'auto-approved',
          );
        }
      }, this.config.autoApproveDelay);
    }

    this.logger.log(`Checkpoint created: ${checkpoint.id} - ${checkpoint.title}`);
    return checkpoint;
  }

  approveCheckpoint(
    checkpointId: string,
    option?: string,
    userId: string = 'system',
    comment: string = '',
  ): { success: boolean; checkpoint?: Checkpoint } {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false };
    }

    if (checkpoint.status !== CheckpointStatus.PENDING) {
      return { success: false };
    }

    checkpoint.status = CheckpointStatus.APPROVED;
    checkpoint.response = { option, comment };
    checkpoint.respondedAt = Date.now();
    checkpoint.respondedBy = userId;

    this.addToHistory(checkpoint);
    this.checkpoints.delete(checkpointId);

    this.emit('checkpoint:approved', checkpoint);
    this.logger.log(`Checkpoint approved: ${checkpointId} by ${userId}`);

    return { success: true, checkpoint };
  }

  rejectCheckpoint(
    checkpointId: string,
    reason: string = '',
    userId: string = 'system',
  ): { success: boolean; checkpoint?: Checkpoint } {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false };
    }

    if (checkpoint.status !== CheckpointStatus.PENDING) {
      return { success: false };
    }

    checkpoint.status = CheckpointStatus.REJECTED;
    checkpoint.response = { reason };
    checkpoint.respondedAt = Date.now();
    checkpoint.respondedBy = userId;

    this.addToHistory(checkpoint);
    this.checkpoints.delete(checkpointId);

    this.emit('checkpoint:rejected', checkpoint);
    this.logger.log(`Checkpoint rejected: ${checkpointId} by ${userId}`);

    return { success: true, checkpoint };
  }

  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  findInHistory(checkpointId: string): Checkpoint | undefined {
    return this.history.find((h) => h.id === checkpointId);
  }

  getPendingCheckpoints(): Checkpoint[] {
    const pending: Checkpoint[] = [];
    this.checkpoints.forEach((cp) => {
      if (cp.status === CheckpointStatus.PENDING) {
        pending.push(cp);
      }
    });
    return pending;
  }

  async waitForCheckpoint(
    checkpointId: string,
    timeout?: number,
  ): Promise<{ success: boolean; checkpoint?: Checkpoint; error?: string }> {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { success: false, error: 'Checkpoint not found' };
    }

    const actualTimeout = timeout || checkpoint.timeout;

    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = 500;

      const check = () => {
        const cp = this.checkpoints.get(checkpointId);

        if (!cp || cp.status !== CheckpointStatus.PENDING) {
          resolve({
            success: cp?.status === CheckpointStatus.APPROVED,
            checkpoint: cp || this.findInHistory(checkpointId),
          });
          return;
        }

        if (Date.now() - startTime > actualTimeout) {
          cp.status = CheckpointStatus.TIMEOUT;
          this.addToHistory(cp);
          this.checkpoints.delete(checkpointId);
          this.emit('checkpoint:timeout', cp);
          resolve({ success: false, error: 'Timeout', checkpoint: cp });
          return;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  async requestConfirmation(config: {
    type?: CheckpointType;
    title: string;
    description?: string;
    context?: Record<string, any>;
    options?: Array<{ label?: string; value?: string; description?: string }>;
    timeout?: number;
    required?: boolean;
  }): Promise<{ success: boolean; checkpoint?: Checkpoint; error?: string }> {
    const checkpoint = this.createCheckpoint(config);
    const result = await this.waitForCheckpoint(checkpoint.id, config.timeout);
    return result;
  }

  private addToHistory(checkpoint: Checkpoint): void {
    this.history.push(checkpoint);
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  getHistory(limit: number = 50): Checkpoint[] {
    return this.history.slice(-limit);
  }

  on(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: Checkpoint): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Event handler error for ${event}:`, error);
        }
      });
    }
  }

  getStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    timeout: number;
  } {
    const stats = {
      total: this.history.length,
      pending: this.checkpoints.size,
      approved: 0,
      rejected: 0,
      timeout: 0,
    };

    this.history.forEach((h) => {
      if (h.status === CheckpointStatus.APPROVED) stats.approved++;
      if (h.status === CheckpointStatus.REJECTED) stats.rejected++;
      if (h.status === CheckpointStatus.TIMEOUT) stats.timeout++;
    });

    return stats;
  }

  clearPending(): void {
    this.checkpoints.forEach((cp) => {
      cp.status = CheckpointStatus.CANCELLED;
      this.addToHistory(cp);
    });
    this.checkpoints.clear();
    this.logger.log('All pending checkpoints cleared');
  }
}

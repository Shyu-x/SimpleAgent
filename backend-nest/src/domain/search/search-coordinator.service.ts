import { Injectable } from '@nestjs/common';
import { SearchChannelService, SearchResult } from './search-channel.service';

interface CoordinatorConfig {
  strategy?: string;
  defaultMaxResults?: number;
  concurrency?: number;
  rerankerEnabled?: boolean;
}

interface SearchOptions {
  channels?: string[];
  maxResults?: number;
  strategy?: string;
  filters?: any;
  enableRerank?: boolean;
  fusionType?: string;
  concurrency?: number;
}

interface CoordinatorStats {
  totalRequests: number;
  channelStats: Map<string, { requests: number; failures: number; avgLatency: number; totalLatency: number }>;
  parallelExecutions: number;
  sequentialExecutions: number;
  totalLatencyMs: number;
}

interface ChannelSearchResult {
  channel: string;
  type: string;
  weight: number;
  results: SearchResult[];
  error?: string;
}

class ThreadPoolExecutor {
  private concurrency: number;
  private running: number = 0;
  private queue: Array<{ taskFn: () => Promise<any>; resolve: (value: any) => void; reject: (error: any) => void }> = [];

  constructor(concurrency = 5) { this.concurrency = concurrency; }

  addTask(taskFn: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this._processQueue();
    });
  }

  private _processQueue(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      this.running++;
      item.taskFn().then(item.resolve).catch(item.reject).finally(() => { this.running--; this._processQueue(); });
    }
  }

  getConcurrency(): number { return this.concurrency; }
  setConcurrency(concurrency: number): void { this.concurrency = concurrency; }
}

@Injectable()
export class SearchCoordinatorService {
  private channels: Map<string, SearchChannelService> = new Map();
  private strategy: string;
  private defaultMaxResults: number;
  private _threadPool: ThreadPoolExecutor;
  private _rerankerEnabled: boolean;
  private _stats: CoordinatorStats;

  constructor(config: CoordinatorConfig = {}) {
    this.strategy = config.strategy || 'parallel';
    this.defaultMaxResults = config.defaultMaxResults || 10;
    this._threadPool = new ThreadPoolExecutor(config.concurrency || 5);
    this._rerankerEnabled = config.rerankerEnabled !== false;
    this._stats = { totalRequests: 0, channelStats: new Map(), parallelExecutions: 0, sequentialExecutions: 0, totalLatencyMs: 0 };
  }

  registerChannel(channel: SearchChannelService): this {
    const info = channel.getInfo();
    this.channels.set(info.name, channel);
    this._stats.channelStats.set(info.name, { requests: 0, failures: 0, avgLatency: 0, totalLatency: 0 });
    return this;
  }

  unregisterChannel(name: string): boolean {
    const removed = this.channels.delete(name);
    if (removed) this._stats.channelStats.delete(name);
    return removed;
  }

  getChannels() { return Array.from(this.channels.values()).map((ch) => ch.getInfo()); }
  setConcurrency(concurrency: number): this { this._threadPool.setConcurrency(concurrency); return this; }

  async search(query: string, options: SearchOptions = {}): Promise<any> {
    const startTime = Date.now();
    this._stats.totalRequests++;
    const targetChannels = this._getTargetChannels(options.channels);
    if (targetChannels.length === 0) {
      return { query, results: [], metadata: { totalResults: 0, channelsUsed: [], latency: Date.now() - startTime, strategy: options.strategy || this.strategy } };
    }
    let channelResults;
    if (options.strategy === 'sequential') {
      this._stats.sequentialExecutions++;
      channelResults = await this._executeSearchChannelsSequential(query, targetChannels, options);
    } else {
      this._stats.parallelExecutions++;
      channelResults = await this._executeSearchChannelsParallel(query, targetChannels, options);
    }
    const fusedResults = this._fuseResults(channelResults, options.fusionType || 'RRFS');
    return { query, results: fusedResults.slice(0, options.maxResults || this.defaultMaxResults), metadata: { totalResults: fusedResults.length, channelsUsed: targetChannels.map((ch) => ch.getInfo().name), latency: Date.now() - startTime, strategy: options.strategy || this.strategy } };
  }

  private async _executeSearchChannelsParallel(query: string, channels: SearchChannelService[], options: Record<string, any>): Promise<ChannelSearchResult[]> {
    const healthyChannels = channels.filter((ch) => ch.getInfo().enabled && ch.isHealthy());
    if (healthyChannels.length === 0) return [];
    const promises = healthyChannels.map((channel) => this._threadPool.addTask(() => this._searchChannel(channel, query, options)));
    const results = await Promise.allSettled(promises);
    return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }

  private async _executeSearchChannelsSequential(query: string, channels: SearchChannelService[], options: Record<string, any>): Promise<ChannelSearchResult[]> {
    const results: ChannelSearchResult[] = [];
    for (const channel of channels) {
      if (!channel.getInfo().enabled || !channel.isHealthy()) continue;
      try { results.push(await this._searchChannel(channel, query, options)); } catch {}
    }
    return results;
  }

  private async _searchChannel(channel: SearchChannelService, query: string, options: Record<string, any>): Promise<ChannelSearchResult> {
    try {
      const results = await channel.searchWithTimeout(query, { maxResults: (options.maxResults || this.defaultMaxResults) * 3, filters: options.filters });
      return { channel: channel.getInfo().name, type: channel.getType(), weight: channel.getInfo().weight, results };
    } catch (error) {
      return { channel: channel.getInfo().name, type: channel.getType(), weight: channel.getInfo().weight, results: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private _getTargetChannels(channelNames?: string[]): SearchChannelService[] {
    if (!channelNames || channelNames.length === 0) return Array.from(this.channels.values());
    return channelNames.map((name) => this.channels.get(name)).filter(Boolean) as SearchChannelService[];
  }

  private _fuseResults(channelResults: ChannelSearchResult[], fusionType = 'RRFS'): SearchResult[] {
    if (!channelResults || channelResults.length === 0) return [];
    if (channelResults.length === 1) return channelResults[0].results || [];
    const seen = new Map<string, { result: SearchResult; sources: any[] }>();
    for (const cr of channelResults) {
      for (let rank = 0; rank < cr.results.length; rank++) {
        const result = cr.results[rank];
        if (!seen.has(result.id)) seen.set(result.id, { result: { ...result }, sources: [] });
        const entry = seen.get(result.id)!;
        entry.sources.push({ channel: cr.channel, rank: rank + 1, weight: cr.weight });
        entry.result.score = (entry.result.score || 0) + this._calculateFusedScore(rank + 1, cr.weight, fusionType);
      }
    }
    return Array.from(seen.values()).map((e) => ({ ...e.result, sources: e.sources })).sort((a, b) => b.score - a.score);
  }

  private _calculateFusedScore(rank: number, weight: number, fusionType: string): number {
    const k = 60;
    return fusionType === 'weighted' ? weight * (1 / rank) : weight / (k + rank);
  }

  getStats() {
    const channelStatsObj: Record<string, any> = {};
    for (const [name, stats] of this._stats.channelStats.entries()) {
      channelStatsObj[name] = { ...stats, avgLatency: stats.requests > 0 ? stats.totalLatency / stats.requests : 0 };
    }
    return { totalRequests: this._stats.totalRequests, registeredChannels: this.channels.size, avgLatencyMs: this._stats.totalLatencyMs / Math.max(this._stats.totalRequests, 1), channelStats: channelStatsObj };
  }
}

/**
 * Zustand SessionStorage 适配器
 * 提供统一的 sessionStorage 封装，支持 SSR 环境
 *
 * 注意：直接使用 ssrSessionStorage 以避免代码重复
 */
import { ssrSessionStorage } from '@/lib/ssrStorage';

// 重新导出 ssrSessionStorage 作为 sessionStorageAdapter
// 保持 API 兼容性
export const sessionStorageAdapter = ssrSessionStorage;

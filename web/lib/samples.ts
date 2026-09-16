import type { NetworkSample } from './config'
export const SAMPLE_INTERVAL_MS = 15_000
export const MAX_SAMPLES = 240
export function scopeKey(chainId: number, contract: string) { return `signal:v1:${chainId}:${contract.toLowerCase()}:network` }
export function validSamples(value: unknown): NetworkSample[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is NetworkSample => !!item && item.ok === true && typeof item.observedAt === 'string' && Number.isFinite(item.block?.ageSeconds) && Number.isFinite(item.block?.latencyMs) && Number.isFinite(item.block?.number)).slice(-MAX_SAMPLES)
}

import { NextResponse } from 'next/server'
import { decodeFunctionResult, encodeFunctionData } from 'viem'
import { BOT_CHAIN, SIGNAL_ANCHOR } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function rpc<T>(method: string, params: unknown[]) {
  const startedAt = performance.now()
  const response = await fetch(BOT_CHAIN.rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store', signal: AbortSignal.timeout(9_000),
  })
  const latencyMs = Math.round(performance.now() - startedAt)
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`)
  const payload = await response.json() as { result?: T; error?: { code: number; message: string } }
  if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`)
  if (payload.result === undefined) throw new Error('RPC response omitted its result')
  return { result: payload.result, latencyMs }
}

export async function GET() {
  const observedAt = new Date().toISOString()
  try {
    const chain = await rpc<string>('eth_chainId', [])
    if (Number(BigInt(chain.result)) !== BOT_CHAIN.id) {
      return NextResponse.json({ ok: false, observedAt, source: BOT_CHAIN.rpcUrl, error: `Unexpected chain ID ${chain.result}` }, { status: 502 })
    }
    const block = await rpc<{ number: string; hash: string; timestamp: string }>('eth_getBlockByNumber', ['latest', false])
    const code = await rpc<string>('eth_getCode', [SIGNAL_ANCHOR.address, 'latest'])
    const [productCall, targetChainCall] = await Promise.all([
      rpc<`0x${string}`>('eth_call', [{ to: SIGNAL_ANCHOR.address, data: encodeFunctionData({ abi: SIGNAL_ANCHOR.abi, functionName: 'PRODUCT' }) }, 'latest']),
      rpc<`0x${string}`>('eth_call', [{ to: SIGNAL_ANCHOR.address, data: encodeFunctionData({ abi: SIGNAL_ANCHOR.abi, functionName: 'TARGET_CHAIN_ID' }) }, 'latest']),
    ])
    const product = decodeFunctionResult({ abi: SIGNAL_ANCHOR.abi, functionName: 'PRODUCT', data: productCall.result })
    const targetChainId = decodeFunctionResult({ abi: SIGNAL_ANCHOR.abi, functionName: 'TARGET_CHAIN_ID', data: targetChainCall.result })
    if (product !== 'Signal' || Number(targetChainId) !== BOT_CHAIN.id || code.result === '0x') {
      return NextResponse.json({ ok: false, observedAt, source: BOT_CHAIN.rpcUrl, error: 'SignalAnchor identity or deployed bytecode did not match expected testnet configuration.' }, { status: 502 })
    }
    const now = Math.floor(Date.now() / 1000)
    const blockTime = Number(BigInt(block.result.timestamp))
    return NextResponse.json({
      ok: true, observedAt, source: BOT_CHAIN.rpcUrl,
      chain: { id: Number(BigInt(chain.result)), latencyMs: chain.latencyMs },
      block: { number: Number(BigInt(block.result.number)), hash: block.result.hash, timestamp: new Date(blockTime * 1000).toISOString(), ageSeconds: Math.max(0, now - blockTime), latencyMs: block.latencyMs },
      contract: { address: SIGNAL_ANCHOR.address, product, targetChainId: Number(targetChainId), codeBytes: Math.max(0, (code.result.length - 2) / 2), latencyMs: code.latencyMs },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Signal RPC observation failed', error instanceof Error ? error.name : 'UnknownError')
    return NextResponse.json({ ok: false, observedAt, source: BOT_CHAIN.rpcUrl, error: 'RPC observation failed. Check the configured endpoint and try again.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}

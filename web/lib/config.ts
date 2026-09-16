export const BOT_CHAIN = {
  id: 968,
  hexId: '0x3c8',
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrl: process.env.BOT_RPC_URL || 'https://rpc.bohr.life',
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://scan.bohr.life',
} as const

export const SIGNAL_ANCHOR = {
  address: (process.env.NEXT_PUBLIC_SIGNAL_ANCHOR || '0xa877cB547b6B71352B3d461263cb991549ffED0e') as `0x${string}`,
  abi: [{ type: 'function', name: 'anchorObservation', stateMutability: 'nonpayable', inputs: [{ name: 'observationId', type: 'bytes32' }, { name: 'incident', type: 'string' }, { name: 'source', type: 'string' }], outputs: [] }, { type: 'event', name: 'ObservationAnchored', anonymous: false, inputs: [{ indexed: true, name: 'observationId', type: 'bytes32' }, { indexed: false, name: 'incident', type: 'string' }, { indexed: false, name: 'source', type: 'string' }, { indexed: false, name: 'observedAt', type: 'uint64' }] }, { type: 'function', name: 'TARGET_CHAIN_ID', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }, { type: 'function', name: 'PRODUCT', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
} as const

export type NetworkSample = {
  ok: true; observedAt: string; source: string;
  chain: { id: number; latencyMs: number };
  block: { number: number; hash: string; timestamp: string; ageSeconds: number; latencyMs: number };
  contract: { address: string; product: string; targetChainId: number; codeBytes: number; latencyMs: number };
}

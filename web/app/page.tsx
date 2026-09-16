'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Activity, ArrowDownToLine, ArrowUpRight, Blocks, Check, ChevronDown, CircleAlert, Clock3, Copy, ExternalLink, FileSearch, Fingerprint, Gauge, LoaderCircle, Network, Radio, RefreshCw, Search, ShieldCheck, Unplug, Wallet, X } from 'lucide-react'
import { createPublicClient, createWalletClient, custom, http, keccak256, toBytes, type Address, type Hash } from 'viem'
import { defineChain } from 'viem'
import { BOT_CHAIN, SIGNAL_ANCHOR, type NetworkSample } from '@/lib/config'
import { MAX_SAMPLES, SAMPLE_INTERVAL_MS, scopeKey, validSamples } from '@/lib/samples'

type View = 'network' | 'observations' | 'contracts'
type ProbeError = { ok: false; observedAt: string; source: string; error: string }
type LocalAnchor = { kind: 'anchor'; observedAt: string; observationId: string; incident: string; source: string; account: string; hash: Hash; blockNumber: number }
type InjectedProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, handler: (...args: unknown[]) => void) => void; removeListener?: (event: string, handler: (...args: unknown[]) => void) => void }
const botChain = defineChain({ id: BOT_CHAIN.id, name: BOT_CHAIN.name, nativeCurrency: BOT_CHAIN.nativeCurrency, rpcUrls: { default: { http: [BOT_CHAIN.rpcUrl] } }, blockExplorers: { default: { name: 'BOT Scan', url: BOT_CHAIN.explorerUrl } } })
const publicClient = createPublicClient({ chain: botChain, transport: http(BOT_CHAIN.rpcUrl) })
const injectedProvider = () => (window as Window & { ethereum?: InjectedProvider }).ethereum
const nav: { id: View; label: string; Icon: typeof Network }[] = [{ id: 'network', label: 'Network', Icon: Network }, { id: 'observations', label: 'Observations', Icon: FileSearch }, { id: 'contracts', label: 'Contracts', Icon: Blocks }]
const validViews: View[] = ['network', 'observations', 'contracts']
const addressShort = (address?: string) => address ? `${address.slice(0, 7)}…${address.slice(-5)}` : '—'
const timeLabel = (value: string) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
const ageLabel = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
const safeJson = <T,>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }

function IconButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <button className="icon-button" title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>
}

export default function Home() {
  const router = useRouter()
  const pathname = usePathname()
  const [view, setView] = useState<View>('network')
  const [address, setAddress] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [connectPending, setConnectPending] = useState(false)
  const [connectError, setConnectError] = useState<Error | null>(null)
  const [samples, setSamples] = useState<NetworkSample[]>([])
  const [lastError, setLastError] = useState<ProbeError | null>(null)
  const [probing, setProbing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<NetworkSample | null>(null)
  const [anchors, setAnchors] = useState<LocalAnchor[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'anchor'>('all')
  const [anchorOpen, setAnchorOpen] = useState(false)
  const [incident, setIncident] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [txState, setTxState] = useState<{ phase: 'idle' | 'simulating' | 'pending' | 'confirming' | 'success' | 'error'; message?: string; hash?: Hash }>({ phase: 'idle' })
  const [copied, setCopied] = useState(false)
  const pollLock = useRef(false)
  const isConnected = !!address
  const storageKey = scopeKey(BOT_CHAIN.id, SIGNAL_ANCHOR.address)
  const accountScope = `signal:v1:${BOT_CHAIN.id}:${SIGNAL_ANCHOR.address.toLowerCase()}:${address?.toLowerCase() ?? 'disconnected'}:anchors`

  const changeView = useCallback((next: View) => {
    setView(next)
    router.replace(`${pathname}?view=${next}`, { scroll: false })
    try { localStorage.setItem('signal:active-view', next) } catch { /* unavailable storage is non-fatal */ }
    setSelected(null)
  }, [pathname, router])

  useEffect(() => {
    const queryView = new URLSearchParams(window.location.search).get('view') as View | null
    if (queryView && validViews.includes(queryView)) { setView(queryView); return }
    try { const saved = localStorage.getItem('signal:active-view') as View | null; if (saved && validViews.includes(saved)) { setView(saved); router.replace(`${pathname}?view=${saved}`, { scroll: false }) } } catch { /* use default */ }
  }, [pathname, router])

  useEffect(() => {
    try { setSamples(validSamples(safeJson(localStorage.getItem(storageKey), []))) } catch { setSamples([]) }
    setLoaded(true)
  }, [storageKey])
  useEffect(() => {
    try { const key = accountScope; const rows = safeJson<LocalAnchor[]>(localStorage.getItem(key), []); setAnchors(Array.isArray(rows) ? rows.filter(x => x?.kind === 'anchor') : []) } catch { setAnchors([]) }
  }, [accountScope])

  useEffect(() => {
    const provider = injectedProvider()
    if (!provider?.on) return
    const onAccounts = (...args: unknown[]) => { const accounts = args[0]; setAddress(Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] as Address : undefined); setSelected(null) }
    const onChain = (...args: unknown[]) => { const id = args[0]; setChainId(typeof id === 'string' ? Number(BigInt(id)) : undefined); setSelected(null) }
    const onDisconnect = () => { setAddress(undefined); setChainId(undefined); setSelected(null) }
    provider.on('accountsChanged', onAccounts); provider.on('chainChanged', onChain); provider.on('disconnect', onDisconnect)
    return () => { provider.removeListener?.('accountsChanged', onAccounts); provider.removeListener?.('chainChanged', onChain); provider.removeListener?.('disconnect', onDisconnect) }
  }, [])

  const poll = useCallback(async () => {
    if (pollLock.current) return
    pollLock.current = true
    setProbing(true)
    try {
      const response = await fetch('/api/network', { cache: 'no-store', headers: { accept: 'application/json' } })
      const data = await response.json() as NetworkSample | ProbeError
      if (!response.ok || !data.ok) { const failure = data as ProbeError; setLastError(failure); return }
      setLastError(null)
      setSamples(previous => {
        const next = [...previous.filter(x => x.observedAt !== data.observedAt), data].slice(-MAX_SAMPLES)
        try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* session remains usable without persistence */ }
        return next
      })
    } catch (error) {
      setLastError({ ok: false, observedAt: new Date().toISOString(), source: BOT_CHAIN.rpcUrl, error: error instanceof Error ? error.message : 'Network probe failed' })
    } finally { pollLock.current = false; setProbing(false) }
  }, [storageKey])
  useEffect(() => { void poll(); const timer = window.setInterval(() => void poll(), SAMPLE_INTERVAL_MS); return () => window.clearInterval(timer) }, [poll])

  const latest = samples.at(-1)
  const stale = latest ? Date.now() - new Date(latest.observedAt).getTime() > SAMPLE_INTERVAL_MS * 2.5 : false
  const rows = useMemo(() => {
    const network = samples.map((sample, index) => ({ id: `probe-${sample.observedAt}-${index}`, kind: 'probe' as const, time: sample.observedAt, sample }))
    const failed = lastError ? [{ id: `failed-${lastError.observedAt}`, kind: 'failed' as const, time: lastError.observedAt, failure: lastError }] : []
    const anchored = anchors.map((anchor, index) => ({ id: `anchor-${anchor.hash}-${index}`, kind: 'anchor' as const, time: anchor.observedAt, anchor }))
    return [...network, ...failed, ...anchored].sort((a, b) => b.time.localeCompare(a.time))
      .filter(row => filter === 'all' || (filter === 'success' && row.kind === 'probe') || row.kind === filter)
      .filter(row => !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
  }, [samples, anchors, lastError, filter, search])

  const exportCsv = () => {
    const records = rows.map(row => row.kind === 'probe' ? [row.time, 'success', row.sample.block.number, row.sample.block.ageSeconds, row.sample.block.latencyMs, row.sample.source, row.sample.block.hash] : row.kind === 'failed' ? [row.time, 'failed', '', '', '', row.failure.source, row.failure.error] : [row.time, 'anchor', row.anchor.blockNumber, '', '', row.anchor.account, row.anchor.hash])
    const csv = [['observed_at', 'kind', 'block', 'block_age_seconds', 'response_ms', 'source', 'evidence'].concat(records).map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `signal-observations-${BOT_CHAIN.id}.csv`; link.click(); URL.revokeObjectURL(url)
  }

  const connectWallet = async () => {
    const provider = injectedProvider()
    if (!provider) { setConnectError(new Error('No injected wallet found. Enable a browser wallet to use the anchor action.')); return }
    setConnectPending(true); setConnectError(null)
    try { const accounts = await provider.request({ method: 'eth_requestAccounts' }); if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') throw new Error('Wallet returned no account.'); setAddress(accounts[0] as Address); const id = await provider.request({ method: 'eth_chainId' }); if (typeof id === 'string') setChainId(Number(BigInt(id))) }
    catch (error) { setConnectError(error instanceof Error ? error : new Error('Wallet connection failed.')) }
    finally { setConnectPending(false) }
  }
  const disconnectWallet = () => { setAddress(undefined); setSelected(null); setTxState({ phase: 'idle' }) }
  const ensureCorrectChain = async () => {
    const provider = injectedProvider()
    if (!provider) throw new Error('No injected wallet was found.')
    try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BOT_CHAIN.hexId }] }) }
    catch (error) { if ((error as { code?: number })?.code !== 4902) throw error; await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: BOT_CHAIN.hexId, chainName: BOT_CHAIN.name, nativeCurrency: BOT_CHAIN.nativeCurrency, rpcUrls: [BOT_CHAIN.rpcUrl], blockExplorerUrls: [BOT_CHAIN.explorerUrl] }] }); await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BOT_CHAIN.hexId }] }) }
  }

  const submitAnchor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const provider = injectedProvider()
    if (!isConnected || !address || !provider) { setTxState({ phase: 'error', message: 'Connect an injected wallet to continue.' }); return }
    if (chainId !== BOT_CHAIN.id) { setTxState({ phase: 'error', message: 'Switch to BOT Chain Testnet before simulating.' }); return }
    if (!latest) { setTxState({ phase: 'error', message: 'A successful live network sample is required before anchoring.' }); return }
    if (!incident.trim() || incident.trim().length > 120 || !sourceText.trim() || sourceText.trim().length > 240) { setTxState({ phase: 'error', message: 'Incident must be 1–120 characters and source 1–240 characters.' }); return }
    try {
      setTxState({ phase: 'simulating', message: 'Simulating the exact contract call…' })
      const canonical = JSON.stringify({ chainId: BOT_CHAIN.id, contract: SIGNAL_ANCHOR.address.toLowerCase(), observedAt: latest.observedAt, blockHash: latest.block.hash, incident: incident.trim(), source: sourceText.trim() })
      const observationId = keccak256(toBytes(canonical))
      const args = [observationId, incident.trim(), sourceText.trim()] as const
      const { request } = await publicClient.simulateContract({ account: address, address: SIGNAL_ANCHOR.address, abi: SIGNAL_ANCHOR.abi, functionName: 'anchorObservation', args })
      setTxState({ phase: 'pending', message: 'Simulation passed. Confirm the transaction in your wallet.' })
      const walletClient = createWalletClient({ account: address, chain: botChain, transport: custom(provider as never) })
      const hash = await walletClient.writeContract(request)
      setTxState({ phase: 'confirming', message: 'Transaction sent; waiting for a testnet receipt.', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain.')
      const entry: LocalAnchor = { kind: 'anchor', observedAt: new Date().toISOString(), observationId, incident: incident.trim(), source: sourceText.trim(), account: address, hash, blockNumber: Number(receipt.blockNumber) }
      setAnchors(previous => { const next = [entry, ...previous].slice(0, 100); try { localStorage.setItem(accountScope, JSON.stringify(next)) } catch { /* on-chain receipt remains authoritative */ } return next })
      setTxState({ phase: 'success', message: 'Receipt confirmed. This anchors the submitted fields; it does not prove the incident is true.', hash })
      setIncident(''); setAnchorOpen(false); changeView('observations')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet action failed.'
      setTxState({ phase: 'error', message: /reject|denied|cancel/i.test(message) ? 'Wallet request was rejected or cancelled.' : message })
    }
  }

  const copyAddress = async () => { await navigator.clipboard.writeText(SIGNAL_ANCHOR.address); setCopied(true); window.setTimeout(() => setCopied(false), 1400) }

  return <main className="app-shell">
    <aside className="sidebar"><a className="wordmark" href="/?view=network" onClick={e => { e.preventDefault(); changeView('network') }} aria-label="Signal Network"><Image src="/signal-mark.svg" width={32} height={32} alt=""/><span>signal</span></a><div className="workspace-label">BOT CHAIN / TESTNET</div><nav className="primary-nav" aria-label="Primary workflows" role="tablist">{nav.map(({ id, label, Icon }) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => changeView(id)}><Icon size={17} strokeWidth={1.8}/><span>{label}</span><span className="nav-shortcut">{id === 'network' ? '01' : id === 'observations' ? '02' : '03'}</span></button>)}</nav><div className="sidebar-bottom"><div className="read-only-tag"><span className="signal-dot"/>Public reads need no wallet</div><a className="sidebar-explorer" href={`${BOT_CHAIN.explorerUrl}/address/${SIGNAL_ANCHOR.address}`} target="_blank" rel="noreferrer">Verified deployment <ExternalLink size={13}/></a><div className="sidebar-version">SIGNAL / 1.0 <span>TESTNET</span></div></div></aside>
    <section className="main-area">
      <header className="topbar"><div className="mobile-brand"><Image src="/signal-mark.svg" width={26} height={26} alt=""/><b>signal</b></div><div className="topbar-state"><span className={`state-led ${lastError || stale ? 'warning' : latest ? 'healthy' : ''}`}/><span>{lastError ? 'PROBE FAILED' : stale ? 'SAMPLE STALE' : latest ? 'OBSERVING' : 'CONNECTING'}</span><i/><span className="chain-label">BOT TESTNET <code>968</code></span><i/><span className="last-seen">{latest ? `LAST SAMPLE ${timeLabel(latest.observedAt)}` : 'NO SAMPLE YET'}</span></div><div className="wallet-control">{isConnected ? <><span className="wallet-address"><span className="signal-dot"/>{addressShort(address)}</span><button className="wallet-disconnect" onClick={disconnectWallet} title="Disconnect from Signal" aria-label="Disconnect from Signal"><Unplug size={15}/></button></> : <button className="connect-button" onClick={() => void connectWallet()} disabled={connectPending}><Wallet size={15}/>{connectPending ? 'Connecting…' : 'Connect wallet'}</button>}</div></header>
      {connectError && <div className="inline-alert" role="status"><CircleAlert size={15}/>{connectError.message}<button onClick={() => setConnectError(null)} aria-label="Dismiss wallet error"><X size={14}/></button></div>}
      {view === 'network' && <NetworkView latest={latest} samples={samples} lastError={lastError} probing={probing} loaded={loaded} onRefresh={() => void poll()} onSelect={setSelected}/>}
      {view === 'observations' && <ObservationsView rows={rows} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onExport={exportCsv} selected={selected} setSelected={setSelected} onAnchor={() => { setAnchorOpen(true); setTxState({ phase: 'idle' }) }}/ >}
      {view === 'contracts' && <ContractsView latest={latest} isConnected={isConnected} chainId={chainId} txState={txState} anchorCount={anchors.length} onAnchor={() => { setAnchorOpen(true); setTxState({ phase: 'idle' }) }} onCopy={() => void copyAddress()} copied={copied}/>}
      {selected && view !== 'observations' && <Inspector sample={selected} onClose={() => setSelected(null)}/>}
    </section>
    {anchorOpen && <div className="dialog-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setAnchorOpen(false) }}><section className="anchor-dialog" role="dialog" aria-modal="true" aria-labelledby="anchor-title"><div className="dialog-head"><div><p className="eyebrow">ON-CHAIN EVIDENCE</p><h2 id="anchor-title">Anchor an observation</h2></div><IconButton label="Close" onClick={() => setAnchorOpen(false)}><X size={18}/></IconButton></div><p className="dialog-copy">This writes the submitted incident and source string to SignalAnchor on BOT Chain Testnet. An anchor proves those fields were submitted—not that the underlying observation is true.</p>{!latest && <div className="inline-alert" role="alert"><CircleAlert size={15}/>A successful live sample is required before writing.</div>}{isConnected && chainId !== BOT_CHAIN.id && <div className="chain-warning"><CircleAlert size={15}/><span>Wallet is on chain {chainId ?? 'unknown'}.</span><button onClick={() => void ensureCorrectChain().catch(e => setTxState({ phase: 'error', message: e instanceof Error ? e.message : 'Could not switch network.' }))}>Add / switch network</button></div>}<form onSubmit={submitAnchor}><label htmlFor="incident">Incident or observation<span>Required · max 120 chars</span></label><textarea id="incident" maxLength={120} required value={incident} onChange={e => setIncident(e.target.value)} placeholder="e.g. RPC block age exceeded 20 seconds"/><label htmlFor="source">Source provenance<span>Required · max 240 chars</span></label><input id="source" maxLength={240} required value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder={latest ? `${latest.source} · block ${latest.block.number}` : 'RPC endpoint, block, or source reference'}/><div className="form-context"><span>Contract</span><code>{addressShort(SIGNAL_ANCHOR.address)}</code><span>Latest sampled block</span><code>{latest?.block.number ?? 'Unavailable'}</code></div>{txState.phase !== 'idle' && <div className={`tx-feedback ${txState.phase}`} role="status">{txState.phase === 'simulating' || txState.phase === 'confirming' ? <LoaderCircle size={15} className="spin"/> : txState.phase === 'success' ? <Check size={15}/> : <CircleAlert size={15}/>}<span>{txState.message}{txState.hash && <> <a href={`${BOT_CHAIN.explorerUrl}/tx/${txState.hash}`} target="_blank" rel="noreferrer">View receipt <ExternalLink size={12}/></a></>}</span></div>}<button className="primary-action" type="submit" disabled={!latest || !isConnected || txState.phase === 'simulating' || txState.phase === 'pending' || txState.phase === 'confirming'}>{!isConnected ? 'Connect wallet to continue' : chainId !== BOT_CHAIN.id ? 'Switch to BOT Testnet first' : txState.phase === 'simulating' ? 'Simulating…' : txState.phase === 'pending' ? 'Confirm in wallet…' : txState.phase === 'confirming' ? 'Waiting for receipt…' : 'Simulate & review in wallet'}</button><p className="form-footnote">No action is sent until you approve it in your wallet. The contract call is permissionless; no role is required.</p></form></section></div>}
  </main>
}

function NetworkView({ latest, samples, lastError, probing, loaded, onRefresh, onSelect }: { latest?: NetworkSample; samples: NetworkSample[]; lastError: ProbeError | null; probing: boolean; loaded: boolean; onRefresh: () => void; onSelect: (sample: NetworkSample) => void }) {
  const healthy = !!latest && !lastError && Date.now() - new Date(latest.observedAt).getTime() < SAMPLE_INTERVAL_MS * 2.5
  return <div className="view-content network-view"><div className="view-title-row"><div><h1>Network</h1><p>Read-only observations from one configured BOT Chain RPC endpoint.</p></div><button className="refresh-button" onClick={onRefresh} disabled={probing}><RefreshCw size={15} className={probing ? 'spin' : ''}/>{probing ? 'Sampling…' : 'Sample now'}</button></div>
    <div className="network-strip"><div className="network-state"><span className={`large-led ${healthy ? 'healthy' : lastError ? 'bad' : 'idle'}`}/><div><b>{healthy ? 'Responding' : lastError ? 'Probe failed' : latest ? 'Sample stale' : loaded ? 'Waiting for first sample' : 'Connecting to RPC'}</b><small>{lastError ? lastError.error : latest ? `Block ${latest.block.number.toLocaleString()} observed ${ageLabel(Math.max(0, Math.floor((Date.now() - new Date(latest.observedAt).getTime()) / 1000)))} ago` : 'No successful observation collected yet'}</small></div></div><div className="strip-field"><span>CHAIN</span><b>BOT TESTNET <code>968 / 0x3c8</code></b></div><div className="strip-field"><span>RPC SOURCE</span><b className="mono">rpc.bohr.life</b></div><div className="strip-field"><span>BLOCK TIME</span><b>{latest ? new Date(latest.block.timestamp).toLocaleTimeString() : '—'}</b></div></div>
    <section className="chart-section"><div className="section-heading"><div><h2>Block age & response time</h2><p>Collected samples only · local to this browser · max 60 minutes</p></div><div className="legend"><span><i className="legend-cyan"/>Block age</span><span><i className="legend-grey"/>RPC latency</span></div></div><TimeChart samples={samples} onSelect={onSelect}/><div className="chart-axis-foot"><span>{samples.length ? timeLabel(samples[0].observedAt) : 'WAITING FOR SAMPLE'}</span><span>{samples.length ? `${samples.length} / ${MAX_SAMPLES} samples` : 'HISTORY IS CREATED AS THIS BROWSER COLLECTS READS'}</span><span>{samples.length ? timeLabel(samples.at(-1)!.observedAt) : '—'}</span></div></section>
    <section className="probe-section"><div className="section-heading"><div><h2>RPC observation</h2><p>Request provenance and response timing for the latest sample.</p></div><span className={`status-pill ${healthy ? 'good' : lastError ? 'fail' : 'unknown'}`}>{healthy ? 'HEALTHY' : lastError ? 'FAILED' : 'NO DATA'}</span></div><div className="probe-table-wrap"><table className="data-table"><thead><tr><th>Probe</th><th>Result</th><th>Response</th><th>Observed at</th><th>Source</th><th/></tr></thead><tbody>{latest ? <><tr><td><span className="method-tag">eth_chainId</span></td><td><span className="result-ok"><Check size={13}/>0x3c8</span></td><td>{latest.chain.latencyMs} ms</td><td>{timeLabel(latest.observedAt)}</td><td className="mono">rpc.bohr.life</td><td><IconButton label="Inspect sample provenance" onClick={() => onSelect(latest)}><ArrowUpRight size={15}/></IconButton></td></tr><tr><td><span className="method-tag">eth_getBlockByNumber</span></td><td><span className="result-ok"><Check size={13}/>{latest.block.number.toLocaleString()}</span></td><td>{latest.block.latencyMs} ms</td><td>{timeLabel(latest.observedAt)}</td><td className="mono">{latest.block.hash.slice(0, 12)}…</td><td><IconButton label="Inspect block evidence" onClick={() => onSelect(latest)}><ArrowUpRight size={15}/></IconButton></td></tr><tr><td><span className="method-tag">eth_getCode</span></td><td><span className={latest.contract.codeBytes > 0 ? 'result-ok' : 'result-fail'}>{latest.contract.codeBytes > 0 ? <Check size={13}/> : <CircleAlert size={13}/>} {latest.contract.codeBytes} bytes</span></td><td>{latest.contract.latencyMs} ms</td><td>{timeLabel(latest.observedAt)}</td><td className="mono">SignalAnchor</td><td><IconButton label="Inspect contract evidence" onClick={() => onSelect(latest)}><ArrowUpRight size={15}/></IconButton></td></tr></> : <tr><td colSpan={6} className="table-empty">{lastError ? <span className="error-copy"><CircleAlert size={15}/>{lastError.error}</span> : probing || !loaded ? <span><LoaderCircle size={15} className="spin"/> Waiting for the first RPC response…</span> : 'No successful sample yet. Retry the read or check RPC availability.'}</td></tr>}</tbody></table></div><div className="source-note"><ShieldCheck size={14}/> Source responses are observations, not an independent guarantee of network health. One endpoint is configured.</div></section>
  </div>
}

function TimeChart({ samples, onSelect }: { samples: NetworkSample[]; onSelect: (sample: NetworkSample) => void }) {
  const width = 960, height = 250, left = 50, right = 25, top = 18, bottom = 24
  if (!samples.length) return <div className="chart-empty"><div className="empty-wave"><Activity size={22}/></div><strong>No history collected yet</strong><p>The graph begins after successful RPC samples arrive. Signal never fills gaps with generated history.</p><span>Sampling interval · 15 seconds</span></div>
  const plotW = width-left-right, plotH = height-top-bottom
  const ages = samples.map(s => s.block.ageSeconds), latencies = samples.map(s => s.block.latencyMs)
  const maxAge = Math.max(5, ...ages), maxLatency = Math.max(100, ...latencies)
  const x = (i: number) => samples.length === 1 ? left+plotW : left+(i/(samples.length-1))*plotW
  const ageY = (n: number) => top+plotH-(n/maxAge)*plotH
  const latY = (n: number) => top+plotH-(n/maxLatency)*plotH
  const pathFor = (values: number[], yFn: (n:number)=>number) => values.map((n,i)=>`${i?'L':'M'} ${x(i)} ${yFn(n)}`).join(' ')
  const grid = Array.from({length:4},(_,i)=>top+(plotH/3)*i)
  return <div className="chart-wrap"><svg className="time-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Collected block age and RPC latency across ${samples.length} successful observations`}><defs><linearGradient id="age-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#68d6e8" stopOpacity=".17"/><stop offset="100%" stopColor="#68d6e8" stopOpacity="0"/></linearGradient></defs>{grid.map((y,i)=><g key={y}><line x1={left} y1={y} x2={width-right} y2={y} className="grid-line"/><text x={left-10} y={y+4} textAnchor="end" className="axis-label">{Math.round(maxAge*(3-i)/3)}s</text></g>)}{samples.length>1&&<><path d={`${pathFor(ages,ageY)} L ${x(samples.length-1)} ${top+plotH} L ${x(0)} ${top+plotH} Z`} fill="url(#age-fill)"/><path d={pathFor(ages,ageY)} className="age-line"/><path d={pathFor(latencies,latY)} className="latency-line"/></>}{samples.map((sample,i)=><circle key={sample.observedAt} cx={x(i)} cy={ageY(sample.block.ageSeconds)} r={i===samples.length-1?4:2.5} className={i===samples.length-1?'sample-point newest':'sample-point'} tabIndex={0} role="button" aria-label={`Block ${sample.block.number}, age ${sample.block.ageSeconds} seconds, latency ${sample.block.latencyMs} milliseconds`} onClick={()=>onSelect(sample)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(sample)}}}><title>{`${timeLabel(sample.observedAt)} · age ${sample.block.ageSeconds}s · ${sample.block.latencyMs}ms`}</title></circle>)}</svg><div className="chart-right-scale"><span>{maxLatency} ms</span><span>0 ms</span></div></div>
}

function Inspector({ sample, onClose }: { sample: NetworkSample; onClose: () => void }) {
  return <aside className="inspector" aria-label="Observation inspector"><div className="inspector-head"><div><span className="eyebrow">SAMPLE INSPECTOR</span><h2>Read provenance</h2></div><IconButton label="Close inspector" onClick={onClose}><X size={17}/></IconButton></div><dl className="detail-list"><dt>Request completed</dt><dd>{new Date(sample.observedAt).toLocaleString()}</dd><dt>RPC endpoint</dt><dd className="mono">{sample.source}</dd><dt>Block</dt><dd>{sample.block.number.toLocaleString()}</dd><dt>Block hash</dt><dd className="mono break">{sample.block.hash}</dd><dt>Block timestamp</dt><dd>{new Date(sample.block.timestamp).toLocaleString()}</dd><dt>Block age at read</dt><dd>{ageLabel(sample.block.ageSeconds)}</dd><dt>Latest block latency</dt><dd>{sample.block.latencyMs} ms</dd><dt>Contract code</dt><dd>{sample.contract.codeBytes} bytes</dd></dl><a className="inspector-link" href={`${BOT_CHAIN.explorerUrl}/block/${sample.block.number}`} target="_blank" rel="noreferrer">Open block evidence <ExternalLink size={14}/></a></aside>
}

type ObservationRow = { id: string; kind: 'probe'; time: string; sample: NetworkSample } | { id: string; kind: 'failed'; time: string; failure: ProbeError } | { id: string; kind: 'anchor'; time: string; anchor: LocalAnchor }
function ObservationsView({ rows, search, setSearch, filter, setFilter, onExport, selected, setSelected, onAnchor }: { rows: ObservationRow[]; search: string; setSearch: (s: string)=>void; filter: 'all'|'success'|'failed'|'anchor'; setFilter: (f: 'all'|'success'|'failed'|'anchor')=>void; onExport:()=>void; selected:NetworkSample|null; setSelected:(s:NetworkSample|null)=>void; onAnchor:()=>void }) {
  return <div className="view-content observations-view"><div className="view-title-row"><div><h1>Observations</h1><p>Timestamped RPC samples and wallet-confirmed anchors scoped to this browser, chain, contract, and account.</p></div><button className="secondary-button" onClick={onAnchor}><Fingerprint size={15}/>Anchor sample</button></div><div className="table-tools"><label className="search-control"><Search size={15}/><input aria-label="Search observations" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search blocks, hashes, source…"/><kbd>/</kbd></label><label className="filter-control"><span>TYPE</span><select aria-label="Filter observations" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All records</option><option value="success">RPC samples</option><option value="failed">Failed probes</option><option value="anchor">Anchors</option></select><ChevronDown size={14}/></label><button className="secondary-button export-button" onClick={onExport}><ArrowDownToLine size={15}/>Export CSV</button></div><div className="observation-table-wrap"><table className="data-table observations-table"><thead><tr><th>Time</th><th>Kind / result</th><th>Block / reference</th><th>Block age</th><th>Latency</th><th>Provenance</th><th/></tr></thead><tbody>{rows.map(row=>row.kind==='probe'?<tr key={row.id} onClick={()=>setSelected(row.sample)}><td className="mono">{new Date(row.time).toLocaleString()}</td><td><span className="row-kind success"><Check size={12}/>RPC sample</span></td><td className="mono">{row.sample.block.number.toLocaleString()}</td><td>{ageLabel(row.sample.block.ageSeconds)}</td><td>{row.sample.block.latencyMs} ms</td><td className="mono">{row.sample.source.replace('https://','')}</td><td><ArrowUpRight size={14}/></td></tr>:row.kind==='failed'?<tr className="failed-row" key={row.id}><td className="mono">{new Date(row.time).toLocaleString()}</td><td><span className="row-kind failed"><CircleAlert size={12}/>Probe failed</span></td><td colSpan={4}>{row.failure.error}</td><td/></tr>:<tr key={row.id}><td className="mono">{new Date(row.time).toLocaleString()}</td><td><span className="row-kind anchor"><Fingerprint size={12}/>Anchored</span></td><td className="mono">{row.anchor.blockNumber.toLocaleString()}</td><td>—</td><td>—</td><td className="mono">{row.anchor.account.slice(0,8)} · {row.anchor.hash.slice(0,10)}…</td><td><a href={`${BOT_CHAIN.explorerUrl}/tx/${row.anchor.hash}`} target="_blank" rel="noreferrer" aria-label="Open anchor transaction"><ExternalLink size={14}/></a></td></tr>)}</tbody></table>{!rows.length&&<div className="list-empty"><div><FileSearch size={23}/></div><strong>{search?'No matching observations':'No observations in this view'}</strong><p>{search?'Try a shorter search or clear the filter.':'Successful samples will appear here as this browser collects them. No historical data has been generated.'}</p>{search&&<button onClick={()=>{setSearch('');setFilter('all')}}>Clear search and filter</button>}</div>}</div><p className="local-note"><ShieldCheck size={14}/>Browser-collected samples are stored locally. Anchors are also indexed locally by connected account; chain receipts remain the external record.</p>{selected&&<Inspector sample={selected} onClose={()=>setSelected(null)}/>}</div>
}

function ContractsView({ latest, isConnected, chainId, txState, anchorCount, onAnchor, onCopy, copied }: { latest?:NetworkSample; isConnected:boolean; chainId?:number; txState:{phase:string;message?:string}; anchorCount:number; onAnchor:()=>void; onCopy:()=>void; copied:boolean }) {
  const deployed = (latest?.contract.codeBytes ?? 0)>0 && latest?.contract.product === 'Signal' && latest?.contract.targetChainId === BOT_CHAIN.id
  return <div className="view-content contracts-view"><div className="view-title-row"><div><h1>Contracts</h1><p>Signal’s deployed evidence primitive and the exact boundary of its on-chain behavior.</p></div><a className="secondary-button link-button" href={`${BOT_CHAIN.explorerUrl}/address/${SIGNAL_ANCHOR.address}`} target="_blank" rel="noreferrer">Explorer <ExternalLink size={14}/></a></div><section className="contract-detail"><div className="contract-title"><div className="contract-symbol"><Fingerprint size={21}/></div><div><span className="eyebrow">PROJECT EVIDENCE CONTRACT</span><h2>SignalAnchor</h2></div><span className={`status-pill ${deployed?'good':'unknown'}`}>{deployed?'IDENTITY VERIFIED':'NOT VERIFIED'}</span></div><div className="contract-address-line"><code>{SIGNAL_ANCHOR.address}</code><IconButton label={copied?'Copied':'Copy contract address'} onClick={onCopy}>{copied?<Check size={15}/>:<Copy size={15}/>}</IconButton><a href={`${BOT_CHAIN.explorerUrl}/address/${SIGNAL_ANCHOR.address}`} target="_blank" rel="noreferrer" aria-label="View verified contract on explorer"><ExternalLink size={15}/></a></div><div className="contract-facts"><div><span>NETWORK</span><strong>BOT Chain Testnet · 968</strong></div><div><span>DEPLOYED CODE</span><strong>{latest?`${latest.contract.codeBytes} bytes${deployed?' · present':' · empty'}`:'Awaiting RPC read'}</strong></div><div><span>READ-BACK</span><strong>{latest?timeLabel(latest.observedAt):'Not yet observed'}</strong></div><div><span>LIVE IDENTITY</span><strong>{latest?`${latest.contract.product} · chain ${latest.contract.targetChainId}`:'Not yet read'}</strong></div></div><div className="contract-purpose"><h3>What this contract does</h3><p><code>anchorObservation(bytes32,string,string)</code> emits a timestamped observation ID plus the submitted incident and source text. It is permissionless and does not validate the truth of those strings.</p><div className="event-signature"><span>EVENT</span><code>ObservationAnchored(bytes32 indexed observationId, string incident, string source, uint64 observedAt)</code></div></div><div className="contract-actions"><div><strong>Anchor an observation</strong><small>{!isConnected?'Wallet disconnected — public reads remain available.':chainId!==BOT_CHAIN.id?'Wrong wallet network — switch before simulation.':!latest?'Requires a successful current RPC sample.':'Simulation required; wallet confirmation starts only after your click.'}</small></div><button className="primary-action compact" onClick={onAnchor} disabled={!latest||!isConnected||chainId!==BOT_CHAIN.id}><Fingerprint size={15}/>{!isConnected?'Connect wallet':chainId!==BOT_CHAIN.id?'Switch network':'Review anchor'}</button></div><p className="integrity-note"><ShieldCheck size={15}/>An on-chain anchor proves a commitment was submitted and included. It does not prove that a claimed RPC failure, incident, or business action was true or completed.</p></section><div className="contract-read-grid"><div><span>EXTERNAL ORACLE</span><strong>Not integrated</strong><p>No price oracle or external uptime provider is queried.</p></div><div><span>DATA RETENTION</span><strong>Browser-local samples</strong><p>Sample history is not server-aggregated or shared across users.</p></div><div><span>RPC REDUNDANCY</span><strong>Single endpoint</strong><p>One configured RPC cannot establish independent quorum.</p></div></div>{txState.phase==='error'&&<div className="inline-alert" role="status"><CircleAlert size={14}/>{txState.message}</div>}</div>
}

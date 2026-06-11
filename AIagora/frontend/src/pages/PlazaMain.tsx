import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Controls,
  useNodesState,
  useEdgesState,
  MarkerType,
  Node,
  Edge,
  NodeProps,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

export type Page = 'plaza' | 'goals' | 'approval';

export interface DealRecord {
  id: string;
  ts: number;
  from: string;
  to: string;
  dealId?: string;
  content: Record<string, unknown>;
  affiliateLinks: string[];
  txHash?: string;
}

interface PlazaProps {
  navigate: (page: Page) => void;
  onDeal: (deal: DealRecord) => void;
  pendingDeals: DealRecord[];
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface WsMessage {
  type: string;
  from: string;
  to?: string;
  content?: Record<string, unknown>;
  dealId?: string;
}

interface FeedEntry {
  id: string;
  ts: number;
  text: string;
  color: string;
  icon: string;
}

interface Particle {
  id: string;
  x: number;
  y: number;
}

interface AgentNodeData {
  label: string;
  active: boolean;
  highlighted: boolean;
  dealCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const HUB_URL     = 'ws://localhost:4001/hivagora/hub?token=plaza-monitor-token';
const STATS_URL   = 'http://localhost:4001/plaza/stats';
const EDGE_TTL    = 4000;
const HL_DURATION = 1500;
const GOLDEN      = 2.399963229; // golden angle in radians

// ── Helpers ────────────────────────────────────────────────────────────────────

function spiralPos(index: number): { x: number; y: number } {
  if (index === 0) return { x: 480, y: 320 };
  const ring   = Math.floor((index - 1) / 8) + 1;
  const radius = 170 * ring;
  const angle  = index * GOLDEN;
  return { x: 480 + radius * Math.cos(angle), y: 320 + radius * Math.sin(angle) };
}

function shortDid(did: string): string {
  if (!did || did === 'hub') return 'hub';
  const addr = did.startsWith('did:hivagora:') ? did.slice(13) : did;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

const EDGE_COLORS: Record<string, string> = {
  negotiate: '#3b82f6', accept: '#10b981', reject: '#ef4444',
  direct: '#a855f7',    broadcast: '#f59e0b',
};
const FEED_ICONS: Record<string, string> = {
  negotiate: '↔', accept: '✓', reject: '✗', direct: '→',
  broadcast: '◉', presence: '⟳', deal: '💰', onchain: '⛓', system: '◆',
};
const FEED_COLORS: Record<string, string> = {
  negotiate: '#3b82f6', accept: '#10b981', reject: '#ef4444',
  direct: '#a855f7',    broadcast: '#f59e0b', presence: '#22d3ee',
  deal: '#fbbf24',      onchain: '#fb923c',   system: '#64748b',
};

// ── Custom Agent Node ──────────────────────────────────────────────────────────

function AgentNode({ data }: NodeProps<AgentNodeData>) {
  const border = data.highlighted
    ? '2px solid #3b82f6'
    : data.active
    ? '2px solid #10b981'
    : '2px solid #334155';
  const glow = data.highlighted
    ? '0 0 20px rgba(59,130,246,0.7), 0 2px 8px rgba(0,0,0,0.5)'
    : '0 2px 8px rgba(0,0,0,0.4)';
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 12, background: '#1e293b',
      color: '#f8fafc', border, minWidth: 110, textAlign: 'center',
      fontSize: 11, fontWeight: 700, boxShadow: glow,
      transition: 'border 0.25s, box-shadow 0.25s', userSelect: 'none',
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>🤖</div>
      <div style={{ color: '#e2e8f0' }}>{data.label}</div>
      {data.highlighted && (
        <div style={{ fontSize: 9, color: '#93c5fd', marginTop: 3, letterSpacing: 1 }}>
          ● API CALL
        </div>
      )}
      {data.dealCount > 0 && (
        <div style={{ fontSize: 9, color: '#fbbf24', marginTop: 1 }}>
          {data.dealCount} deal{data.dealCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// IMPORTANT: nodeTypes must be defined outside component to avoid React Flow
// resetting node registrations on every render
const nodeTypes: NodeTypes = { agent: AgentNode };

// ── Honeycomb SVG Background ───────────────────────────────────────────────────

function HoneycombBg() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hc-pat" x="0" y="0" width="56" height="100" patternUnits="userSpaceOnUse">
          <path
            d="M28 66L0 50V16L28 0l28 16v34L28 66zM0 50L28 66l28-16"
            fill="none" stroke="#162032" strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#0a0f1a" />
      <rect width="100%" height="100%" fill="url(#hc-pat)" />
    </svg>
  );
}

// ── Plaza Main ────────────────────────────────────────────────────────────────

export default function PlazaMain({ navigate, onDeal, pendingDeals }: PlazaProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [feed, setFeed]           = useState<FeedEntry[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tps, setTps]             = useState(0);
  const [dealCount, setDealCount] = useState(0);

  // Stable refs
  const posMap       = useRef(new Map<string, { x: number; y: number }>());
  const agentIdx     = useRef(0);
  const hlTimers     = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const msgTs        = useRef<number[]>([]);
  const dealsTotal   = useRef(0);
  const handleRef    = useRef<(m: WsMessage) => void>(() => {});
  const onDealRef    = useRef(onDeal);
  onDealRef.current  = onDeal;

  // ── Feed ────────────────────────────────────────────────────────
  const addFeed = useCallback((type: string, text: string) => {
    setFeed(f => [{
      id: `${Date.now()}-${Math.random()}`,
      ts: Date.now(),
      text,
      color: FEED_COLORS[type] ?? '#64748b',
      icon: FEED_ICONS[type]  ?? '·',
    }, ...f].slice(0, 60));
  }, []);

  // ── Ensure node exists ──────────────────────────────────────────
  const ensureNode = useCallback((did: string) => {
    setNodes(nds => {
      if (nds.find(n => n.id === did)) return nds;
      const pos = posMap.current.get(did) ?? spiralPos(agentIdx.current++);
      posMap.current.set(did, pos);
      const n: Node<AgentNodeData> = {
        id: did, type: 'agent', position: pos,
        data: { label: shortDid(did), active: true, highlighted: false, dealCount: 0 },
      };
      return [...nds, n];
    });
  }, [setNodes]);

  // ── Highlight node (API call indicator) ────────────────────────
  const highlightNode = useCallback((did: string) => {
    setNodes(nds => nds.map(n =>
      n.id === did ? { ...n, data: { ...n.data, highlighted: true } } : n
    ));
    const prev = hlTimers.current.get(did);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      setNodes(nds => nds.map(n =>
        n.id === did ? { ...n, data: { ...n.data, highlighted: false } } : n
      ));
      hlTimers.current.delete(did);
    }, HL_DURATION);
    hlTimers.current.set(did, t);
  }, [setNodes]);

  // ── Animated edge (auto-removes after TTL) ──────────────────────
  const addEdge_ = useCallback((from: string, to: string, type: string) => {
    const id    = `e-${from}-${to}-${Date.now()}`;
    const color = EDGE_COLORS[type] ?? '#64748b';
    const e: Edge = {
      id, source: from, target: to,
      animated: type !== 'reject',
      label: type,
      style: { stroke: color, strokeWidth: type === 'accept' ? 3 : 2 },
      labelStyle: { fill: '#e2e8f0', fontWeight: 700, fontSize: 10 },
      labelBgStyle: { fill: 'rgba(15,23,42,0.9)' },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
    setEdges(eds => [...eds, e]);
    setTimeout(() => setEdges(eds => eds.filter(x => x.id !== id)), EDGE_TTL);
  }, [setEdges]);

  // ── 💰 Coin burst ───────────────────────────────────────────────
  const spawnCoins = useCallback((cx: number, cy: number) => {
    const n = 4 + Math.floor(Math.random() * 5);
    const ps: Particle[] = Array.from({ length: n }, (_, i) => ({
      id: `c-${Date.now()}-${i}`,
      x: cx + (Math.random() - 0.5) * 260,
      y: cy + (Math.random() - 0.5) * 140,
    }));
    setParticles(prev => [...prev, ...ps]);
    const ids = new Set(ps.map(p => p.id));
    setTimeout(() => setParticles(prev => prev.filter(p => !ids.has(p.id))), 1800);
  }, []);

  // ── Message handler (always up-to-date via ref) ────────────────
  handleRef.current = (msg: WsMessage) => {
    msgTs.current.push(Date.now());
    const { type, from, to, content } = msg;

    // Hub system messages
    if (!from || from === 'hub') {
      const c = content ?? {};
      if (c.type === 'presence') {
        const did = c.did as string;
        if (c.status === 'join') {
          ensureNode(did);
          addFeed('presence', `🟢 ${shortDid(did)} joined`);
        } else {
          setNodes(nds => nds.map(n =>
            n.id === did ? { ...n, data: { ...n.data, active: false } } : n
          ));
          addFeed('presence', `⚪ ${shortDid(did)} left`);
        }
      }
      return;
    }

    ensureNode(from);
    if (to && to !== 'hub') ensureNode(to);

    switch (type) {
      case 'broadcast':
        highlightNode(from);
        addFeed('broadcast', `${shortDid(from)} → all`);
        break;

      case 'negotiate':
        if (to) {
          addEdge_(from, to, 'negotiate');
          highlightNode(from);
          addFeed('negotiate', `${shortDid(from)} ↔ ${shortDid(to)}`);
        }
        break;

      case 'accept': {
        if (to) {
          addEdge_(from, to, 'accept');
          dealsTotal.current += 1;
          setDealCount(dealsTotal.current);
          setNodes(nds => nds.map(n => {
            if (n.id !== from && n.id !== to) return n;
            return { ...n, data: { ...n.data, dealCount: (n.data.dealCount ?? 0) + 1 } };
          }));

          const c    = content ?? {};
          const links = (c.affiliateLinks as string[]) ?? [];
          const tx    = c.dealHash as string | undefined;
          const hasRevenue = links.length > 0 || tx || c.deal;

          if (hasRevenue) {
            spawnCoins(
              window.innerWidth  * (0.3 + Math.random() * 0.4),
              window.innerHeight * (0.3 + Math.random() * 0.4),
            );
            addFeed('deal', `💰 Deal #${dealsTotal.current}: ${shortDid(from)} → ${shortDid(to)}`);
            if (tx) addFeed('onchain', `⛓ ${String(tx).slice(0, 24)}…`);
          } else {
            addFeed('accept', `✓ ${shortDid(from)} accepted → ${shortDid(to)}`);
          }

          // Bubble deal up to App for Approval page
          const record: DealRecord = {
            id: `deal-${dealsTotal.current}-${Date.now()}`,
            ts: Date.now(), from, to,
            dealId: msg.dealId,
            content: c,
            affiliateLinks: links,
            txHash: tx,
          };
          onDealRef.current(record);
        }
        break;
      }

      case 'reject':
        if (to) {
          addEdge_(from, to, 'reject');
          addFeed('reject', `✗ ${shortDid(from)} → ${shortDid(to)}`);
        }
        break;

      case 'direct':
        if (to) {
          addEdge_(from, to, 'direct');
          highlightNode(from);
          addFeed('direct', `${shortDid(from)} ⇒ ${shortDid(to)}`);
        }
        break;

      default: break;
    }
  };

  // ── WebSocket lifecycle ────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;
    const tpsTimer = setInterval(() => {
      const cutoff = Date.now() - 1000;
      msgTs.current = msgTs.current.filter(t => t > cutoff);
      setTps(msgTs.current.length);
    }, 1000);

    function connect() {
      setWsStatus('connecting');
      ws = new WebSocket(HUB_URL);
      ws.onopen  = () => { setWsStatus('connected'); addFeed('system', '⟳ Connected to Hivagora Hub'); };
      ws.onmessage = evt => { try { handleRef.current(JSON.parse(evt.data)); } catch { /**/ } };
      ws.onclose = () => {
        setWsStatus('disconnected');
        addFeed('system', '⚠ Disconnected — retrying in 3s');
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    }
    connect();

    // Fetch initial online agents from REST
    fetch(STATS_URL)
      .then(r => r.json())
      .then((d: { online?: string[] }) => (d.online ?? []).forEach(ensureNode))
      .catch(() => {/* backend offline */});

    return () => {
      ws?.close();
      clearTimeout(retryTimer);
      clearInterval(tpsTimer);
      hlTimers.current.forEach(clearTimeout);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCount = nodes.filter(n => (n.data as AgentNodeData).active).length;
  const dotColor    = { connected: '#10b981', connecting: '#f59e0b', disconnected: '#ef4444' }[wsStatus];

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#0a0f1a' }}>

      {/* ── Background ──────────────────────────────────────────── */}
      <HoneycombBg />

      {/* ── 💰 Coin particles ────────────────────────────────────── */}
      {particles.map(p => (
        <div key={p.id} className="coin-particle" style={{ left: p.x, top: p.y }}>💰</div>
      ))}

      {/* ── Header + Stats (top-left) ─────────────────────────── */}
      <Panel style={{ top: 20, left: 20, width: 264 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{
            fontSize: 17, fontWeight: 900, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #60a5fa, #34d399)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>HIVAGORA PLAZA</span>
          <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>v1.0.0</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 6px ${dotColor}` }} />
          <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
            {wsStatus === 'connected' ? 'Live' : wsStatus}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Agents', value: activeCount, color: '#34d399' },
            { label: 'Deals',  value: dealCount,   color: '#fbbf24' },
            { label: 'TPS',    value: tps,          color: '#60a5fa' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'rgba(30,41,59,0.7)', borderRadius: 10, padding: '8px 4px', textAlign: 'center',
              border: '1px solid rgba(51,65,85,0.5)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', color }}>{value}</div>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(51,65,85,0.4)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{ width: 6, height: 6, background: '#10b981', borderRadius: '50%' }} />
          <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>Polygon Amoy Testnet</span>
        </div>
      </Panel>

      {/* ── Event Feed (top-right) ─────────────────────────────── */}
      <Panel style={{ top: 20, right: 20, width: 300, height: 410, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>Event Feed</span>
          <span style={{
            fontSize: 9, color: '#10b981', fontFamily: 'monospace',
            background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4,
            border: '1px solid rgba(16,185,129,0.3)',
          }}>LIVE</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {feed.length === 0
            ? <div style={{ textAlign: 'center', marginTop: 60, fontSize: 11, color: '#475569' }}>Waiting for agents…</div>
            : feed.map(e => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10,
                fontFamily: 'monospace', padding: '4px 0',
                borderBottom: '1px solid rgba(30,41,59,0.5)',
              }}>
                <span style={{ color: e.color, flexShrink: 0, fontSize: 11 }}>{e.icon}</span>
                <span style={{ color: '#cbd5e1', flex: 1, wordBreak: 'break-all' }}>{e.text}</span>
                <span style={{ color: '#334155', flexShrink: 0, fontSize: 9 }}>
                  {new Date(e.ts).toLocaleTimeString('en', { hour12: false }).slice(3)}
                </span>
              </div>
            ))
          }
        </div>
      </Panel>

      {/* ── Bottom navigation ────────────────────────────────────── */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Btn primary onClick={() => navigate('goals')}>+ Set Goal</Btn>
        <Btn
          highlight={pendingDeals.length > 0}
          onClick={() => navigate('approval')}
        >
          Approvals{pendingDeals.length > 0 ? ` (${pendingDeals.length})` : ''}
        </Btn>
        <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>
          ws://localhost:4001
        </span>
      </div>

      {/* ── React Flow canvas ────────────────────────────────────── */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.35 }}
          minZoom={0.25}
          maxZoom={2.5}
        >
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

// ── Tiny shared UI atoms ───────────────────────────────────────────────────────

function Panel({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 20,
      background: 'rgba(15,23,42,0.96)',
      border: '1px solid rgba(51,65,85,0.8)',
      borderRadius: 16, padding: '16px 18px',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 4px 32px rgba(0,0,0,0.55)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Btn({
  children, onClick, primary, highlight,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  highlight?: boolean;
}) {
  const base: React.CSSProperties = {
    padding: '8px 16px', border: 'none', borderRadius: 10, fontSize: 12,
    fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
  };
  if (primary) {
    return (
      <button
        style={{ ...base, background: '#2563eb', color: '#fff', boxShadow: '0 2px 12px rgba(37,99,235,0.4)' }}
        onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3b82f6'; }}
        onMouseOut ={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2563eb'; }}
        onClick={onClick}
      >{children}</button>
    );
  }
  return (
    <button
      style={{
        ...base,
        background: highlight ? 'rgba(251,191,36,0.15)' : 'rgba(30,41,59,0.8)',
        color: highlight ? '#fbbf24' : '#94a3b8',
        border: `1px solid ${highlight ? 'rgba(251,191,36,0.4)' : 'rgba(51,65,85,0.6)'}`,
      }}
      onClick={onClick}
    >{children}</button>
  );
}

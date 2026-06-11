import React, { useState } from 'react';
import { type Page, type DealRecord } from './PlazaMain';

interface ApprovalProps {
  navigate: (page: Page) => void;
  deals: DealRecord[];
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
}

const AMOY_EXPLORER = 'https://amoy.polygonscan.com/tx/';
const AUTO_APPROVE_THRESHOLD = 100_000;

function shortAddr(s: string) {
  if (!s) return '—';
  const addr = s.startsWith('did:hivagora:') ? s.slice(13) : s;
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function Approval({ navigate, deals, onApprove, onReject }: ApprovalProps) {
  const [autoApprove, setAutoApprove] = useState(false);
  const [approved, setApproved]       = useState<Record<string, boolean>>({});
  const [rejected, setRejected]       = useState<Record<string, boolean>>({});

  const handleApprove = (id: string) => {
    setApproved(prev => ({ ...prev, [id]: true }));
    onApprove(id);
  };

  const handleReject = (id: string) => {
    setRejected(prev => ({ ...prev, [id]: true }));
    onReject(id);
  };

  const pendingDeals = deals.filter(d => !approved[d.id] && !rejected[d.id]);

  // Auto-approve small deals when toggle is on
  React.useEffect(() => {
    if (!autoApprove) return;
    pendingDeals.forEach(d => {
      const amount = (d.content?.total as number) ?? (d.content?.price as number) ?? 0;
      if (amount > 0 && amount < AUTO_APPROVE_THRESHOLD) handleApprove(d.id);
    });
  }, [autoApprove, deals]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      width: '100vw', height: '100vh', overflowY: 'auto',
      background: '#0a0f1a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <button
              onClick={() => navigate('plaza')}
              style={{
                background: 'transparent', border: 'none', color: '#64748b',
                fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10, display: 'block',
              }}
            >
              ← Back to Plaza
            </button>
            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #60a5fa, #34d399)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Deal Approvals
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>
              {pendingDeals.length > 0
                ? `${pendingDeals.length}건의 딜이 승인을 기다리고 있습니다.`
                : '처리할 딜이 없습니다.'}
            </p>
          </div>

          {/* Auto-approve toggle */}
          <div style={{
            background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(51,65,85,0.7)',
            borderRadius: 14, padding: '14px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
              ₩{(AUTO_APPROVE_THRESHOLD / 1000).toFixed(0)}K 이하 자동 승인
            </div>
            <button
              onClick={() => setAutoApprove(v => !v)}
              style={{
                width: 48, height: 26, borderRadius: 13, border: 'none',
                background: autoApprove ? '#059669' : '#334155',
                cursor: 'pointer', transition: 'background 0.2s', position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 3, left: autoApprove ? 24 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
            <div style={{ fontSize: 10, color: autoApprove ? '#34d399' : '#475569', marginTop: 6 }}>
              {autoApprove ? 'ON' : 'OFF'}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {deals.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            color: '#475569', fontSize: 14,
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <p style={{ margin: 0, fontWeight: 600 }}>아직 완료된 딜이 없습니다.</p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#334155' }}>
              에이전트들이 협상을 완료하면 여기에 표시됩니다.
            </p>
            <button
              onClick={() => navigate('plaza')}
              style={{
                marginTop: 24, padding: '10px 24px',
                background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                color: '#93c5fd', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Plaza 모니터링 →
            </button>
          </div>
        )}

        {/* Deal cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {deals.map(deal => {
            const isApproved = !!approved[deal.id];
            const isRejected = !!rejected[deal.id];
            const isPending  = !isApproved && !isRejected;
            const amount = (deal.content?.total as number)
              ?? (deal.content?.price as number)
              ?? 0;

            return (
              <div
                key={deal.id}
                style={{
                  background: 'rgba(15,23,42,0.96)',
                  border: `1px solid ${isApproved ? 'rgba(16,185,129,0.4)' : isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(51,65,85,0.7)'}`,
                  borderRadius: 16, padding: '20px 22px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  opacity: isPending ? 1 : 0.6,
                  transition: 'all 0.25s',
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        color: isApproved ? '#10b981' : isRejected ? '#ef4444' : '#fbbf24',
                        background: isApproved ? 'rgba(16,185,129,0.1)' : isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(251,191,36,0.1)',
                        padding: '2px 8px', borderRadius: 20,
                        border: `1px solid ${isApproved ? 'rgba(16,185,129,0.3)' : isRejected ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.3)'}`,
                      }}>
                        {isApproved ? '✓ Approved' : isRejected ? '✗ Rejected' : '⏳ Pending'}
                      </span>
                      {amount > 0 && amount < AUTO_APPROVE_THRESHOLD && (
                        <span style={{ fontSize: 9, color: '#34d399', background: 'rgba(16,185,129,0.08)', padding: '2px 6px', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
                          자동승인 대상
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                      #{deal.id.slice(-12)} · {timeAgo(deal.ts)}
                    </div>
                  </div>
                  {amount > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                        ₩{amount.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Agents */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12 }}>
                  <span style={{ color: '#60a5fa', fontFamily: 'monospace' }}>{shortAddr(deal.from)}</span>
                  <span style={{ color: '#334155' }}>→</span>
                  <span style={{ color: '#34d399', fontFamily: 'monospace' }}>{shortAddr(deal.to)}</span>
                </div>

                {/* Content summary */}
                {deal.content && Object.keys(deal.content).length > 0 && (
                  <div style={{
                    background: 'rgba(10,15,26,0.7)', border: '1px solid rgba(30,41,59,0.8)',
                    borderRadius: 10, padding: '10px 14px', marginBottom: 14,
                    fontSize: 11, fontFamily: 'monospace', color: '#94a3b8',
                    maxHeight: 80, overflowY: 'auto',
                  }}>
                    {JSON.stringify(deal.content, null, 2).slice(0, 300)}
                    {JSON.stringify(deal.content).length > 300 ? '…' : ''}
                  </div>
                )}

                {/* Affiliate links */}
                {deal.affiliateLinks.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                      💰 Affiliate Links
                    </div>
                    {deal.affiliateLinks.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'block', fontSize: 11, color: '#60a5fa',
                          fontFamily: 'monospace', marginBottom: 3,
                          textDecoration: 'none', wordBreak: 'break-all',
                        }}
                        onMouseOver={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                        onMouseOut={e  => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                      >
                        🔗 {link.slice(0, 60)}{link.length > 60 ? '…' : ''}
                      </a>
                    ))}
                  </div>
                )}

                {/* Polygon Amoy explorer link */}
                {deal.txHash && (
                  <div style={{ marginBottom: 14 }}>
                    <a
                      href={`${AMOY_EXPLORER}${deal.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 11, color: '#a78bfa', textDecoration: 'none',
                        fontFamily: 'monospace',
                      }}
                      onMouseOver={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                      onMouseOut={e  => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                    >
                      ⛓ Polygon Amoy Explorer: {String(deal.txHash).slice(0, 20)}…
                    </a>
                  </div>
                )}

                {/* Actions */}
                {isPending && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleApprove(deal.id)}
                      style={{
                        flex: 1, padding: '10px 0',
                        background: 'linear-gradient(135deg, #059669, #047857)',
                        border: 'none', borderRadius: 10, color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 2px 12px rgba(5,150,105,0.3)',
                      }}
                    >
                      ✓ 승인
                    </button>
                    <button
                      onClick={() => handleReject(deal.id)}
                      style={{
                        flex: 1, padding: '10px 0',
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 10, color: '#f87171',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      ✗ 거절
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

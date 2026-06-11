import React, { useState } from 'react';
import { type Page } from './PlazaMain';

interface GoalSetterProps {
  navigate: (page: Page) => void;
}

const EXAMPLES = [
  { label: '도쿄 3박 여행 💴', goal: '도쿄 3박 여행 계획해줘', budget: 1_000_000 },
  { label: '아이폰15 중고 📱', goal: '아이폰15 50만원 이하 중고로 구해줘', budget: 500_000 },
  { label: '혼밥 맛집 3곳 🍜', goal: '이번 주 저녁 혼밥 맛집 3곳 추천해줘', budget: 50_000 },
];

function formatKrw(n: number) {
  return n >= 1_000_000
    ? `₩${(n / 1_000_000).toFixed(1)}M`
    : `₩${(n / 1_000).toFixed(0)}K`;
}

type Status = 'idle' | 'submitting' | 'done';

export default function GoalSetter({ navigate }: GoalSetterProps) {
  const [goal,     setGoal]     = useState('');
  const [budget,   setBudget]   = useState(1_000_000);
  const [deadline, setDeadline] = useState('');
  const [status,   setStatus]   = useState<Status>('idle');
  const [agentLog, setAgentLog] = useState<string[]>([]);

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    setStatus('submitting');
    setAgentLog([]);

    // Simulate agent assignment log (backend would push these via WS in production)
    const steps = [
      '📡 목표 분석 중…',
      '🤖 TravelPlanner 에이전트 할당',
      '🤖 FlightAgent, HotelAgent 활성화',
      '🔗 WebSocket 채널 개방',
      '✅ 에이전트들이 자율 협상을 시작했습니다',
    ];
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 350 + i * 200));
      setAgentLog(prev => [...prev, steps[i]]);
    }

    // Attempt to POST to backend (non-blocking)
    fetch('http://localhost:4001/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: goal.trim(), budget, deadline }),
    }).catch(() => {/* backend may be offline */});

    setStatus('done');
  };

  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#0a0f1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>

      {/* Back button */}
      <button
        onClick={() => navigate('plaza')}
        style={{
          position: 'fixed', top: 20, left: 20,
          background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.6)',
          color: '#94a3b8', borderRadius: 10, padding: '8px 16px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}
      >
        ← Plaza
      </button>

      <div style={{
        width: '100%', maxWidth: 540,
        background: 'rgba(15,23,42,0.96)',
        border: '1px solid rgba(51,65,85,0.7)',
        borderRadius: 20, padding: 36,
        boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
      }}>
        {/* Title */}
        <h1 style={{
          margin: '0 0 6px', fontSize: 24, fontWeight: 900, letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #60a5fa, #34d399)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          목표 설정
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#64748b' }}>
          자연어로 목표를 입력하세요. AI 에이전트들이 자율적으로 처리합니다.
        </p>

        {status !== 'done' ? (
          <>
            {/* Quick examples */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => { setGoal(ex.goal); setBudget(ex.budget); }}
                  style={{
                    padding: '5px 12px', background: 'rgba(37,99,235,0.12)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    color: '#93c5fd', borderRadius: 20, fontSize: 11,
                    fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.25)'; }}
                  onMouseOut={e  => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,99,235,0.12)'; }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {/* Goal input */}
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="예: 도쿄 3박 여행 100만원 이하로 계획해줘"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.7)',
                borderRadius: 12, padding: '14px 16px',
                color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit',
                resize: 'none', outline: 'none',
                transition: 'border 0.2s',
              }}
              onFocus={e  => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.6)'; }}
              onBlur={e   => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(51,65,85,0.7)'; }}
            />

            {/* Budget slider */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>예산</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#fbbf24', fontFamily: 'monospace' }}>
                  {formatKrw(budget)}
                </span>
              </div>
              <input
                type="range" min={50_000} max={5_000_000} step={50_000}
                value={budget} onChange={e => setBudget(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 4 }}>
                <span>₩50K</span><span>₩5M</span>
              </div>
            </div>

            {/* Deadline */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
                마감일 (선택)
              </div>
              <input
                type="date" value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{
                  background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(51,65,85,0.7)',
                  borderRadius: 10, padding: '10px 14px', color: '#e2e8f0',
                  fontSize: 13, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                  colorScheme: 'dark',
                }}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!goal.trim() || status === 'submitting'}
              style={{
                width: '100%', marginTop: 24, padding: '14px 0',
                background: !goal.trim() || status === 'submitting'
                  ? 'rgba(37,99,235,0.3)' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none', borderRadius: 12, color: '#fff',
                fontSize: 15, fontWeight: 900, letterSpacing: '-0.3px',
                cursor: !goal.trim() || status === 'submitting' ? 'not-allowed' : 'pointer',
                boxShadow: goal.trim() ? '0 4px 20px rgba(37,99,235,0.4)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {status === 'submitting' ? '에이전트 배정 중…' : 'Hivagora에 맡기기 🚀'}
            </button>
          </>
        ) : (
          /* ── Done state ─────────────────────────────────────────── */
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0', margin: '0 0 10px' }}>
              에이전트들이 목표를 수신했습니다!
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>
              "{goal.trim()}"<br />
              예산: {formatKrw(budget)}
            </p>

            {/* Agent log */}
            <div style={{
              background: 'rgba(10,15,26,0.8)', border: '1px solid rgba(30,41,59,0.8)',
              borderRadius: 10, padding: '12px 16px', textAlign: 'left', marginBottom: 24,
            }}>
              {agentLog.map((line, i) => (
                <div key={i} style={{
                  fontSize: 11, fontFamily: 'monospace', color: '#34d399',
                  padding: '3px 0', borderBottom: i < agentLog.length - 1 ? '1px solid rgba(30,41,59,0.5)' : 'none',
                }}>
                  {line}
                </div>
              ))}
            </div>

            <button
              onClick={() => navigate('plaza')}
              style={{
                padding: '12px 28px',
                background: 'linear-gradient(135deg, #059669, #047857)',
                border: 'none', borderRadius: 12, color: '#fff',
                fontSize: 14, fontWeight: 900, cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(5,150,105,0.4)',
              }}
            >
              Plaza에서 협상 모니터링 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

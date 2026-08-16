import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect, useRef, useState } from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 지속 시간 토큰 행 (클릭해서 애니메이션 데모)
function DurationRow({ token, desc, ease = '--ease-smooth-out' }: { token: string; desc: string; ease?: string }) {
  const [active, setActive] = useState(false);
  const duration = useTokenValue(token);
  const easeValue = useTokenValue(ease);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      {/* 애니메이션 데모 박스 */}
      <div style={{ width: 120, height: 32, position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: active ? 72 : 0,
            top: 0,
            width: 32,
            height: 32,
            background: 'var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            transition: `left var(${token}) var(${ease})`,
          }}
        />
      </div>
      {/* 재생 버튼 */}
      <button
        onClick={() => { setActive(a => !a); }}
        style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          background: 'var(--color-surface)', color: 'var(--color-text)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        }}
      >
        ▶ 토글
      </button>
      {/* 토큰 정보 */}
      <div>
        <code style={{ fontSize: 12, color: 'var(--color-primary)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{duration || '—'} — {desc}</span>
      </div>
    </div>
  );
}

// easing 시각화
function EaseRow({ token, desc }: { token: string; desc: string }) {
  const value = useTokenValue(token);
  const [playing, setPlaying] = useState(false);
  const [x, setX] = useState(0);
  const rafRef = useRef<number>(0);

  const play = () => {
    setX(0);
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing) return;
    let start: number | null = null;
    const duration = 400;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setX(progress * 80);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ width: 120, height: 32, position: 'relative', flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 32,
            height: 32,
            background: 'var(--color-secondary)',
            borderRadius: 'var(--radius-sm)',
            transition: playing ? `left 400ms var(${token})` : 'none',
          }}
        />
      </div>
      <button
        onClick={play}
        style={{
          padding: '4px 10px', fontSize: 11, cursor: 'pointer',
          background: 'var(--color-surface)', color: 'var(--color-text)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        }}
      >
        ▶ 재생
      </button>
      <div>
        <code style={{ fontSize: 12, color: 'var(--color-primary)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{value || '—'} — {desc}</span>
      </div>
    </div>
  );
}

function ScaleRow({ token, desc }: { token: string; desc: string }) {
  const [pressed, setPressed] = useState(false);
  const value = useTokenValue(token);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        style={{
          width: 72, height: 40,
          background: 'var(--color-primary)',
          borderRadius: 'var(--radius-pill)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          transform: pressed ? `scale(var(${token}))` : 'scale(1)',
          transition: `transform var(--duration-micro) var(--ease-out)`,
          color: 'white', fontSize: 12,
        }}
      >
        눌러봐
      </div>
      <div>
        <code style={{ fontSize: 12, color: 'var(--color-primary)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{value || '—'} — {desc}</span>
      </div>
    </div>
  );
}

function MotionPage() {
  return (
    <div style={{ padding: 32, background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Motion Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        MODULAR 모션 시스템. <strong>▶ 토글 / 재생</strong> 버튼으로 실제 애니메이션을 확인할 수 있다.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 40 }}>
        ⚠️ <code style={{ color: 'var(--color-primary)' }}>prefers-reduced-motion</code>이 활성화된 경우 globals.css에 의해 모든 애니메이션이 0.01ms로 단축된다.
      </p>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
          Duration
        </h2>
        <DurationRow token="--duration-micro" desc="즉각 피드백 — 버튼 press, 즉시 열기/닫기" />
        <DurationRow token="--duration-quick" desc="빠른 피드백 — hover, 소형 전환" />
        <DurationRow token="--duration-fast" desc="일반 전환 — 대부분의 UI 상호작용" />
        <DurationRow token="--duration-medium" desc="중형 전환 — 모달 열기, 탭 전환" />
        <DurationRow token="--duration-slow" desc="느린 전환 — 페이지 진입, 스플래시" />
      </div>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
          Easing
        </h2>
        <EaseRow token="--ease-linear" desc="선형 — 스피너, 시머, 연속 루프" />
        <EaseRow token="--ease-smooth-out" desc="부드럽게 감속 — 일반 UI 전환 기본값" />
        <EaseRow token="--ease-bounce" desc="탄성 — 강조, 팝업, 획득 연출" />
        <EaseRow token="--ease-out" desc="표준 ease-out — 단순 슬라이드인" />
      </div>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
          Scale (press / modal)
        </h2>
        <ScaleRow token="--scale-press" desc="버튼 눌림 — button:active CSS 피드백" />
        <ScaleRow token="--scale-modal" desc="모달 등장 시작 스케일 (100% 에서 시작)" />
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Motion',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllMotion: StoryObj = {
  name: '모든 모션 토큰',
  render: () => <MotionPage />,
};

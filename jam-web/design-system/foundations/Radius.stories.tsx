import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function RadiusCard({ token, desc, usage }: { token: string; desc: string; usage: string }) {
  const value = useTokenValue(token);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      {/* 시각적 프리뷰 */}
      <div
        style={{
          width: 72,
          height: 72,
          background: 'var(--background)',
          border: '2px solid var(--link)',
          borderRadius: `var(${token})`,
          flexShrink: 0,
        }}
      />
      {/* 정보 */}
      <div style={{ flex: 1 }}>
        <code style={{ fontSize: 13, color: 'var(--link)', display: 'block', marginBottom: 2 }}>{token}</code>
        <span style={{ fontSize: 12, color: 'var(--foreground)', display: 'block' }}>{value || '—'} — {desc}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>사용처: {usage}</span>
      </div>
    </div>
  );
}

function RadiusPage() {
  return (
    <div style={{ padding: 32, background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Radius Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40 }}>
        단조 4단계 스케일: xs &lt; sm &lt; card &lt; pill.
        v2에서 card를 10px → 16px로 올려 단조성을 확보했다.
      </p>

      <RadiusCard token="--radius-sm" desc="4px — 아주 미세한 둥글기" usage="구분선 끝, 내부 썸네일" />
      <RadiusCard token="--radius-lg" desc="8px — 소형 컴포넌트" usage="입력 필드, 소형 칩 (alias: --field-radius)" />
      <RadiusCard token="--radius-2xl" desc="16px — 카드 surface" usage="Card 컴포넌트 (v2: 10→16px)" />
      <RadiusCard token="--radius-full" desc="9999px — 완전한 캡슐" usage="버튼, ShapeTag (alias: --radius-full/buttons/nav-buttons)" />

      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          Backward-compat Aliases
        </h2>
        {[
          ['--radius-sm', '--radius-sm', '기존 컴포넌트 하위호환'],
          ['--field-radius', '--radius-lg', '기존 input 하위호환'],
        ].map(([alias, ref, note]) => (
          <div key={alias} style={{ fontSize: 11, marginBottom: 6 }}>
            <code style={{ color: 'var(--muted)' }}>{alias}</code>
            <span style={{ color: 'var(--muted)' }}> = var({ref}) — {note} ({useTokenValue(alias)})</span>
          </div>
        ))}
      </div>

      {/* 시각적 비교 */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          비교 미리보기
        </h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {['--radius-sm', '--radius-lg', '--radius-2xl', '--radius-full'].map(token => (
            <div key={token} style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80,
                background: 'var(--background)',
                border: '1.5px solid var(--link)',
                borderRadius: `var(${token})`,
                marginBottom: 6,
              }} />
              <code style={{ fontSize: 10, color: 'var(--link)', display: 'block' }}>{token}</code>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>{useTokenValue(token)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Radius',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllRadius: StoryObj = {
  name: '모든 반경 토큰',
  render: () => <RadiusPage />,
};

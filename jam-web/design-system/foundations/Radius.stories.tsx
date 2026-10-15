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
        피그마 <code style={{ color: 'var(--link)' }}>dimensions/radius</code>와 같은 눈금(Tailwind 기본 단계).
        클래스에서는 <code style={{ color: 'var(--link)' }}>rounded-2xl</code>·<code style={{ color: 'var(--link)' }}>rounded-full</code>을 쓰고,
        인라인 style·CSS에서는 아래 변수를 참조한다. 이름이 같고 값이 달라진 단계가 있다(옛 sm 8px → 새 sm 4px).
      </p>

      <RadiusCard token="--radius-sm" desc="4px — 아주 미세한 둥글기" usage="구분선 끝, 내부 썸네일 (옛 xs)" />
      <RadiusCard token="--radius-lg" desc="8px — 소형 컴포넌트" usage="소형 칩, 체크박스 (옛 sm)" />
      <RadiusCard token="--radius-2xl" desc="16px — 카드 surface" usage="Card 컴포넌트 (옛 card)" />
      <RadiusCard token="--radius-full" desc="9999px — 완전한 캡슐" usage="버튼, ShapeTag, 탭바 (옛 pill)" />
      <RadiusCard token="--field-radius" desc="100px — 입력창 캡슐 (피그마 field/radius)" usage="Input, Select, Textarea" />

      {/* 시각적 비교 */}
      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 16 }}>
          비교 미리보기
        </h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {['--radius-sm', '--radius-lg', '--radius-2xl', '--radius-full', '--field-radius'].map(token => (
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
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllRadius: StoryObj = {
  name: '모든 반경 토큰',
  render: () => <RadiusPage />,
};

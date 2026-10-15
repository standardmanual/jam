import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function SpacingRow({ token, desc, semantic }: { token: string; desc?: string; semantic?: boolean }) {
  const value = useTokenValue(token);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      {/* 시각적 바 */}
      <div style={{ width: 200, flexShrink: 0 }}>
        <div
          style={{
            height: 20,
            width: `var(${token})`,
            maxWidth: '100%',
            background: semantic ? 'var(--color-secondary)' : 'var(--accent)',
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      </div>
      {/* 토큰 정보 */}
      <div>
        <code style={{ fontSize: 12, color: 'var(--link)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {value || '—'}{desc ? ` — ${desc}` : ''}
        </span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 12px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SpacingPage() {
  return (
    <div style={{ padding: 32, background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Spacing Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40 }}>
        4px 기반 스케일. 레이아웃 semantic 토큰은 스케일 변수를 참조해 전역 조정이 가능하다.
      </p>

      <Section title="Base Scale (4px 배수)">
        <SpacingRow token="--spacing-4" desc="최소 단위 — 아이콘 주변 여백, inline gap" />
        <SpacingRow token="--spacing-8" desc="소형 — 태그 내부, 버튼 아이콘 간격" />
        <SpacingRow token="--spacing-12" desc="컴팩트 — 리스트 아이템 간격" />
        <SpacingRow token="--spacing-16" desc="기본 — 카드 내부 요소 간격" />
        <SpacingRow token="--spacing-24" desc="중형 — 카드 패딩, 섹션 내 간격" />
        <SpacingRow token="--spacing-32" desc="대형 — 주요 섹션 구분" />
        <SpacingRow token="--spacing-48" desc="섹션 간 — 페이지 레벨 구분" />
        <SpacingRow token="--spacing-64" desc="최대 — hero 영역, 페이지 상단 여백" />
      </Section>

      <Section title="Layout Semantic (전역 조정 가능)">
        <SpacingRow token="--layout-card-padding" desc="카드 내부 패딩 = --spacing-24" semantic />
        <SpacingRow token="--layout-section-gap" desc="페이지 섹션 간 간격 = --spacing-48" semantic />
        <SpacingRow token="--layout-element-gap" desc="카드 내 요소 간 간격 = --spacing-16" semantic />
      </Section>

      <Section title="Special">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ width: 44, height: 44, border: '2px dashed var(--link)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--link)' }}>44px</span>
            </div>
          </div>
          <div>
            <code style={{ fontSize: 12, color: 'var(--link)', display: 'block' }}>--touch-target-min</code>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {useTokenValue('--touch-target-min')} — iOS HIG 최소 터치 영역
            </span>
          </div>
        </div>
        <SpacingRow token="--spacing-safe-bottom" desc="iOS 홈 인디케이터 safe area (env())" />
      </Section>

      {/* 실제 사용 예시 */}
      <Section title="사용 예시">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: '카드 패딩', token: '--layout-card-padding' },
            { label: '요소 간격', token: '--layout-element-gap' },
            { label: '섹션 간격', token: '--layout-section-gap' },
          ].map(({ label, token }) => (
            <div
              key={token}
              style={{
                border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-2xl)',
                padding: `var(${token})`,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                {label}<br />
                <code style={{ color: 'var(--link)' }}>{token}</code><br />
                = {useTokenValue(token)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Spacing',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllSpacing: StoryObj = {
  name: '모든 스페이싱 토큰',
  render: () => <SpacingPage />,
};

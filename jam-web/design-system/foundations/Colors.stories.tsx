import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

// CSS 변수 실제 값을 런타임에 읽음 — 하드코딩 금지
function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 색상 토큰 스와치 1개
function Swatch({
  token,
  desc,
  onDark = true,
}: {
  token: string;
  desc: string;
  onDark?: boolean;
}) {
  const value = useTokenValue(token);
  const isTransparent = value.startsWith('rgba') || value === 'transparent';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      {/* 시각적 프리뷰 */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: `var(${token})`,
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.1)',
          backgroundImage: isTransparent
            ? 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%) 0 0 / 12px 12px'
            : undefined,
        }}
      />
      {/* 토큰 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <code style={{ fontSize: 12, color: 'var(--color-primary)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginTop: 2 }}>{value || '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block' }}>{desc}</span>
      </div>
    </div>
  );
}

// 희귀도 페어 (배경 + 텍스트)
function RarityPair({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  const bgVal = useTokenValue(bg);
  const fgVal = useTokenValue(fg);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div
        style={{
          width: 80,
          height: 32,
          borderRadius: 16,
          background: `var(${bg})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: `var(${fg})`, letterSpacing: '0.4px' }}>{label}</span>
      </div>
      <div>
        <code style={{ fontSize: 11, color: 'var(--color-primary)', display: 'block' }}>{bg} → {bgVal || '—'}</code>
        <code style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block' }}>{fg} → {fgVal || '—'}</code>
      </div>
    </div>
  );
}

// 태그 칩
function TagChip({ token }: { token: string }) {
  const value = useTokenValue(token);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ width: 32, height: 16, borderRadius: 9999, background: `var(${token})`, border: '1px solid rgba(255,255,255,0.1)' }} />
      <code style={{ fontSize: 11, color: 'var(--color-primary)' }}>{token}</code>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12, margin: '0 0 12px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ColorsPage() {
  return (
    <div style={{ padding: 32, background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Color Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 40 }}>
        MODULAR 컬러 시스템. 컴포넌트에서는 <code style={{ color: 'var(--color-primary)' }}>--color-base-*</code>를 직접 참조하지 않고
        시맨틱 토큰(<code style={{ color: 'var(--color-primary)' }}>--color-*</code>)만 사용한다.
        실제 값은 CSS 변수에서 동적으로 읽어옴.
      </p>

      <Section title="Semantic — Background">
        <Swatch token="--color-bg" desc="기본 배경 (다크 캔버스)" />
        <Swatch token="--color-bg-tint" desc="미세하게 올라온 배경 — tint Card 등" />
        <Swatch token="--color-bg-inverse" desc="반전 배경 (라이트 surface)" />
        <Swatch token="--color-surface" desc="카드·raised surface" />
        <Swatch token="--color-surface-elevated" desc="20260816_012 — 보더 제거 카드/버튼 배경(--color-surface보다 한 단계 밝음)" />
        <Swatch token="--color-surface-inverse" desc="반전 카드 surface" />
      </Section>

      <Section title="Semantic — Brand">
        <Swatch token="--color-primary" desc="레드-오렌지 — 버튼·활성 강조" />
        <Swatch token="--color-secondary" desc="브라운 — 보조 브랜드" />
      </Section>

      <Section title="Semantic — Text">
        <Swatch token="--color-text" desc="기본 텍스트 (다크 배경 위)" />
        <Swatch token="--color-text-secondary" desc="보조 텍스트 — WCAG AA 4.6:1" />
        <Swatch token="--color-text-on-primary" desc="primary 버튼 위 텍스트" />
        <Swatch token="--color-text-inverse" desc="라이트 surface 위 텍스트" />
      </Section>

      <Section title="Semantic — Border & Overlay">
        <Swatch token="--color-border" desc="구분선 (다크 배경 위)" />
        <Swatch token="--color-icon-inactive" desc="TabBar 비활성 아이콘 (#2a2a2a)" />
        <Swatch token="--color-overlay" desc="모달·시트 백드롭" />
      </Section>

      <Section title="Semantic — Status (20260824_021)">
        <Swatch token="--color-notification-dot" desc="안 읽은 소식 있음 — TopNav 알림 종의 빨간 버블" />
        <Swatch token="--color-warning" desc="경고 상태 — 계정·동기화·인벤토리 소식. 소식 dot과 의미가 달라 색을 가른다" />
      </Section>

      <Section title="Badge Rarity (배경 + 텍스트 쌍)">
        <RarityPair bg="--color-rarity-common" fg="--color-rarity-common-text" label="COMMON" />
        <RarityPair bg="--color-rarity-rare" fg="--color-rarity-rare-text" label="RARE" />
        <RarityPair bg="--color-rarity-legend" fg="--color-rarity-legend-text" label="LEGEND" />
        <RarityPair bg="--color-rarity-mythic" fg="--color-rarity-mythic-text" label="MYTHIC" />
      </Section>

      <Section title="Tag Palette (ShapeTag colorIndex 순환)">
        <TagChip token="--color-tag-1" />
        <TagChip token="--color-tag-2" />
        <TagChip token="--color-tag-3" />
        <TagChip token="--color-tag-4" />
        <TagChip token="--color-tag-5" />
        <TagChip token="--color-tag-6" />
        <TagChip token="--color-tag-7" />
        <TagChip token="--color-tag-8" />
      </Section>

      <Section title="Base Palette (컴포넌트 직접 참조 금지)">
        {[
          ['--color-base-white', '순수 흰색'],
          ['--color-base-black', '순수 검정'],
          ['--color-base-red', '레드-오렌지 원본'],
          ['--color-base-brown', '브라운 원본'],
          ['--color-base-grey-200', 'Grey 200 — 라이트 surface'],
          ['--color-base-grey-500', 'Grey 500 — WCAG AA on black'],
          ['--color-base-grey-600', 'Grey 600'],
          ['--color-base-grey-700', 'Grey 700 — border default'],
          ['--color-base-grey-750', 'Grey 750 — tint elevation'],
          ['--color-base-grey-800', 'Grey 800 — card surface'],
          ['--color-base-amber', '앰버 — legend rarity 원본'],
          ['--color-base-lime', '라임 — tag-6'],
          ['--color-base-charcoal', '차콜 — tag-7'],
          ['--color-base-sienna', '시에나 — tag-8'],
        ].map(([t, d]) => (
          <Swatch key={t} token={t} desc={d} />
        ))}
      </Section>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Colors',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllColors: StoryObj = {
  name: '모든 컬러 토큰',
  render: () => <ColorsPage />,
};

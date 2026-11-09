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
  bar = false,
}: {
  token: string;
  desc: string;
  onDark?: boolean;
  bar?: boolean; // 그라디언트 토큰은 정사각 칸이 아니라 가로 막대로 보여 준다
}) {
  const value = useTokenValue(token);
  const isTransparent = value.startsWith('rgba') || value === 'transparent';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      {/* 시각적 프리뷰 */}
      <div
        style={{
          width: bar ? 120 : 48,
          height: bar ? 12 : 48,
          borderRadius: bar ? 9999 : 8,
          background: `var(${token})`,
          flexShrink: 0,
          border: '1px solid var(--border)',
          backgroundImage: isTransparent
            ? 'repeating-conic-gradient(#888 0% 25%, transparent 0% 50%) 0 0 / 12px 12px'
            : undefined,
        }}
      />
      {/* 토큰 정보 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <code style={{ fontSize: 12, color: 'var(--link)', display: 'block' }}>{token}</code>
        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 2 }}>{value || '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>{desc}</span>
      </div>
    </div>
  );
}

// 희귀도 페어 (배경 + 텍스트)
function RarityPair({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  const bgVal = useTokenValue(bg);
  const fgVal = useTokenValue(fg);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
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
        <span style={{ fontSize: 11, fontWeight: 600, color: `var(${fg})`, }}>{label}</span>
      </div>
      <div>
        <code style={{ fontSize: 11, color: 'var(--link)', display: 'block' }}>{bg} → {bgVal || '—'}</code>
        <code style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>{fg} → {fgVal || '—'}</code>
      </div>
    </div>
  );
}

// 색 견본 칩
function TagChip({ token, note }: { token: string; note?: string }) {
  const value = useTokenValue(token);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ width: 32, height: 16, borderRadius: 9999, background: `var(${token})`, border: '1px solid var(--border)' }} />
      <code style={{ fontSize: 11, color: 'var(--link)' }}>{token}</code>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{value}</span>
      {note && <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {note}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12, margin: '0 0 12px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function ColorsPage() {
  return (
    <div style={{ padding: 32, background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Color Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40 }}>
        JAM 2.0 컬러 시스템(라이트 전용). 컴포넌트에서는 <code style={{ color: 'var(--link)' }}>--base-*</code>를 직접 참조하지 않고
        역할 토큰(<code style={{ color: 'var(--link)' }}>--background</code>, <code style={{ color: 'var(--link)' }}>--foreground</code>,
        <code style={{ color: 'var(--link)' }}>--accent</code> 등)만 사용한다.
        실제 값은 CSS 변수에서 동적으로 읽어옴.
      </p>

      <Section title="Semantic — Background">
        <Swatch token="--background" desc="서비스 열 바탕(흰색)" />
        <Swatch token="--background-secondary" desc="한 단계 어두운 배경 — tint Card 등" />
        <Swatch token="--background-inverse" desc="반전 배경 (검정 계열)" />
        <Swatch token="--surface" desc="시트·모달 등 흰 면(그림자 없음)" />
        <Swatch token="--page-bg" desc="서비스 열(430px) 바깥 바탕 — html·body" />
        <Swatch token="--card-bg" desc="Card default 면. 외곽선 없음, 흰 바탕과 약 1.07:1이라 구분이 약하다" />
        <Swatch token="--btn-secondary" desc="Button secondary·outline 면(둘은 같은 면). 카드 위 연한 면이 필요할 때도 이 값" />
        <Swatch token="--surface-transparent" desc="완전 투명한 바탕색" />
      </Section>

      <Section title="Semantic — Text">
        <Swatch token="--foreground" desc="기본 텍스트" />
        <Swatch token="--muted" desc="보조 텍스트" />
        <Swatch token="--link" desc="링크·포커스 링. 본문 글자와 같은 검정이라 색만으로 링크를 구분하지 않는다" />
        <Swatch token="--snow" desc="반전 면 위 텍스트" />
        <Swatch token="--accent-foreground" desc="accent 면 위 텍스트" />
      </Section>

      <Section title="Semantic — Accent">
        <Swatch token="--accent" desc="주 강조색 — 버튼 같은 면 채우기 전용. 강조 글자는 --link" />
        <Swatch token="--accent-soft" desc="accent의 옅은 면" />
        <Swatch token="--accent-soft-hover" desc="accent-soft의 hover 면" />
      </Section>

      <Section title="강조색 5가지 (정의만 · 사용처 미지정 — 사용자가 따로 지정)">
        <TagChip token="--jam-red" note="사용처 미지정" />
        <TagChip token="--jam-yellow" note="사용처 미지정" />
        <TagChip token="--jam-green" note="사용처 미지정" />
        <TagChip token="--jam-purple" note="사용처 미지정" />
        <TagChip token="--jam-blue" note="사용처 미지정" />
      </Section>

      <Section title="Semantic — Border & Overlay">
        <Swatch token="--border" desc="카드·구분선 테두리" />
        <Swatch token="--field-border" desc="입력창 테두리" />
        <Swatch token="--separator" desc="구분선 (하나로 통합)" />
        <Swatch token="--backdrop" desc="모달·시트 백드롭" />
      </Section>

      <Section title="Semantic — Status">
        <Swatch token="--success" desc="성공·다 채움 (가는 선·점·링)" />
        <Swatch token="--warning" desc="경고·모자람 — 계정·동기화·인벤토리 소식(가는 선·점·링)" />
        <Swatch token="--danger" desc="위험 — 안 읽은 소식 점" />
        <Swatch token="--default" desc="중립 면(#f5f5f5). 카드 면과 거의 같아 트랙에는 --progress-track을 쓴다" />
        <Swatch token="--default-soft" desc="중립 칩 배경" />
      </Section>

      <Section title="Badge Rarity (배경 + 텍스트 쌍)">
        <RarityPair bg="--rarity-common" fg="--rarity-common-foreground" label="COMMON" />
        <RarityPair bg="--rarity-rare" fg="--rarity-rare-foreground" label="RARE" />
        <RarityPair bg="--rarity-epic" fg="--rarity-epic-foreground" label="EPIC" />
        <RarityPair bg="--rarity-mystic" fg="--rarity-mystic-foreground" label="MYSTIC" />
      </Section>

      <Section title="Progress (진행 상태)">
        <Swatch token="--progress-short" desc="모자람(채우는 중) — 선·점·링. 글자로 쓰지 않는다" />
        <Swatch token="--progress-done" desc="다 채움·획득 — 선·점·링. 글자로 쓰지 않는다(다 채움 글자는 --link)" />
        <Swatch token="--progress-latest" desc="방금 들어옴" />
        <Swatch token="--progress-latest-soft" desc="방금 들어옴 — 점의 후광" />
        <Swatch token="--progress-track" desc="아직 손대지 않은 자리(트랙)" />
        <Swatch token="--progress-sweep" desc="채움 스윕 — 트랙 전체에 깔고 잘라 써서 어디까지 넘어갔나가 곧 진행도가 된다" bar />
      </Section>

      <Section title="TabBar">
        <Swatch token="--tabbar-background" desc="탭바 필 — 항상 흰 필" />
        <Swatch token="--tabbar-selection" desc="선택된 탭의 필" />
        <Swatch token="--tabbar-icon" desc="비활성 아이콘" />
        <Swatch token="--tabbar-icon-active" desc="활성 아이콘" />
        <Swatch token="--tabbar-background-inverse" desc="반전 면 — 푸터보다 밝은 불투명 면(snow 22%)" />
        <Swatch token="--tabbar-selection-inverse" desc="반전 상태의 활성 필" />
        <Swatch token="--tabbar-icon-inverse" desc="반전 상태의 비활성 아이콘(활성은 --snow)" />
      </Section>

      <Section title="Base Palette (컴포넌트 직접 참조 금지)">
        {[
          ['--base-white', '순수 흰색'],
          ['--base-snow', 'Snow'],
          ['--base-black', '순수 검정'],
          ['--base-neutral-50', 'Neutral 50'],
          ['--base-neutral-100', 'Neutral 100'],
          ['--base-neutral-200', 'Neutral 200'],
          ['--base-neutral-300', 'Neutral 300'],
          ['--base-neutral-400', 'Neutral 400'],
          ['--base-neutral-500', 'Neutral 500'],
          ['--base-neutral-600', 'Neutral 600'],
          ['--base-neutral-700', 'Neutral 700'],
          ['--base-neutral-800', 'Neutral 800'],
          ['--base-neutral-900', 'Neutral 900 — 글자·반전 배경이 가리키는 검정'],
          ['--base-neutral-950', 'Neutral 950 — 역할 토큰은 가리키지 않음'],
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
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllColors: StoryObj = {
  name: '모든 컬러 토큰',
  render: () => <ColorsPage />,
};

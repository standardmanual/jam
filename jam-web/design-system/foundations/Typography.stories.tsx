import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 타이포 스케일 한 행
function TypeRow({
  label,
  textToken,
  leadingToken,
  weightToken,
  trackingToken,
  sample = '가나다라 ABCDef 123',
}: {
  label: string;
  textToken: string;
  leadingToken: string;
  weightToken: string;
  trackingToken?: string;
  sample?: string;
}) {
  const size = useTokenValue(textToken);
  const leading = useTokenValue(leadingToken);
  const weight = useTokenValue(weightToken);
  const tracking = trackingToken ? useTokenValue(trackingToken) : '0';

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 20, marginBottom: 20 }}>
      {/* 실제 렌더 샘플 */}
      <div
        style={{
          fontSize: `var(${textToken})`,
          lineHeight: `var(${leadingToken})`,
          fontWeight: `var(${weightToken})`,
          letterSpacing: trackingToken ? `var(${trackingToken})` : undefined,
          color: 'var(--color-text)',
          marginBottom: 8,
          wordBreak: 'break-word',
        }}
      >
        {sample}
      </div>
      {/* 토큰 정보 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
        <TokenBadge label="크기" token={textToken} value={size} />
        <TokenBadge label="행간" token={leadingToken} value={leading} />
        <TokenBadge label="굵기" token={weightToken} value={weight} />
        {trackingToken && <TokenBadge label="자간" token={trackingToken} value={tracking} />}
      </div>
    </div>
  );
}

function TokenBadge({ label, token, value }: { label: string; token: string; value: string }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label} </span>
      <code style={{ color: 'var(--color-primary)' }}>{token}</code>
      <span style={{ color: 'var(--color-text-secondary)' }}> = {value || '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 20px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function TypographyPage() {
  return (
    <div style={{ padding: 32, background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)', fontFamily: 'var(--font-family-base)', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Typography Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        각 스케일마다 <code style={{ color: 'var(--color-primary)' }}>--text-*</code> · <code style={{ color: 'var(--color-primary)' }}>--leading-*</code> ·{' '}
        <code style={{ color: 'var(--color-primary)' }}>--weight-*</code> · <code style={{ color: 'var(--color-primary)' }}>--tracking-*</code> 토큰을 함께 적용한다.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 40 }}>
        ⚠️ MODULAR 원본 폰트: Noto Sans KR. 서비스에서는 globals.css가 <code style={{ color: 'var(--color-primary)' }}>--font-family-base</code>를 Pretendard로 재정의.
        현재 적용 폰트: <code style={{ color: 'var(--color-primary)' }}>{useTokenValue('--font-family-base').slice(0, 30)}…</code>
      </p>

      <Section title="Display">
        <TypeRow
          label="Display"
          textToken="--text-display"
          leadingToken="--leading-display"
          weightToken="--weight-display"
          trackingToken="--tracking-display"
          sample="JAM!"
        />
        <TypeRow
          label="Bold Display"
          textToken="--text-bold-display"
          leadingToken="--leading-bold-display"
          weightToken="--weight-bold-display"
          trackingToken="--tracking-bold-display"
          sample="99"
        />
        <TypeRow
          label="Bold LG"
          textToken="--text-bold-lg"
          leadingToken="--leading-bold-lg"
          weightToken="--weight-bold-lg"
          trackingToken="--tracking-bold-lg"
          sample="1,234"
        />
      </Section>

      <Section title="Headings">
        <TypeRow label="H1" textToken="--text-h1" leadingToken="--leading-h1" weightToken="--weight-h1" trackingToken="--tracking-h1" sample="페이지 제목" />
        <TypeRow label="H2" textToken="--text-h2" leadingToken="--leading-h2" weightToken="--weight-h2" trackingToken="--tracking-h2" sample="섹션 제목" />
        <TypeRow label="H3" textToken="--text-h3" leadingToken="--leading-h3" weightToken="--weight-h3" trackingToken="--tracking-h3" sample="카드 제목" />
        <TypeRow label="H4" textToken="--text-h4" leadingToken="--leading-h4" weightToken="--weight-h4" trackingToken="--tracking-h4" sample="서브 카드 제목" />
      </Section>

      <Section title="Body">
        <TypeRow label="Body L" textToken="--text-body-l" leadingToken="--leading-body-l" weightToken="--weight-body-l" sample="본문 대형 — 인트로 텍스트 등" />
        <TypeRow label="Body" textToken="--text-body" leadingToken="--leading-body" weightToken="--weight-body" sample="기본 본문 텍스트. 최소 읽기 편한 크기." />
        <TypeRow label="Small" textToken="--text-small" leadingToken="--leading-small" weightToken="--weight-small" sample="보조 설명, 메타 정보" />
        <TypeRow label="Caption" textToken="--text-caption" leadingToken="--leading-caption" weightToken="--weight-caption" sample="캡션, 타임스탬프, 힌트" />
      </Section>

      <Section title="Label (role-based tracking)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--color-text)' }}>
            BADGE LABEL
          </span>
          <div>
            <code style={{ fontSize: 11, color: 'var(--color-primary)', display: 'block' }}>--tracking-label</code>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
              = {useTokenValue('--tracking-label')} — ShapeTag, RarityBadge 등 대문자 뱃지
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Typography',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllTypography: StoryObj = {
  name: '모든 타이포 스케일',
  render: () => <TypographyPage />,
};

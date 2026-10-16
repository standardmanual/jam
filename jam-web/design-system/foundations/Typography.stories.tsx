import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 타이포 스케일 한 행 — 글자 크기·행간 쌍(--text-N, --text-N--line-height)
function TypeRow({
  step,
  weight = 400,
  sample = '가나다라 ABCDef 123',
}: {
  step: string;
  weight?: number;
  sample?: string;
}) {
  const textToken = `--text-${step}`;
  const leadingToken = `--text-${step}--line-height`;
  const size = useTokenValue(textToken);
  const leading = useTokenValue(leadingToken);

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 20 }}>
      {/* 실제 렌더 샘플 */}
      <div
        style={{
          fontSize: `var(${textToken})`,
          lineHeight: `var(${leadingToken})`,
          fontWeight: weight,
          color: 'var(--foreground)',
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
        <TokenBadge label="유틸리티" token={step === 'base' ? 'text-base' : `text-${step}`} value={`font-weight ${weight}`} />
      </div>
    </div>
  );
}

// 긴 글 행간 한 행 — 글자 크기와 짝이 아니라 문단에 곱하는 단일 값(--leading-*)
function LeadingRow({
  token,
  sample = '조건과 설명이 여러 줄로 이어지는 문단이에요. 행간이 넉넉하면 한 줄씩 끊어 읽기 편해요.',
}: {
  token: string;
  sample?: string;
}) {
  const value = useTokenValue(token);

  return (
    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20, marginBottom: 20 }}>
      <div
        style={{
          fontSize: 'var(--text-base)',
          lineHeight: `var(${token})`,
          color: 'var(--foreground)',
          maxWidth: 420,
          marginBottom: 8,
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
        }}
      >
        {sample}
      </div>
      <TokenBadge label="행간" token={token} value={value} />
    </div>
  );
}

function TokenBadge({ label, token, value }: { label: string; token: string; value: string }) {
  return (
    <div style={{ fontSize: 11 }}>
      <span style={{ color: 'var(--muted)' }}>{label} </span>
      <code style={{ color: 'var(--link)' }}>{token}</code>
      <span style={{ color: 'var(--muted)' }}> = {value || '—'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 48 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 20px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function TypographyPage() {
  return (
    <div style={{ padding: 32, background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'var(--font-family-base)', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Typography Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
        클래스에서는 Tailwind 기본 유틸리티(<code style={{ color: 'var(--link)' }}>text-xs</code> ~ <code style={{ color: 'var(--link)' }}>text-5xl</code>)를 쓰고,
        인라인 style·CSS에서는 <code style={{ color: 'var(--link)' }}>--text-N</code> · <code style={{ color: 'var(--link)' }}>--text-N--line-height</code> 쌍을 쓴다.
        자간은 모두 0이고 굵기는 400·500·600·700을 쓴다.
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 40 }}>
        폰트: Noto Sans KR. <code style={{ color: 'var(--link)' }}>--font-family-base</code>의 첫 값이며 서비스는 globals.css 1행의 Google Fonts CDN으로 불러온다.
        현재 적용 폰트: <code style={{ color: 'var(--link)' }}>{useTokenValue('--font-family-base').slice(0, 30)}…</code>
      </p>

      <Section title="Headings">
        <TypeRow step="5xl" weight={600} sample="섹션 제목" />
        <TypeRow step="4xl" weight={600} sample="큰 제목" />
        <TypeRow step="3xl" weight={500} sample="카드 제목" />
        <TypeRow step="2xl" weight={500} sample="서브 카드 제목" />
      </Section>

      <Section title="Body">
        <TypeRow step="xl" sample="본문 대형 — 인트로 텍스트 등" />
        <TypeRow step="lg" sample="본문 중간" />
        <TypeRow step="base" sample="기본 본문 텍스트. 최소 읽기 편한 크기." />
        <TypeRow step="sm" sample="보조 설명, 메타 정보" />
        <TypeRow step="xs" sample="캡션, 타임스탬프, 힌트" />
      </Section>

      <Section title="Bold (큰 숫자·콜아웃)">
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 20px' }}>
          히어로 숫자와 큰 콜아웃 용도.
        </p>
        <TypeRow step="5xl" weight={700} sample="128" />
        <TypeRow step="3xl" weight={700} sample="배지 획득" />
      </Section>

      <Section title="Leading (긴 글 행간)">
        <LeadingRow token="--leading-loose" />
        <LeadingRow token="--leading-reading" sample="여러 문단으로 이어지는 산문에 쓰는 행간이에요. 철학 페이지와 정책 문서처럼 길게 읽는 글에서 줄 사이를 넉넉하게 둬요." />
      </Section>

      <Section title="Weight">
        {[
          [400, 'font-normal'],
          [500, 'font-medium'],
          [600, 'font-semibold'],
          [700, 'font-bold'],
        ].map(([w, cls]) => (
          <div key={w} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: w as number }}>가나다라 ABCDef 123</span>
            <code style={{ fontSize: 11, color: 'var(--link)' }}>{cls}</code>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{w}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Typography',
  parameters: {
    layout: 'fullscreen',
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllTypography: StoryObj = {
  name: '모든 타이포 스케일',
  render: () => <TypographyPage />,
};

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
            background: semantic ? 'var(--progress-latest)' : 'var(--accent)',
            borderRadius: 2,
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

// 치수·겹침 순서 토큰: 값이 길이가 아니거나(z-index) 화면보다 넓어 막대로 그리기 어려워 이름·값·설명만 보인다.
function DimensionRow({ token, desc }: { token: string; desc: string }) {
  const value = useTokenValue(token);
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <code style={{ fontSize: 12, color: 'var(--link)', display: 'block' }}>{token}</code>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        {value || '—'} — {desc}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 12px' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

// 티켓 20261108_1928: 역할 이름과 Tailwind 기본 클래스 대응. design-system/readme.md 「간격 역할 토큰과 클래스 대응」과 같은 표다.
const ROLE_TOKENS: { token: string; className: string }[] = [
  { token: '--page-x', className: 'px-4' },
  { token: '--page-top', className: 'pt-4' },
  { token: '--page-bottom', className: 'pb-6' },
  { token: '--gap-section', className: 'gap-5 · space-y-5' },
  { token: '--gap-section-lg', className: 'gap-6' },
  { token: '--gap-group', className: 'gap-3' },
  { token: '--gap-text', className: 'gap-2' },
  { token: '--gap-label', className: 'gap-1' },
  { token: '--gap-card', className: 'gap-2' },
  { token: '--gap-card-detail', className: 'gap-3' },
  { token: '--card-padding', className: 'p-4' },
  { token: '--card-padding-row', className: 'py-3 px-4' },
  { token: '--gap-field', className: 'gap-4' },
  { token: '--gap-actions', className: 'gap-2' },
];

function RoleTokenTable() {
  const cell = { padding: '8px 12px 8px 0', borderBottom: '1px solid var(--border)', textAlign: 'left' as const, fontSize: 12 };
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 560 }}>
      <thead>
        <tr style={{ color: 'var(--muted)' }}>
          <th style={cell}>이름</th>
          <th style={cell}>값</th>
          <th style={cell}>클래스</th>
        </tr>
      </thead>
      <tbody>
        {ROLE_TOKENS.map(({ token, className }) => (
          <tr key={token}>
            <td style={cell}><code style={{ color: 'var(--link)' }}>{token}</code></td>
            <td style={cell}>{useTokenValue(token) || '—'}</td>
            <td style={cell}><code>{className}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SpacingPage() {
  return (
    <div style={{ padding: 32, background: 'var(--background)', minHeight: '100vh', color: 'var(--foreground)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Spacing Tokens</h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40 }}>
        4px 기반 눈금. 인라인 style·CSS·calc() 안에서 참조하는 변수이고, 이름은 값을 따른다.
        클래스에서는 Tailwind 기본 유틸리티(<code style={{ color: 'var(--link)' }}>p-4</code>·<code style={{ color: 'var(--link)' }}>gap-2</code> …)를 쓰며 그 단계 번호는 이 이름과 다르다.
        레이아웃 semantic 토큰은 눈금 변수를 참조해 전역 조정이 가능하다.
      </p>

      <Section title="Base Scale (4px 배수)">
        <SpacingRow token="--spacing-4" desc="최소 단위 — 아이콘 주변 여백, inline gap" />
        <SpacingRow token="--spacing-8" desc="소형 — 태그 내부, 버튼 아이콘 간격" />
        <SpacingRow token="--spacing-12" desc="컴팩트 — 리스트 아이템 간격" />
        <SpacingRow token="--spacing-16" desc="기본 — 카드 내부 요소 간격" />
        <SpacingRow token="--spacing-20" desc="섹션 사이 — 역할 토큰 --gap-section의 값" />
        <SpacingRow token="--spacing-24" desc="중형 — 카드 패딩, 섹션 내 간격" />
        <SpacingRow token="--spacing-32" desc="대형 — 화면은 직접 쓰지 않는다(5회차에서 검사)" />
        <SpacingRow token="--spacing-40" desc="대형 — 화면은 직접 쓰지 않는다(5회차에서 검사)" />
        <SpacingRow token="--spacing-48" desc="섹션 간 — 화면은 직접 쓰지 않는다(5회차에서 검사)" />
        <SpacingRow token="--spacing-64" desc="특대 — 화면은 직접 쓰지 않는다(5회차에서 검사)" />
        <SpacingRow token="--spacing-96" desc="최대 — 화면은 직접 쓰지 않는다(5회차에서 검사)" />
      </Section>

      <Section title="역할 토큰 ↔ Tailwind 클래스 (화면은 클래스를 쓴다)">
        <RoleTokenTable />
      </Section>

      <Section title="Layout Semantic (전역 조정 가능)">
        <SpacingRow token="--layout-card-padding" desc="시트·모달·빈 상태 안쪽 여백 = --spacing-24" semantic />
        <SpacingRow token="--layout-section-gap" desc="페이지 섹션 간 간격 = --spacing-48" semantic />
        <SpacingRow token="--layout-element-gap" desc="카드 내 요소 간 간격 = --spacing-16" semantic />
      </Section>

      <Section title="Special">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 200, flexShrink: 0 }}>
            <div style={{ width: 'var(--touch-target-min)', height: 'var(--touch-target-min)', border: '2px dashed var(--link)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--link)' }}>{useTokenValue('--touch-target-min')}</span>
            </div>
          </div>
          <div>
            <code style={{ fontSize: 12, color: 'var(--link)', display: 'block' }}>--touch-target-min</code>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {useTokenValue('--touch-target-min')} — iOS HIG 최소 터치 영역
            </span>
          </div>
        </div>
        <SpacingRow token="--spacing-safe-top" desc="iOS 상단 노치·상태바 safe area (env())" />
        <SpacingRow token="--spacing-safe-bottom" desc="iOS 홈 인디케이터 safe area (env())" />
      </Section>

      <Section title="앱 틀·하단 고정 UI 치수">
        <DimensionRow token="--app-max-width" desc="앱 본문 컬럼의 최대 너비" />
        <DimensionRow token="--topnav-height" desc="상단 내비게이션 바 높이" />
        <DimensionRow token="--sheet-full-height" desc="바텀시트 전체 높이" />
        <DimensionRow token="--sheet-max-height" desc="바텀시트 최대 높이" />
        <DimensionRow token="--floating-bar-width" desc="플로팅 탭바·토스트의 너비" />
        <DimensionRow token="--floating-bar-max-width" desc="플로팅 탭바·토스트의 최대 너비" />
      </Section>

      <Section title="컴포넌트 치수: 배지·공유 카드">
        <DimensionRow token="--badge-hero-size" desc="배지 상세 히어로·티켓 사진의 한 변" />
        <DimensionRow token="--grid-cell-max-width" desc="배지 그리드 카드·슬롯 원형 버튼 한 칸의 최대 너비" />
        <DimensionRow token="--grid-thumb-bleed" desc="배지 그리드 카드 썸네일이 칸 너비보다 넓어지는 양" />
        <DimensionRow token="--grid-thumb-inset" desc="배지 그리드 카드 썸네일 안쪽 여백 비율" />
        <DimensionRow token="--cta-max-width" desc="합성·티어업 화면 CTA 버튼의 최대 너비" />
        <DimensionRow token="--share-card-max-width" desc="배지 공유 카드의 최대 너비" />
        <DimensionRow token="--share-card-image-size" desc="배지 공유 카드 안 이미지의 한 변(카드 대비)" />
      </Section>

      <Section title="겹침 순서 (z-index, 클수록 위)">
        <DimensionRow token="--z-toast-scrim" desc="토스트 뒤의 어둠" />
        <DimensionRow token="--z-toast" desc="토스트" />
        <DimensionRow token="--z-navigation-loader" desc="화면 전환 로더(모든 것의 위)" />
      </Section>

      {/* 실제 사용 예시 */}
      <Section title="사용 예시">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: '시트·모달 여백', token: '--layout-card-padding' },
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
  title: 'Foundations/Spacing',
  parameters: {
    layout: 'fullscreen',
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const AllSpacing: StoryObj = {
  name: '모든 스페이싱 토큰',
  render: () => <SpacingPage />,
};

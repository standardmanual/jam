import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeFamilyCardHeader, progressRampColor, NEAR_THRESHOLD } from './BadgeFamilyCardHeader';

const meta: Meta<typeof BadgeFamilyCardHeader> = {
  title: 'MODULAR/Patterns/BadgeFamilyCardHeader',
  component: BadgeFamilyCardHeader,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '배지 트리 계열 카드의 **공유 헤더** — 티켓 20260906_2140. 네 패턴(`BadgeStageRail`· ' +
          '`BadgeLevelGauge`·`BadgeStampRow`·`BadgeProgressRingCard`)이 각자 헤더를 그려서 ' +
          '계열명 시작 x가 32/88/16px 세 갈래로 갈라져 있었다(staging 375px 실측). 공유 부품 ' +
          '하나로 구조적으로 막는다. 배치는 `[이름 1fr][87% EPIC auto]` / ' +
          '`[메타 1fr][자세히 ⌄ auto]` — **퍼센트와 등급 라벨을 세로로 쌓지 않고 한 줄에 ' +
          '나란히** 두고, 진행률 블록과 「자세히」가 같은 열이라 카드 우측 패딩 엣지를 공유한다. ' +
          '등급은 칩이 아니라 **텍스트**다(레일 안의 등급칩과 경쟁하지 않게).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeFamilyCardHeader>;

/** 실제 계열 카드와 같은 표면·패딩(375px 화면에서 좌우 16px 여백을 뺀 343px) */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-testid="card"
      style={{
        width: 343, padding: 16, borderRadius: 16, background: '#1f1f1f',
        color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
      }}
    >
      {children}
    </div>
  );
}

export const Default: Story = {
  name: '기본 — 87% EPIC 한 줄',
  render: () => (
    <Card>
      <BadgeFamilyCardHeader
        name="자정의 정복자"
        fraction={0.87}
        pctLabel="Epic"
        metaText="다음 Epic · 두 조건을 한 번의 활동에서"
        expanded={false}
        onToggleExpand={() => {}}
      />
    </Card>
  ),
  play: async ({ canvasElement }) => {
    // 퍼센트와 등급 라벨이 **한 줄**에 있는지 — 세로로 쌓이면 top이 달라진다.
    const pct = await canvasElement.querySelector('span[style*="tabular-nums"]');
    const label = [...canvasElement.querySelectorAll('span')].find((el) => el.textContent === 'Epic');
    await expect(pct).toBeTruthy();
    await expect(label).toBeTruthy();
    const pctRect = (pct as HTMLElement).getBoundingClientRect();
    const labelRect = (label as HTMLElement).getBoundingClientRect();
    // 같은 baseline 정렬이라 top이 정확히 같지는 않지만, 세로로 쌓였다면 높이만큼 벌어진다.
    await expect(Math.abs(pctRect.bottom - labelRect.bottom)).toBeLessThan(4);
    await expect(labelRect.left).toBeGreaterThan(pctRect.right - 1);
  },
};

export const RampSteps: Story = {
  name: '상태 램프 4단계',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <BadgeFamilyCardHeader name="시작 전 — idle" fraction={0} pctLabel="Common" metaText="아직 시작 전" />
      </Card>
      <Card>
        <BadgeFamilyCardHeader name="진행 중 — active" fraction={0.42} pctLabel="Rare" metaText="지금 내 차례" />
      </Card>
      <Card>
        <BadgeFamilyCardHeader name="거의 다 — near" fraction={0.87} pctLabel="Epic" metaText="80% 이상" />
      </Card>
      <Card>
        <BadgeFamilyCardHeader name="다 채움 — done" fraction={1} pctLabel="Mystic" metaText="모두 획득" done />
      </Card>
    </div>
  ),
  play: async () => {
    await expect(progressRampColor(0)).toBe('var(--status-progress-idle)');
    await expect(progressRampColor(0.42)).toBe('var(--status-progress-active)');
    await expect(progressRampColor(NEAR_THRESHOLD)).toBe('var(--status-progress-near)');
    await expect(progressRampColor(1)).toBe('var(--status-progress-done)');
    await expect(progressRampColor(null)).toBe('var(--status-progress-idle)');
    await expect(progressRampColor(0.1, true)).toBe('var(--status-progress-done)');
  },
};

export const NoPercent: Story = {
  name: '진행 계산 불가 — 퍼센트를 지어내지 않는다',
  render: () => (
    <Card>
      <BadgeFamilyCardHeader
        name="진행 표시 준비 중인 계열"
        fraction={null}
        pctLabel="Rare"
        metaText="진행 표시 준비 중"
      />
    </Card>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toContain('%');
  },
};

export const NotRoundedTo100: Story = {
  name: '99.6%는 100%로 올리지 않는다',
  render: () => (
    <Card>
      <BadgeFamilyCardHeader name="거의 다 온 계열" fraction={0.996} pctLabel="Epic" metaText="아직 다 채우지 않았다" />
    </Card>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).toContain('99%');
    await expect(canvasElement.textContent).not.toContain('100%');
  },
};

export const LongName: Story = {
  name: '긴 계열명 — 말줄임 없이 줄바꿈',
  render: () => (
    <Card>
      <BadgeFamilyCardHeader
        name="아주 길고 긴 계열 이름도 끝까지 보여준다 절대로 말줄임하지 않는다"
        fraction={0.33}
        pctLabel="Rare"
        metaText="다음 Rare · 30km"
        onToggleExpand={() => {}}
      />
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const nameEl = [...canvasElement.querySelectorAll('span')].find((el) =>
      el.textContent?.startsWith('아주 길고 긴')
    ) as HTMLElement;
    await expect(nameEl).toBeTruthy();
    await expect(getComputedStyle(nameEl).textOverflow).not.toBe('ellipsis');
    // 줄바꿈으로 전부 보이는지 — 잘렸다면 scrollWidth가 clientWidth를 넘는다.
    await expect(nameEl.scrollWidth).toBeLessThanOrEqual(nameEl.clientWidth + 1);
  },
};

export const NoToggle: Story = {
  name: '펼칠 내용이 없는 카드 — 자세히 없음',
  render: () => (
    <Card>
      <BadgeFamilyCardHeader name="걸어온 거리" fraction={0.6} pctLabel="Lv.8" metaText="120 / 150km · 30km 남음" />
    </Card>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};

export const SharedRightEdge: Story = {
  name: '우측 스캔 컬럼 — 세 카드의 진행률 오른쪽 엣지가 하나',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <BadgeFamilyCardHeader name="자정의 정복자" fraction={0.87} pctLabel="Epic" metaText="다음 Epic" onToggleExpand={() => {}} />
      </Card>
      <Card>
        <BadgeFamilyCardHeader name="걸어온 거리" fraction={0.6} pctLabel="Lv.8" metaText="120 / 150km" />
      </Card>
      <Card>
        <BadgeFamilyCardHeader name="한 주에 세 번" fraction={0.25} pctLabel="26회" metaText="이번 주 · 3일 남음" />
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cards = [...canvasElement.querySelectorAll('[data-testid="card"]')] as HTMLElement[];
    await expect(cards.length).toBe(3);
    const nameLefts: number[] = [];
    const pctRights: number[] = [];
    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      const spans = [...card.querySelectorAll('span')] as HTMLElement[];
      const nameEl = spans[0];
      const pctBlock = spans.find((el) => el.style.whiteSpace === 'nowrap') as HTMLElement;
      nameLefts.push(Math.round(nameEl.getBoundingClientRect().left - cardRect.left));
      pctRights.push(Math.round(cardRect.right - pctBlock.getBoundingClientRect().right));
    }
    // 카드 왼쪽 패딩(16px)에서 이름이 시작하고, 카드 오른쪽 패딩(16px)에 진행률이 붙는다.
    await expect(new Set(nameLefts).size).toBe(1);
    await expect(new Set(pctRights).size).toBe(1);
    await expect(nameLefts[0]).toBe(16);
    await expect(pctRights[0]).toBe(16);
  },
};

/**
 * **펼칠 수 있는 카드와 없는 카드의 진행률 우측 엣지가 같아야 한다**(티켓 20260906_2344).
 *
 * 오른쪽 컬럼(`1fr auto`의 `auto`) 폭은 진행률 블록과 2행 「자세히 ⌄」 중 **넓은 쪽**이
 * 정한다. `justifySelf: 'end'`가 없으면 퍼센트가 그 컬럼 왼쪽에 붙어, 토글이 있는 카드만
 * 24px 안쪽에서 끝난다 — staging 실측에서 343px vs 319px로 갈렸다.
 * 세로로 훑는 스캔 컬럼이 이 불변식 위에 서 있다.
 */
export const PercentRightEdgeIsUniform: Story = {
  render: () => (
    <div
      style={{
        background: 'var(--color-surface)',
        padding: 'var(--spacing-16)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-16)',
      }}
    >
      {/* 토글 있음 — 「자세히 ⌄」가 컬럼 폭을 정한다 */}
      <div style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)', background: 'var(--color-surface-elevated)' }}>
        <BadgeFamilyCardHeader
          name="오늘의 한 걸음"
          fraction={0.42}
          metaText="다음 Rare · 4.2 / 10km"
          onToggleExpand={() => {}}
        />
      </div>
      {/* 토글 없음 — 진행률 블록만 있다 */}
      <div style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)', background: 'var(--color-surface-elevated)' }}>
        <BadgeFamilyCardHeader name="걸어온 거리" fraction={0.8} metaText="다음 Lv.8까지 30km" />
      </div>
      {/* 2행 자체가 없는 카드 */}
      <div style={{ borderRadius: 'var(--radius-card)', padding: 'var(--spacing-16)', background: 'var(--color-surface-elevated)' }}>
        <BadgeFamilyCardHeader name="메타 줄 없는 계열" fraction={0} />
      </div>
    </div>
  ),
}

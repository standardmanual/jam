import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeTreeSummaryHeader } from './BadgeTreeSummaryHeader';

const meta: Meta<typeof BadgeTreeSummaryHeader> = {
  title: 'MODULAR/Patterns/BadgeTreeSummaryHeader',
  component: BadgeTreeSummaryHeader,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '배지 트리(/badges/tree) 진행 요약 — 획득/전체 히어로 숫자 + 등급별 분포 막대(20260903_2329). ' +
          '20260906_2140(v3): **1층 히어로 + 2층 2열 버킷**으로 재편했다. 예전 3열 그리드는 셀 안 ' +
          '순서가 막대 → 라벨 → 값이라 «무엇에 대한 막대인지» 모른 채 막대를 먼저 봤고, 셀 폭이 ' +
          '96px이라 값이 12px·막대가 6px로 눌렸다. 이제 ①1층은 `획득 12 / 145`(--text-h3) + 우측 ' +
          '`8%`(--text-body-l), ②2층은 2열이라 셀 폭 ~148px이고 값 --text-small·막대 8px, ' +
          '③셀 안 순서를 **라벨 + 값 → 막대**로 뒤집었다, ④라벨 앞에 등급색 8px 도트를 둬 등급을 ' +
          '색으로도 식별한다, ⑤순서는 **Common → Rare → Epic → Mystic → 레벨**(쉬운 것부터 = ' +
          '「앞으로 얼마나 더」를 읽는 순서). 레벨 칸은 다른 축이라 2열 전체를 쓴다. ' +
          '⚠️ **1층에는 전체 진행 막대를 넣지 않는다** — 20260906_1436의 결정을 유지한다 ' +
          '(2026-09-06 재확인). 분포 막대는 등급색이 아니라 상태 채널(--status-progress-done)로 ' +
          '채운다 — 이 막대가 말하는 건 「그 등급 중 몇 개를 채웠나」이지 등급 자체가 아니다. ' +
          '등급 라벨은 RarityBadge.jsx의 getRarityLabel()을 재사용한다(MODULAR 단일 소스, 20260905_0027).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeTreeSummaryHeader>;

function Frame({ children, ...rest }: { children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }} {...rest}>
      {children}
    </div>
  );
}

export const WalkingTab: Story = {
  name: '걷기 탭 (진행 중) — 1층 히어로 + 2층 2열',
  render: () => (
    <Frame data-testid="summary">
      <BadgeTreeSummaryHeader
        earnedCount={14}
        totalCount={64}
        byRarity={{
          common: { earned: 8, total: 19 },
          rare: { earned: 4, total: 16 },
          epic: { earned: 2, total: 17 },
          mystic: { earned: 0, total: 12 },
        }}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('[data-testid="summary"] > div') as HTMLElement;
    const [hero, grid] = Array.from(card.children) as HTMLElement[];

    // 1층 히어로 — 「획득 14 / 64」 + 우측 퍼센트. **막대는 없다**(20260906_1436 결정 유지).
    expect(hero.textContent).toContain('획득');
    expect(hero.textContent).toContain('14');
    expect(hero.textContent).toContain('/ 64');
    expect(hero.textContent).toContain('22%');
    expect(hero.querySelectorAll('div').length).toBe(0);

    // 2층 버킷 — 2열.
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).toBe(2);
    // 순서: Common → Rare → Epic → Mystic (쉬운 것부터). 레벨 버킷이 없으면 4칸이다.
    const labels = Array.from(grid.children).map((c) => c.textContent ?? '');
    expect(labels.length).toBe(4);
    expect(labels[0]).toContain('Common');
    expect(labels[1]).toContain('Rare');
    expect(labels[2]).toContain('Epic');
    expect(labels[3]).toContain('Mystic');

    // 셀 안 순서 — 라벨+값 줄이 먼저, 막대가 나중이다.
    const cell = grid.children[0] as HTMLElement;
    expect((cell.children[0] as HTMLElement).textContent).toContain('Common');
    expect((cell.children[1] as HTMLElement).offsetHeight).toBe(8);
    // 라벨 앞 등급색 도트 — 등급을 색으로도 식별한다.
    const dot = cell.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.offsetWidth).toBe(8);
  },
};

export const JustStarted: Story = {
  name: '막 시작 (0개 획득)',
  render: () => (
    <Frame>
      <BadgeTreeSummaryHeader
        earnedCount={0}
        totalCount={40}
        byRarity={{
          common: { earned: 0, total: 12 },
          rare: { earned: 0, total: 10 },
          epic: { earned: 0, total: 10 },
          mystic: { earned: 0, total: 8 },
        }}
      />
    </Frame>
  ),
};

export const AllCompleted: Story = {
  name: '전부 획득',
  render: () => (
    <Frame>
      <BadgeTreeSummaryHeader
        earnedCount={40}
        totalCount={40}
        byRarity={{
          common: { earned: 12, total: 12 },
          rare: { earned: 10, total: 10 },
          epic: { earned: 10, total: 10 },
          mystic: { earned: 8, total: 8 },
        }}
      />
    </Frame>
  ),
};

/**
 * v5 — 「등급 없음」 칸 (티켓 20260905_0036).
 *
 * 칸 수가 `repeat(4, 1fr)`로 하드코딩돼 있어서 이 요약은 사실상 **«등급 4칸» 그 자체**였다.
 * v5 무한레벨형(193종)은 `rarity`가 NULL이라 네 칸 어디에도 들어가지 못하고, 그러면
 * 히어로 숫자(`totalCount`)와 칸 합계가 조용히 어긋난다 — 「40개 중 12개」인데 칸을 다
 * 더하면 20개인 상태다. `noRarity` 버킷을 받아 「레벨」 칸을 그린다.
 *
 * 20260906_2140부터 레벨 칸은 등급 4칸 **아래에서 2열 전체**를 쓴다 — 레벨은 등급과 다른
 * 축이고, 5칸을 2열에 넣으면 마지막 하나가 혼자 남아 「등급 하나가 빠진 것」처럼 읽힌다.
 */
export const WithNoRarityBucket: Story = {
  name: 'v5 — 등급 없는 배지(무한레벨형) 칸 포함 (2열 전체)',
  render: () => (
    <Frame data-testid="summary-level">
      <BadgeTreeSummaryHeader
        earnedCount={31}
        totalCount={104}
        byRarity={{
          common: { earned: 9, total: 12 },
          rare: { earned: 6, total: 10 },
          epic: { earned: 2, total: 10 },
          mystic: { earned: 0, total: 8 },
        }}
        noRarity={{ earned: 14, total: 64 }}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('[data-testid="summary-level"] > div') as HTMLElement;
    const grid = card.children[1] as HTMLElement;
    const cells = Array.from(grid.children) as HTMLElement[];
    expect(cells.length).toBe(5);
    expect(cells[4].textContent).toContain('레벨');
    // 레벨 칸은 2열 전체 — 폭이 등급 칸의 2배 남짓이다.
    expect(cells[4].offsetWidth).toBeGreaterThan(cells[0].offsetWidth * 1.8);
  },
};

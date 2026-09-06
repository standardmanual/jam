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
          '배치는 **2행 3열 고정**이다(20260906_1323): 1행 [전체·Mystic·Epic] / 2행 [레벨·Rare·Common]. ' +
          '예전에는 큰 숫자 한 줄 + 등급 5칸이 가로로 붙어 각 칸이 60px 남짓이었다 — 큰 숫자를 첫 칸 ' +
          '안으로 넣고 3열로 나눴다. ' +
          '전체 칸은 **막대가 없다**(20260906_1436 — 20260906_1323 §6의 "전체 칸에도 6px 막대를 둔다" ' +
          '결정을 되돌렸다). 등급 칸(Mystic·Epic·Rare·Common)만 6px 막대를 유지한다. 전체 칸의 레이블 ' +
          'marginTop을 14px(막대 6px + 여백 8px 자리)로 올려 등급 칸과 레이블의 세로 위치는 그대로 맞는다. ' +
          '분포 막대는 등급색이 아니라 상태 채널(--status-done-solid)로 채운다. ' +
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
  name: '걷기 탭 (진행 중) — 2행 3열',
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
    const grid = canvasElement.querySelector('[data-testid="summary"] > div > div') as HTMLElement;
    // 3열 고정 — 칸 수에 따라 열 수가 흔들리면 여기서 걸린다.
    expect(getComputedStyle(grid).gridTemplateColumns.split(' ').length).toBe(3);
    // 순서: 전체 → Mystic → Epic → (레벨 없음: 빈 칸) → Rare → Common
    const labels = Array.from(grid.children).map((c) => c.textContent ?? '');
    expect(labels[0]).toContain('전체');
    expect(labels[1]).toContain('Mystic');
    expect(labels[2]).toContain('Epic');
    expect(labels[3]).toBe('');
    expect(labels[4]).toContain('Rare');
    expect(labels[5]).toContain('Common');
    // 20260906_1436 — 전체 칸(첫 칸)은 막대가 없다(자식 2개: 레이블+값). 등급 칸은
    // 막대가 남아 있다(자식 3개: 막대+레이블+값).
    const totalCell = grid.children[0];
    const mysticCell = grid.children[1];
    expect(totalCell.children.length).toBe(2);
    expect(mysticCell.children.length).toBe(3);
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
 * 20260906_1323부터 그 칸의 자리는 **2행 첫 칸**으로 고정이다. `noRarity`가 없으면 그 자리를
 * 비워 두고 열 수는 바꾸지 않는다 — 그래야 Rare·Common이 늘 같은 열에 있다.
 */
export const WithNoRarityBucket: Story = {
  name: 'v5 — 등급 없는 배지(무한레벨형) 칸 포함',
  render: () => (
    <Frame>
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
};

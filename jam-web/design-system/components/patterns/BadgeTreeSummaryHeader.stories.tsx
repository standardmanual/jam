import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
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
          '분포 막대는 등급색이 아니라 상태 채널(--status-done-solid)로 채운다. ' +
          '등급 라벨은 RarityBadge.jsx의 getRarityLabel()을 재사용한다(MODULAR 단일 소스, 20260905_0027).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeTreeSummaryHeader>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

export const WalkingTab: Story = {
  name: '걷기 탭 (진행 중)',
  render: () => (
    <Frame>
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
 * 더하면 20개인 상태다. `noRarity` 버킷을 받아 칸을 하나 더 그리고, 컬럼 수는 실제로
 * 그리는 칸 수를 따른다. `noRarity`를 넘기지 않으면 예전과 똑같이 4칸이다(비파괴).
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

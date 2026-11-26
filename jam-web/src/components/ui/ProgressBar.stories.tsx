import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'UI/Feedback/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

const WIDTH = [(Story: React.ComponentType) => <div style={{ width: 280 }}><Story /></div>];

/** 홈의 오늘 상태 띠(`TodayStatusStrip`) — 현재·전체 값만 넘기는 기본 바다. */
export const Default: Story = {
  name: '기본',
  args: { current: 3, total: 10 },
  decorators: WIDTH,
};

/** 미션 상세(`MissionDetailClient`)의 진행도 — 높이 16px, 빨강 채움. */
export const MissionProgress: Story = {
  name: '미션 진행도',
  args: { percent: 60, height: 16, color: 'var(--jam-red)' },
  decorators: WIDTH,
};

/** 랭킹 줄(`RankingListRow`)의 값 막대 — 링크 안에 놓이므로 span으로 그린다. */
export const RankingBar: Story = {
  name: '랭킹 줄 막대',
  args: { as: 'span', percent: 78, labelType: 'none', height: 16, color: 'var(--accent)', trackColor: 'var(--border)' },
  decorators: WIDTH,
  play: async ({ canvasElement }) => {
    // span 경로에는 바깥 감싸개 안에 div가 없다
    const host = canvasElement.querySelector('span');
    expect(host).not.toBeNull();
    expect(host?.querySelector('div')).toBeNull();
  },
};

/** 컬렉션 카드(`CollectionGridCard`)·컬렉션 상세·인벤토리의 캡슐 바 — 어두운 트랙 안에 둥근 채움. */
export const Capsule: Story = {
  name: '캡슐',
  args: { shape: 'capsule', percent: 50, height: 16, color: 'var(--capsule-fill)' },
  decorators: WIDTH,
};

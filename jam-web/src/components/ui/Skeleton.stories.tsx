import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Feedback/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

/** 홈 캡슐 위젯(`CapsuleWidget`)이 불러오는 동안 — 게이지 높이 36px의 알약 모양. */
export const CapsuleGauge: Story = {
  name: '캡슐 게이지 자리',
  args: { height: 36, radius: 'full', className: 'w-full' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

/** 합성 결과 시트(`PendingResultsSheet`)가 불러오는 동안 — 정사각 타일 자리. */
export const SquareTile: Story = {
  name: '정사각 타일 자리',
  args: { height: 'auto', radius: '2xl', className: 'aspect-square' },
  decorators: [(Story) => <div style={{ width: 96 }}><Story /></div>],
};

/** 프로필(`ProfileClient`)의 목록이 불러오는 동안 — 높이 72px의 둥근 칸. */
export const ProfileRow: Story = {
  name: '프로필 칸 자리',
  args: { height: 72, radius: '2xl', className: 'w-full' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

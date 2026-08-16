import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'MODULAR/Feedback/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: { width: 240, height: 16 },
};

export const Avatar: Story = {
  name: '아바타 원형',
  args: { width: 48, height: 48, borderRadius: '50%' },
};

export const ButtonShape: Story = {
  name: '버튼 형태',
  args: { width: 120, height: 44, borderRadius: 'var(--radius-pill)' },
};

export const CardLoading: Story = {
  name: '카드 로딩 (복합 레이아웃)',
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--color-bg-tint)', borderRadius: 'var(--radius-card)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Skeleton width={40} height={40} borderRadius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton width="100%" height={12} />
      <Skeleton width="80%" height={12} />
      <Skeleton width="90%" height={12} />
    </div>
  ),
};

export const TextLines: Story = {
  name: '텍스트 줄 목록',
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton width="100%" height={14} />
      <Skeleton width="90%" height={14} />
      <Skeleton width="75%" height={14} />
      <Skeleton width="85%" height={14} />
      <Skeleton width="60%" height={14} />
    </div>
  ),
};

export const BadgeGrid: Story = {
  name: '배지 그리드',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 60px)', gap: 12 }}>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} width={60} height={60} borderRadius="50%" />
      ))}
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { RecentSyncBanner } from './RecentSyncBanner';

const meta: Meta<typeof RecentSyncBanner> = {
  title: 'MODULAR/Patterns/RecentSyncBanner',
  component: RecentSyncBanner,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '직전 동기화 배너. 1차 범위는 boolean 이벤트만 표시(20260903_2329) — 구체적인 배지 ' +
          '개수·거리 등은 진행 스냅샷이 필요한 2·3차에서 얹는다. 색은 --status-latest-solid(시안) 전용.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof RecentSyncBanner>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

export const Visible: Story = {
  name: '최근 동기화 있음',
  render: () => (
    <Frame>
      <RecentSyncBanner visible />
    </Frame>
  ),
};

export const CustomMessage: Story = {
  name: '메시지 커스텀',
  render: () => (
    <Frame>
      <RecentSyncBanner visible message="오늘 걷기 활동이 동기화됐어요" />
    </Frame>
  ),
};

export const Hidden: Story = {
  name: '최근 동기화 없음 (렌더 안 함)',
  render: () => (
    <Frame>
      <p style={{ color: '#929292', fontSize: 13 }}>visible=false면 아무것도 렌더하지 않습니다.</p>
      <RecentSyncBanner visible={false} />
    </Frame>
  ),
};

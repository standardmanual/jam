import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import NotificationBell from './NotificationBell';
import { TopNavDataProvider } from '@/lib/topNavData';

const meta: Meta<typeof NotificationBell> = {
  title: 'UI/Navigation/NotificationBell',
  component: NotificationBell,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof NotificationBell>;

const withUnread = (hasUnreadNotifications: boolean) =>
  function WithUnread(Story: React.ComponentType) {
    return (
      <TopNavDataProvider value={{ username: null, avatarUrl: null, stravaState: 'none', hasUnreadNotifications }}>
        <Story />
      </TopNavDataProvider>
    );
  };

/** 상단 바 우측의 알림 종 — 안 읽은 소식이 있어 빨간 점이 보일 때 */
export const Unread: Story = {
  name: '안 읽은 소식 있음',
  decorators: [withUnread(true)],
};

/** 상단 바 우측의 알림 종 — 안 읽은 소식이 없을 때 */
export const Read: Story = {
  name: '안 읽은 소식 없음',
  decorators: [withUnread(false)],
};

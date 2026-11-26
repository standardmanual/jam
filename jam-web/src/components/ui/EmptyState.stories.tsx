import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { EmptyState } from './EmptyState';
import { d } from '@/lib/i18n';
import { AlertTriangleIcon, ArrowDownIcon, BellIcon } from './icons';

const meta: Meta<typeof EmptyState> = {
  title: 'UI/Feedback/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

/** 알림함(`notifications/NotificationsClient.tsx`)의 알림이 하나도 없을 때 — 아이콘·제목·설명. */
export const Default: Story = {
  name: '알림 없음',
  args: {
    icon: <BellIcon className="w-8 h-8" />,
    title: d.notifications.emptyTitle,
    description: d.notifications.emptyBody,
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

/** 합성 화면(`combine/CombineClient.tsx`)의 레시피가 없을 때 — 제목만 둔다. */
export const TitleOnly: Story = {
  name: '제목만',
  args: {
    icon: <ArrowDownIcon className="w-8 h-8" />,
    title: d.combine.noRecipes,
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

/** 알림함의 목록을 못 불러왔을 때 — 다시 시도 버튼이 붙는다. */
export const WithAction: Story = {
  name: '다시 시도 버튼 포함',
  args: {
    icon: <AlertTriangleIcon className="w-8 h-8" />,
    title: d.notifications.errorTitle,
    description: d.notifications.errorBody,
    action: { label: d.notifications.retry, onClick: () => {} },
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

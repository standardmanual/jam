import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import LoadMoreButton from './LoadMoreButton';
import { d } from '@/lib/i18n';

const meta: Meta<typeof LoadMoreButton> = {
  title: 'UI/Buttons/LoadMoreButton',
  component: LoadMoreButton,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof LoadMoreButton>;

/** 친구 피드·알림·포인트 내역 목록 아래의 «더보기» 버튼 */
export const Default: Story = {
  name: '기본 (더보기)',
  args: { onClick: () => {}, children: d.common.loadMore },
};

/** 포인트 내역에서 다음 쪽을 불러오는 동안 */
export const Loading: Story = {
  name: '불러오는 중',
  args: { onClick: () => {}, loading: true, children: d.points.loadingMore },
};

/** 알림 목록에서 다음 쪽을 불러오지 못한 뒤의 재시도 */
export const Retry: Story = {
  name: '다시 시도',
  args: { onClick: () => {}, children: d.notifications.retry },
};

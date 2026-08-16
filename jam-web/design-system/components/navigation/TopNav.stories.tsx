import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { TopNav } from './TopNav';
import { IconButton } from '../buttons/IconButton';

const meta: Meta<typeof TopNav> = {
  title: 'MODULAR/Navigation/TopNav',
  component: TopNav,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof TopNav>;

export const Default: Story = {
  args: { title: '페이지 제목', showBack: true },
};

export const NoBack: Story = {
  name: '뒤로가기 없음',
  args: { title: '홈', showBack: false },
};

export const WithRightSlot: Story = {
  name: '우측 슬롯',
  args: {
    title: '배지',
    showBack: true,
    rightSlot: <IconButton icon="search" label="검색" />,
  },
};

export const WithMultipleRight: Story = {
  name: '우측 슬롯 (복수)',
  args: {
    title: '인벤토리',
    showBack: true,
    rightSlot: (
      <div style={{ display: 'flex', gap: 0 }}>
        <IconButton icon="search" label="검색" />
        <IconButton icon="menu" label="메뉴" />
      </div>
    ),
  },
};

export const LongTitle: Story = {
  name: '긴 제목 (말줄임)',
  args: { title: '아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 페이지 제목 텍스트 오버플로 테스트', showBack: true },
};

export const NoBackNoTitle: Story = {
  name: '빈 상태',
  args: { title: '', showBack: false },
};

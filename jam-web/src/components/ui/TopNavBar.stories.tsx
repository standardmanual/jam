import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { TopNavBar } from './TopNavBar';

const meta: Meta<typeof TopNavBar> = {
  title: 'UI/Navigation/TopNavBar',
  component: TopNavBar,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof TopNavBar>;

/** 약관 화면(`LegalTopNav`) — 뒤로가기와 제목만 둔다. 슬롯을 쓰는 서비스 상단 바는 `TopNav` 스토리에 있다. */
export const Default: Story = {
  name: '뒤로가기 + 제목',
  args: { title: '개인정보 처리방침', showBack: true },
};

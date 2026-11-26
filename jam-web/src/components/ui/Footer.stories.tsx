import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import Footer from './Footer';

const meta: Meta<typeof Footer> = {
  title: 'UI/Navigation/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/', query: {} } },
  },
  decorators: [(Story) => <div style={{ width: 390 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof Footer>;

/** 서비스 화면 맨 아래의 전역 푸터. `/drops`·`/philosophy`에서는 그려지지 않으므로 그 밖의 경로(홈)에서 보이는 모습이 전부다 */
export const Default: Story = {
  name: '기본',
};

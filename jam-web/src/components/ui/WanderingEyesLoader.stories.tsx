import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { WanderingEyesLoader } from './WanderingEyesLoader';

const meta: Meta<typeof WanderingEyesLoader> = {
  title: 'UI/Feedback/WanderingEyesLoader',
  component: WanderingEyesLoader,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof WanderingEyesLoader>;

/** 화면 전환(`NavigationLoader`)·배지 공유 버튼·미션 현황에서 밝은 면 위에 쓴다. */
export const Default: Story = {
  args: {},
};

/** 배지 획득 연출(`BadgeRevealOverlay`)·아이템 고르기 오버레이(`PendingItemsPickOverlay`)에서 어두운 막 위에 쓴다 — 눈과 눈동자 색을 맞바꾼다. */
export const OnDark: Story = {
  name: '어두운 막 위',
  args: { eyeColor: 'var(--snow)', pupilColor: 'var(--background-inverse)' },
  decorators: [(Story) => <div style={{ background: 'var(--background-inverse)', padding: 32, borderRadius: 'var(--radius-2xl)' }}><Story /></div>],
};

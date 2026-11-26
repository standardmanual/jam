import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { IconButton } from './IconButton';
import { d } from '@/lib/i18n';

const ICONS = ['chevron-left', 'chevron-right', 'close', 'check', 'info', 'search', 'menu', 'share'] as const;

const meta: Meta<typeof IconButton> = {
  title: 'UI/Buttons/IconButton',
  component: IconButton,
  parameters: { layout: 'centered' },
  argTypes: {
    icon: { control: 'select', options: ICONS },
    surface: { control: 'radio', options: ['light', 'dark'] },
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

/** 배지 획득 연출(`BadgeRevealOverlay`)과 장소 카드 모달(`PoiCarouselModal`)의 닫기 버튼 — 밝은 면 위에 둔다. */
export const Close: Story = {
  name: '닫기',
  args: { icon: 'close', label: d.common.close, surface: 'light' },
};

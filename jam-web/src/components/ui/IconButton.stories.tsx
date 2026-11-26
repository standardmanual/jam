import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { IconButton } from './IconButton';
import { d } from '@/lib/i18n';

const ICONS = ['chevron-left', 'chevron-right', 'close', 'check', 'info', 'search', 'menu', 'share', 'locate'] as const;

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

/** 지도 우하단의 «내 위치» 버튼 — 지도 위에서는 호출부가 면(흰 원)을 깐다 */
export const Locate: Story = {
  name: '내 위치',
  args: { icon: 'locate', label: d.map.myLocationButtonAriaLabel, surface: 'light' },
};

/** 위치를 찾는 동안 — 흐리게 보이고 aria-disabled가 붙는다(클릭 차단은 호출부) */
export const LocateBusy: Story = {
  name: '내 위치 (찾는 중)',
  args: { icon: 'locate', label: d.map.myLocationButtonAriaLabel, surface: 'light', disabled: true },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { MixerSlot } from './MixerSlot';

const meta: Meta<typeof MixerSlot> = {
  title: 'MODULAR/Patterns/MixerSlot',
  component: MixerSlot,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '믹스(크래프팅) 슬롯 카드. 아이템·액티비티·체크인 타입 구분 없이 시각적으로 동일하며 빈/잠김/채움 3상태를 갖는다. 배지 드랍·픽업 화면의 "빈칸 채우기" UI 재사용을 염두에 두고 MODULAR로 등록했다(티켓 20260917_1655).',
      },
    },
  },
  argTypes: {
    status: { control: 'select', options: ['empty', 'locked', 'filled'] },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 100 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MixerSlot>;

const ItemIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M3 11h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const Empty: Story = {
  name: '빈 슬롯',
  args: {
    status: 'empty',
    icon: ItemIcon,
    label: '체크섬 조각',
  },
};

export const Locked: Story = {
  name: '잠김 — 후보 배지 미보유',
  args: {
    status: 'locked',
    icon: ItemIcon,
    label: '체크섬 조각',
  },
};

export const Filled: Story = {
  name: '채움',
  args: {
    status: 'filled',
    name: '체크섬 조각',
    imageUrl: '/badges/sample/s222.png',
    onRemove: () => {},
  },
};

export const FilledNoImage: Story = {
  name: '채움 — 이미지 없음(폴백)',
  args: {
    status: 'filled',
    name: '체크섬 조각',
    icon: ItemIcon,
    onRemove: () => {},
  },
};

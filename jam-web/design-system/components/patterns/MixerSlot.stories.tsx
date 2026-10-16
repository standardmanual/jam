import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { MixerSlot } from './MixerSlot';

const meta: Meta<typeof MixerSlot> = {
  title: 'MODULAR/Patterns/MixerSlot',
  component: MixerSlot,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '믹스(크래프팅) 슬롯 카드. 아이템·액티비티·체크인 타입 구분 없이 시각적으로 동일하며 빈/잠김/채움 3상태를 갖는다. 빈 슬롯(채울 수 있음)은 muted 3px 테두리 + foreground 화살표, 잠긴 슬롯(후보 미보유)은 불투명도만으로 구분한다(티켓 20260917_1828). 배지 드랍·픽업 화면의 "빈칸 채우기" UI 재사용을 염두에 두고 MODULAR로 등록했다(티켓 20260917_1655).',
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

export const Empty: Story = {
  name: '빈 슬롯 — 채울 수 있음(muted 테두리 + foreground 화살표)',
  args: {
    status: 'empty',
  },
  play: async ({ canvasElement }) => {
    const arrow = canvasElement.querySelector('svg')!;
    expect(arrow).toBeTruthy();
    // 크림 면 위 화살표는 --foreground(#171717)다. 흰색이면 1.05:1이라 보이지 않는다.
    expect(getComputedStyle(arrow).fill).toBe('rgb(23, 23, 23)');
  },
};

export const Locked: Story = {
  name: '잠김 — 후보 배지 미보유',
  args: {
    status: 'locked',
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
  play: async ({ canvasElement }) => {
    const remove = canvasElement.querySelector('[role="button"]') as HTMLElement;
    expect(remove).toBeTruthy();
    // 제거 버튼은 반전 면(--background-inverse, #171717) + --snow(#fcfcfc) 글자다(17.47:1).
    expect(getComputedStyle(remove).backgroundColor).toBe('rgb(23, 23, 23)');
    expect(getComputedStyle(remove).color).toBe('rgb(252, 252, 252)');
  },
};

export const FilledNoImage: Story = {
  name: '채움 — 이미지 없음(폴백)',
  args: {
    status: 'filled',
    name: '체크섬 조각',
    onRemove: () => {},
  },
};

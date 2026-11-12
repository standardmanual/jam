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
          '믹스(크래프팅) 슬롯 카드. 아이템·액티비티·체크인 타입 구분 없이 시각적으로 동일하며 빈/잠김/채움 3상태를 갖는다. 빈 슬롯(채울 수 있음)은 테두리 없이 정중앙의 검은 원(24px) 안 흰 «+»(제거 버튼과 같은 규격, 티켓 20261112_1627), 잠긴 슬롯(후보 미보유)은 점선과 흐린 «+», 채운 슬롯은 3px muted 안쪽 테두리로 «채웠다»를 알린다(2026-11-11 사용자 지시, 이전 티켓 20260917_1828). 배지 드랍·픽업 화면의 "빈칸 채우기" UI 재사용을 염두에 두고 MODULAR로 등록했다(티켓 20260917_1655).',
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
  name: '빈 슬롯 — 채울 수 있음(테두리 없음 + 검은 원 안 흰 «+»)',
  args: {
    status: 'empty',
  },
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button')!;
    const circle = button.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(circle).toBeTruthy();
    // 슬롯 전체가 버튼이고 원은 장식이다. 24px 검은 원(--background-inverse #171717) 안 --snow(#fcfcfc) «+»다(filled의 제거 버튼과 같은 규격).
    const rect = circle.getBoundingClientRect();
    expect(Math.round(rect.width)).toBe(24);
    expect(Math.round(rect.height)).toBe(24);
    expect(getComputedStyle(circle).backgroundColor).toBe('rgb(23, 23, 23)');
    expect(getComputedStyle(circle).color).toBe('rgb(252, 252, 252)');
    const icon = circle.querySelector('svg')!;
    expect(icon.getAttribute('width')).toBe('14');
    expect(icon.getAttribute('stroke-width')).toBe('4.5');
    expect(icon.querySelector('path')?.getAttribute('d')).toBe('M12 6v12M6 12h12');
    // 슬롯 정중앙에 놓인다.
    const slot = button.getBoundingClientRect();
    expect(Math.abs(rect.left + rect.width / 2 - (slot.left + slot.width / 2))).toBeLessThan(1);
    expect(Math.abs(rect.top + rect.height / 2 - (slot.top + slot.height / 2))).toBeLessThan(1);
    // 채우기 전에는 테두리가 없다 — 테두리는 채운 칸에만 있다.
    expect(getComputedStyle(button).boxShadow).toBe('none');
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
    // 눌리는 영역은 바깥 44px 박스이고, 보이는 원은 그 안의 24px다.
    const circle = remove.firstElementChild as HTMLElement;
    expect(remove.getBoundingClientRect().width).toBe(44);
    expect(circle.getBoundingClientRect().width).toBe(24);
    expect(circle.getBoundingClientRect().height).toBe(24);
    // 원은 반전 면(--background-inverse, #171717) + --snow(#fcfcfc) 아이콘이다(17.47:1).
    expect(getComputedStyle(circle).backgroundColor).toBe('rgb(23, 23, 23)');
    expect(getComputedStyle(circle).color).toBe('rgb(252, 252, 252)');
    // 슬롯 가장자리에서 6px 안쪽이다(오른쪽·위).
    const slot = remove.parentElement as HTMLElement;
    expect(Math.round(slot.getBoundingClientRect().right - circle.getBoundingClientRect().right)).toBe(6);
    expect(Math.round(circle.getBoundingClientRect().top - slot.getBoundingClientRect().top)).toBe(6);
    // 글자 «✕»가 아니라 «−» 아이콘이다.
    expect(circle.textContent).toBe('');
    expect(circle.querySelector('svg path')?.getAttribute('d')).toBe('M6 12h12');
    // 채운 칸에는 3px 그레이(--muted, #666) 안쪽 테두리가 있다.
    expect(getComputedStyle(slot).boxShadow).toContain('inset');
    expect(getComputedStyle(slot).boxShadow).toContain('0px 0px 0px 3px');
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

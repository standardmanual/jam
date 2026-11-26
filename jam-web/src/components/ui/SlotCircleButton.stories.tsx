import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import SlotCircleButton from './SlotCircleButton';
import { d } from '@/lib/i18n';

const meta: Meta<typeof SlotCircleButton> = {
  title: 'UI/Buttons/SlotCircleButton',
  component: SlotCircleButton,
  parameters: { layout: 'centered' },
  // 버튼은 호출부의 relative 카드 안에 absolute로 놓이므로 카드 크기만 흉내 낸다
  decorators: [(Story) => <div style={{ position: 'relative', width: 120, height: 120, background: 'var(--surface)' }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof SlotCircleButton>;

/** 컬렉션 상세에서 장착된 칸의 «빼기» 버튼 (카드 우상단) */
export const Minus: Story = {
  name: '빼기 (우상단)',
  args: { icon: 'minus', label: d.itembooks.unslotButton, onClick: () => {} },
};

/** 컬렉션 상세에서 넣을 수 있는 칸의 «추가» 버튼 (이미지 정중앙) */
export const PlusCenter: Story = {
  name: '추가 (정중앙)',
  args: { icon: 'plus', position: 'center', label: d.itembooks.slotButton, onClick: () => {} },
};

/** 믹스 레시피 칸(4열)의 «추가» 버튼 — 카드 여백이 좁다 */
export const PlusCenterDense: Story = {
  name: '추가 (정중앙 · 촘촘한 칸)',
  args: { icon: 'plus', position: 'center', dense: true, label: d.itembooks.slotButton, onClick: () => {} },
};

/** 컬렉션 상세에서 요청이 진행 중인 칸의 «빼기» 버튼 */
export const Pending: Story = {
  name: '요청 진행 중',
  args: { icon: 'minus', pending: true, label: d.itembooks.unslotButton, onClick: () => {} },
};

/** 일괄 작업 중 다른 칸의 «빼기» 버튼 (비활성) */
export const Disabled: Story = {
  name: '비활성',
  args: { icon: 'minus', disabled: true, label: d.itembooks.unslotButton, onClick: () => {} },
};

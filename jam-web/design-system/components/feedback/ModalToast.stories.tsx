import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { ModalToast } from './ModalToast';
import { BadgeFrame } from '../cards/BadgeFrame';
import { Button } from '../buttons/Button';

const StarIcon = () => (
  <svg viewBox="0 0 48 48" fill="white" width={40} height={40} aria-hidden="true">
    <path d="M24 4 l5 12 13 0-10 8 4 13-12-7-12 7 4-13-10-8 13 0z" />
  </svg>
);

const meta: Meta<typeof ModalToast> = {
  title: 'MODULAR/Feedback/ModalToast',
  component: ModalToast,
  parameters: { layout: 'centered' },
  argTypes: {
    type: { control: 'radio', options: ['success', 'error', 'info'] },
  },
};

export default meta;
type Story = StoryObj<typeof ModalToast>;

export const Success: Story = {
  args: { message: '배지를 획득했어요!', type: 'success', open: true },
};

export const CustomDismissLabel: Story = {
  name: '커스텀 dismissLabel',
  args: { message: '미션을 완료했어요!', type: 'success', open: true, dismissLabel: '완료했어요' },
};

export const Error: Story = {
  args: { message: '오류가 발생했어요. 다시 시도해 보세요.', type: 'error', open: true },
};

export const Info: Story = {
  args: { message: '새로운 미션이 추가됐어요.', type: 'info', open: true },
};

export const WithBadgeFrame: Story = {
  name: 'BadgeFrame 슬롯 (배지 획득 연출)',
  args: {
    open: true,
    message: '새로운 배지를 획득했어요!\n전설의 러너',
    iconSlot: (
      <BadgeFrame shape="circle" width={96} height={96} color="var(--color-primary)">
        <StarIcon />
      </BadgeFrame>
    ),
  },
};

export const WithMythicBadge: Story = {
  name: 'Mythic 배지 획득 연출',
  args: {
    open: true,
    message: '신화 등급 배지를 획득했어요!\n100km 완주',
    iconSlot: (
      <BadgeFrame shape="scallop" width={96} height={96} color="var(--color-rarity-mythic)">
        <StarIcon />
      </BadgeFrame>
    ),
  },
};

export const Interactive: Story = {
  name: '인터랙티브 (열기/닫기)',
  render: () => {
    const [open, setOpen] = useState(false);
    const [type, setType] = useState<'success' | 'error' | 'info'>('success');
    const show = (t: 'success' | 'error' | 'info') => { setType(t); setOpen(true); };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={() => show('success')}>Success</Button>
          <Button variant="ghost" onClick={() => show('error')}>Error</Button>
          <Button variant="ghost" onClick={() => show('info')}>Info</Button>
        </div>
        <ModalToast
          open={open}
          message="완료됐어요."
          type={type}
          onDismiss={() => setOpen(false)}
        />
      </div>
    );
  },
};

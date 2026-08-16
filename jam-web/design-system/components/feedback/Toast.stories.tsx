import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Toast } from './Toast';
import { Button } from '../buttons/Button';

// 20260816_012: 인셋 보더 제거(기존 --color-border 참조는 라이트 토스트에 부적절했던 오류이기도 함)
const meta: Meta<typeof Toast> = {
  title: 'MODULAR/Feedback/Toast',
  component: Toast,
  parameters: { layout: 'centered' },
  argTypes: {
    type: { control: 'radio', options: ['success', 'error', 'info'] },
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: { message: '배지를 획득했어요!', type: 'success', open: true },
};

export const Error: Story = {
  args: { message: 'Strava 동기화가 끊겼어요. 다시 동기화해 보세요.', type: 'error', open: true },
};

export const Info: Story = {
  args: { message: '오늘의 미션이 업데이트됐어요.', type: 'info', open: true },
};

export const LongMessage: Story = {
  name: '긴 메시지',
  args: {
    message: '네트워크 연결이 불안정해요. 잠시 후 다시 시도해 보세요.',
    type: 'error',
    open: true,
  },
};

export const Interactive: Story = {
  name: '인터랙티브 (타입 전환)',
  render: () => {
    const [open, setOpen] = useState(true);
    const [type, setType] = useState<'success' | 'error' | 'info'>('success');
    const messages: Record<string, string> = {
      success: '배지를 획득했어요!',
      error: '오류가 발생했어요.',
      info: '새 미션이 추가됐어요.',
    };
    const show = (t: 'success' | 'error' | 'info') => { setType(t); setOpen(true); };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant={type === 'success' ? 'primary' : 'ghost'} onClick={() => show('success')}>Success</Button>
          <Button variant={type === 'error' ? 'primary' : 'ghost'} onClick={() => show('error')}>Error</Button>
          <Button variant={type === 'info' ? 'primary' : 'ghost'} onClick={() => show('info')}>Info</Button>
        </div>
        {open && (
          <Toast
            message={messages[type]}
            type={type}
            open={open}
            onDismiss={() => setOpen(false)}
          />
        )}
      </div>
    );
  },
};

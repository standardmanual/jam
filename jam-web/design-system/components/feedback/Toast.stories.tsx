import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Toast } from './Toast';
import { Button } from '../buttons/Button';

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
  args: { message: '배지를 획득했습니다!', type: 'success', open: true },
};

export const Error: Story = {
  args: { message: '동기화에 실패했습니다. 다시 시도해 주세요.', type: 'error', open: true },
};

export const Info: Story = {
  args: { message: '오늘의 미션이 업데이트되었습니다.', type: 'info', open: true },
};

export const LongMessage: Story = {
  name: '긴 메시지',
  args: {
    message: '네트워크 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.',
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
      success: '배지를 획득했습니다!',
      error: '오류가 발생했습니다.',
      info: '새 미션이 추가되었습니다.',
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

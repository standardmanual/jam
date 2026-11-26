import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect } from 'react';
import { ToastProvider, useToast } from './Toast';
import { d } from '@/lib/i18n';

const meta: Meta = {
  title: 'UI/Feedback/Toast',
  component: ToastProvider,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div style={{ height: 240 }} />
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** 마운트 직후 토스트를 띄운다. 토스트는 3초 뒤 닫히므로 4초마다 다시 띄워 화면에서 계속 볼 수 있게 한다. */
function ShowToast({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
  const { toast } = useToast();
  useEffect(() => {
    toast(message, type);
    const timer = setInterval(() => toast(message, type), 4000);
    return () => clearInterval(timer);
  }, [toast, message, type]);
  return null;
}

/** 배지 공유 시트에서 이미지를 복사했을 때 */
export const Success: Story = {
  name: '성공',
  render: () => <ShowToast message={d.badges.shareCopySuccess} type="success" />,
};

/** 네트워크 요청이 실패했을 때(팔로우·믹스 등 여러 화면) */
export const ErrorToast: Story = {
  name: '오류',
  render: () => <ShowToast message={d.common.networkError} type="error" />,
};

/** 배지 공유 시트에서 iOS 저장 방법을 안내할 때 */
export const Info: Story = {
  name: '안내',
  render: () => <ShowToast message={d.badges.shareSaveIOSHint} type="info" />,
};

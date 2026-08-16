import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from '../buttons/Button';

const meta: Meta<typeof BottomSheet> = {
  title: 'MODULAR/Navigation/BottomSheet',
  component: BottomSheet,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof BottomSheet>;

export const Open: Story = {
  name: '열린 상태 (제목 있음)',
  args: {
    open: true,
    title: '바텀 시트 제목',
    children: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 'var(--leading-body)' }}>
          바텀 시트 본문 내용입니다.
        </p>
        <Button variant="primary">닫기</Button>
      </div>
    ),
  },
};

export const NoTitle: Story = {
  name: '제목 없음',
  args: {
    open: true,
    children: (
      <p style={{ color: 'var(--color-text)', margin: 0 }}>제목 없는 바텀 시트입니다.</p>
    ),
  },
};

export const WithActions: Story = {
  name: '액션 버튼 포함',
  args: {
    open: true,
    title: '정말 삭제할까요?',
    children: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 20px', lineHeight: 'var(--leading-body)' }}>
          이 작업은 되돌릴 수 없어요.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost">취소</Button>
          <Button variant="primary">삭제</Button>
        </div>
      </div>
    ),
  },
};

export const Interactive: Story = {
  name: '인터랙티브 (열기/닫기)',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{
        padding: 24, background: 'var(--color-bg)',
        minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Button variant="primary" onClick={() => setOpen(true)}>바텀 시트 열기</Button>
        <BottomSheet open={open} onDismiss={() => setOpen(false)} title="확인이 필요해요">
          <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 20px', lineHeight: 'var(--leading-body)' }}>
            배경을 누르거나 Escape 키를 누르면 닫혀요.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>닫기</Button>
          </div>
        </BottomSheet>
      </div>
    );
  },
};

export const LongContent: Story = {
  name: '긴 컨텐츠',
  args: {
    open: true,
    title: '배지 상세 정보',
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ padding: 12, background: 'var(--color-bg-tint)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--text-body)' }}>항목 {i + 1}</p>
            <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-small)' }}>상세 설명 텍스트입니다.</p>
          </div>
        ))}
      </div>
    ),
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'MODULAR/Cards/Card',
  component: Card,
  parameters: { layout: 'centered' },
  argTypes: {
    tone: { control: 'radio', options: ['default', 'tint', 'inverse'] },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: { tone: 'default', children: '카드 기본 컨텐츠입니다.' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Tint: Story = {
  args: { tone: 'tint', children: 'Tint 배경 카드' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Inverse: Story = {
  args: { tone: 'inverse', children: 'Inverse 배경 (흰 배경 + 어두운 텍스트)' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Interactive: Story = {
  name: '클릭 가능',
  args: {
    tone: 'default',
    children: '클릭 가능한 카드입니다. onClick 시 role="button" + tabIndex=0 자동 설정.',
    onClick: () => {},
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const AllTones: Story = {
  name: '전체 Tone',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}>
      <Card tone="default">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>default</p>
        <p style={{ margin: '4px 0 0', color: 'var(--foreground)' }}>배경: --surface (20260816_012 — 보더 제거로 대체)</p>
      </Card>
      <Card tone="tint">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>tint</p>
        <p style={{ margin: '4px 0 0', color: 'var(--foreground)' }}>배경: --background-secondary</p>
      </Card>
      <Card tone="inverse">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>inverse</p>
        <p style={{ margin: '4px 0 0', color: 'var(--snow)' }}>배경: --background-inverse</p>
      </Card>
    </div>
  ),
};

export const WithContent: Story = {
  name: '미션 카드 예시',
  render: () => (
    <div style={{ width: 320 }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--foreground)' }}>
            오늘의 미션
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--muted)', lineHeight: 'var(--text-base--line-height)' }}>
            5km 달리기를 완료하면 배지를 획득해요.
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--link)' }}>진행 중 • 3.2 / 5.0 km</p>
        </div>
      </Card>
    </div>
  ),
};

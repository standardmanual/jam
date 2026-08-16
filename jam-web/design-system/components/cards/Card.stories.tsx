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
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>default</p>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text)' }}>배경: --color-surface</p>
      </Card>
      <Card tone="tint">
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>tint</p>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text)' }}>배경: --color-bg-tint</p>
      </Card>
      <Card tone="inverse">
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>inverse</p>
        <p style={{ margin: '4px 0 0', color: 'var(--color-text-inverse)' }}>배경: --color-surface-inverse</p>
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
          <p style={{ margin: 0, fontSize: 'var(--text-h4)', fontWeight: 700, color: 'var(--color-text)' }}>
            오늘의 미션
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-body)' }}>
            5km 달리기를 완료하면 배지를 획득합니다.
          </p>
          <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--color-primary)' }}>진행 중 • 3.2 / 5.0 km</p>
        </div>
      </Card>
    </div>
  ),
};

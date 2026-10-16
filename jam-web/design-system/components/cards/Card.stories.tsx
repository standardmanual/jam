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
  args: { tone: 'default', children: '카드 기본 컨텐츠입니다. 흰 면 + 1px 테두리, 그림자 없음.' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

/**
 * 크림 캔버스(--background) 위의 경계 확인용.
 * 흰 면(--surface)과 크림 바탕은 1.05:1이라 1px --border가 없으면 카드가 보이지 않는다.
 * tint는 테두리가 없으므로 흰 카드 안 구획으로만 쓴다.
 */
export const OnCreamCanvas: Story = {
  name: '크림 캔버스 위 경계',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ background: 'var(--background)', padding: 16, width: 393, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700 }}>기본 카드</p>
          <p style={{ margin: '4px 0 12px', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
            --surface + 1px --border, 그림자 없음
          </p>
          <Card tone="tint">
            <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>tint — 카드 안 구획 (--background-secondary)</p>
          </Card>
        </Card>
      </div>
    </div>
  ),
};

export const Tint: Story = {
  args: { tone: 'tint', children: 'Tint 배경 카드' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Inverse: Story = {
  args: { tone: 'inverse', children: 'Inverse 배경 (어두운 반전 면 + --snow 글자)' },
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
        <p style={{ margin: '4px 0 0', color: 'var(--foreground)' }}>배경: --surface + 1px --border (그림자 없음)</p>
      </Card>
      <Card tone="tint">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>tint</p>
        <p style={{ margin: '4px 0 0', color: 'var(--foreground)' }}>배경: --background-secondary</p>
      </Card>
      <Card tone="inverse">
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--snow)' }}>inverse</p>
        <p style={{ margin: '4px 0 0', color: 'var(--snow)' }}>배경: --background-inverse (어두운 반전 면)</p>
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

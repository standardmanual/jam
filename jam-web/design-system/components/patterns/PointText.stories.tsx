import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { PointText } from './PointText';

const meta: Meta<typeof PointText> = {
  title: 'MODULAR/Patterns/PointText',
  component: PointText,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '포인트 «값 + 단위» 표기 — 티켓 20261104_2319. 값과 «포인트» 글자 모두 `--point-text`(= `--accent-content-red` #ff4400) 한 색이다. ' +
          '`layout="stacked"`는 우측 보상 칸(굵은 숫자 16px 위, 작은 «포인트» 12px 아래), `inline`은 문장 속 한 덩어리(줄바꿈 없음)다. ' +
          '값이 `null`/`undefined`면 아무것도 그리지 않고 `0`은 그린다. 알려진 한계: 흰·크림 면 위 12~16px 글자는 대비 4.5:1에 못 미친다(3:1은 넘는다).',
      },
    },
  },
  argTypes: {
    layout: { control: 'inline-radio', options: ['inline', 'stacked'] },
    unit: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof PointText>;

const Frame = ({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 'var(--radius-2xl)',
      background: dark ? '#1c1917' : 'var(--surface)',
      border: dark ? undefined : '1px solid var(--border)',
      color: dark ? 'var(--snow)' : 'var(--foreground)',
      minWidth: 160,
    }}
  >
    {children}
  </div>
);

export const StackedLarge: Story = {
  name: 'stacked — 큰 수',
  args: { value: 1200, layout: 'stacked' },
  render: (args) => (
    <Frame>
      <PointText {...args} />
    </Frame>
  ),
};

export const StackedZero: Story = {
  name: 'stacked — 0 (그린다, 숨김은 호출부 몫)',
  args: { value: 0, layout: 'stacked' },
  render: (args) => (
    <Frame>
      <PointText {...args} />
    </Frame>
  ),
};

export const StackedEmpty: Story = {
  name: 'stacked — 값 없음 (아무것도 그리지 않음)',
  args: { value: null, layout: 'stacked' },
  render: (args) => (
    <Frame>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>아래 칸이 비어 있어요</p>
      <PointText {...args} />
    </Frame>
  ),
};

export const InlineLarge: Story = {
  name: 'inline — 큰 수 (문장 속)',
  args: { value: 1200, layout: 'inline' },
  render: (args) => (
    <Frame>
      <p style={{ margin: 0 }}>
        보상으로 <PointText {...args} />를 받았어요.
      </p>
    </Frame>
  ),
};

export const InlineZero: Story = {
  name: 'inline — 0',
  args: { value: 0, layout: 'inline' },
  render: (args) => (
    <Frame>
      <p style={{ margin: 0 }}>
        지금 <PointText {...args} />예요.
      </p>
    </Frame>
  ),
};

export const InlineEmpty: Story = {
  name: 'inline — 값 없음 (아무것도 그리지 않음)',
  args: { value: undefined, layout: 'inline' },
  render: (args) => (
    <Frame>
      <p style={{ margin: 0 }}>
        보상:<PointText {...args} />
      </p>
    </Frame>
  ),
};

export const InlineNegative: Story = {
  name: 'inline — 차감 (부호까지 같은 덩어리)',
  args: { value: '-300', layout: 'inline' },
  render: (args) => (
    <Frame>
      <p style={{ margin: 0 }}>
        <PointText {...args} />이 빠져나갔어요.
      </p>
    </Frame>
  ),
};

export const OnDarkSurface: Story = {
  name: '어두운 면 위 (같은 토큰, 약 4.98:1)',
  render: () => (
    <Frame dark>
      <PointText value={1200} layout="stacked" />
    </Frame>
  ),
};

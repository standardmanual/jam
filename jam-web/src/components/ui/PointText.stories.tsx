import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { d } from '@/lib/i18n';
import { tPoint } from '@/lib/i18n/tPoint';
import { PointText } from './PointText';

const meta: Meta<typeof PointText> = {
  title: 'UI/Patterns/PointText',
  component: PointText,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '포인트 «값 + 단위» 표기 — 티켓 20261104_2319. 값과 «포인트» 글자 모두 `--point-text`(#ff4400 리터럴) 한 색이다. ' +
          '`layout="stacked"`는 우측 보상 칸(굵은 숫자 16px 위, 작은 «포인트» 12px 아래), `inline`은 문장 속 한 덩어리(줄바꿈 없음)다. ' +
          '값이 `null`/`undefined`면 아무것도 그리지 않고 `0`은 그린다. `unit=""`이면 값만 그린다. `tone="muted"`는 차감을 값·단위 모두 회색(`--muted`)으로 그린다(티켓 20261115_1431). 알려진 한계: 흰·크림 면 위 12~16px 글자는 대비 4.5:1에 못 미친다(3:1은 넘는다).',
      },
    },
  },
  argTypes: {
    layout: { control: 'inline-radio', options: ['inline', 'stacked'] },
    unit: { control: 'text' },
    tone: { control: 'inline-radio', options: ['point', 'muted'] },
  },
};

export default meta;
type Story = StoryObj<typeof PointText>;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: 16,
      borderRadius: 'var(--radius-2xl)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      color: 'var(--foreground)',
      minWidth: 160,
    }}
  >
    {children}
  </div>
);

/** 레시피 보상 행(`RecipeRewardRow`)의 우측 보상 칸 */
export const StackedLarge: Story = {
  name: '보상 칸 — 위아래로 쌓기',
  args: { value: 1200, unit: d.combine.pointsUnit, layout: 'stacked' },
  render: (args) => (
    <Frame>
      <PointText {...args} />
    </Frame>
  ),
};

/** 포인트 내역(`PointHistoryList`)의 차감 행 — 값과 «포인트» 모두 회색 */
export const StackedMuted: Story = {
  name: '내역 차감 — 회색',
  args: { value: '−1,500', unit: d.points.unitSuffix, layout: 'stacked', tone: 'muted' },
  render: (args) => (
    <Frame>
      <PointText {...args} />
    </Frame>
  ),
};

/** 홈 피드(`FeedSection`)의 «배지와 포인트를 획득했어요» 문장 속 포인트 조각 */
export const InlineSentence: Story = {
  name: '문장 속 — 한 덩어리',
  render: () => (
    <Frame>
      <p style={{ margin: 0 }}>{tPoint(d.feed.groupBadgesWithPoints, { count: 3, points: '1,200' })}</p>
    </Frame>
  ),
};

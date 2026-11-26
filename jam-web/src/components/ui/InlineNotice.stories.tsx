import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import InlineNotice from './InlineNotice';
import Button from './Button';
import { d } from '@/lib/i18n';

const meta: Meta<typeof InlineNotice> = {
  title: 'UI/Feedback/InlineNotice',
  component: InlineNotice,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof InlineNotice>;

/** 미션 상세의 야간 안내 */
export const Default: Story = {
  name: '문구만',
  args: { children: d.missions.nightNotice },
};

/** 믹스 올리기 패널의 개수 부족 안내 (긴 문장) */
export const LongText: Story = {
  name: '문구만 · 긴 문장',
  args: { children: d.combine.tierUp.noEnoughNotice },
};

/** 미션 상세에서 받을 보상 조회에 실패했을 때의 안내와 «다시 시도» */
export const WithAction: Story = {
  name: '보조 동작 포함',
  args: {
    children: d.missions.pendingCard.loadFailed,
    action: <Button variant="ghost">{d.missions.pendingCard.retry}</Button>,
  },
};

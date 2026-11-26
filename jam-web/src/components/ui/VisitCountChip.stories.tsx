import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import VisitCountChip from './VisitCountChip';

const meta: Meta<typeof VisitCountChip> = {
  title: 'UI/Cards/VisitCountChip',
  component: VisitCountChip,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof VisitCountChip>;

/** 배지 상세 히어로 카드의 방문 횟수 칩 */
export const Default: Story = {
  name: '기본',
  args: { count: 3 },
};

/** 배지 목록 카드(회색 면 위)의 방문 횟수 칩 */
export const Common: Story = {
  name: '회색 면 위 (Common)',
  args: { count: 3, tone: 'common' },
};

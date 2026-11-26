import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ProgressCountBar from './ProgressCountBar';

const meta: Meta<typeof ProgressCountBar> = {
  title: 'UI/Feedback/ProgressCountBar',
  component: ProgressCountBar,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof ProgressCountBar>;

/** 인벤토리의 칸 사용량 바 */
export const Default: Story = {
  name: '기본 (강조색 그린)',
  args: { percent: 40, current: 12, total: 30 },
};

/** 컬렉션 상세의 진행도 바 (캡슐 채움색) */
export const CapsuleFill: Story = {
  name: '캡슐 채움색',
  args: { percent: 60, current: 6, total: 10, color: 'var(--capsule-fill)' },
};

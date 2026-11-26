import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import SyncIconButton from './SyncIconButton';
import { d } from '@/lib/i18n';

const meta: Meta<typeof SyncIconButton> = {
  title: 'UI/Buttons/SyncIconButton',
  component: SyncIconButton,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SyncIconButton>;

/** 홈을 뺀 화면 TopNav의 동기화 서클 */
export const Default: Story = {
  name: '기본',
  args: { label: d.today.syncButton, onClick: () => {} },
};

/** 동기화가 진행되는 동안 아이콘이 도는 서클 */
export const Loading: Story = {
  name: '동기화 중',
  args: { label: d.today.syncButton, loading: true, disabled: true },
};

/** 동기화를 누를 수 없을 때(진행 중 중복 탭 차단) */
export const Disabled: Story = {
  name: '비활성',
  args: { label: d.today.syncButton, disabled: true },
};

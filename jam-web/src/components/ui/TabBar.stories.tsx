import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import TabBar from './TabBar';

const meta: Meta<typeof TabBar> = {
  title: 'UI/Navigation/TabBar',
  component: TabBar,
  parameters: { layout: 'fullscreen' },
  args: { username: null },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

const at = (pathname: string) => ({
  nextjs: { appDirectory: true, navigation: { pathname, query: {} } },
});

/** 서비스 레이아웃 하단 탭바 — 홈(`/`)이 선택된 화면 */
export const Today: Story = {
  name: '홈 선택',
  parameters: at('/'),
};

/** 서비스 레이아웃 하단 탭바 — 배지(`/badges`)가 선택된 화면 */
export const Badges: Story = {
  name: '배지 선택',
  parameters: at('/badges'),
};

/** 서비스 레이아웃 하단 탭바 — 체크인 지도(`/drops`)가 선택된 화면 */
export const Drops: Story = {
  name: '체크인 선택',
  parameters: at('/drops'),
};

/** 서비스 레이아웃 하단 탭바 — 미션(`/missions`)이 선택된 화면 */
export const Missions: Story = {
  name: '미션 선택',
  parameters: at('/missions'),
};

/** 서비스 레이아웃 하단 탭바 — 인벤토리(`/inventory`)가 선택된 화면 */
export const Inventory: Story = {
  name: '인벤토리 선택',
  parameters: at('/inventory'),
};

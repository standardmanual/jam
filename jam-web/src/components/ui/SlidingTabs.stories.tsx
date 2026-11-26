import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import SlidingTabs, { type SlidingTabItem } from './SlidingTabs';
import { d } from '@/lib/i18n';

const meta: Meta<typeof SlidingTabs> = {
  title: 'UI/Navigation/SlidingTabs',
  component: SlidingTabs,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SlidingTabs>;

const SORT_TABS: SlidingTabItem[] = [
  { key: 'latest', label: d.voc.sortLatest },
  { key: 'answered', label: d.voc.sortAnswered },
];

const MISSION_TABS: SlidingTabItem[] = [
  { key: 'ongoing', label: d.missions.tabOngoing },
  { key: 'joined', label: d.missions.tabJoined },
  { key: 'ended', label: d.missions.tabEnded },
];

const FEED_TABS: SlidingTabItem[] = [
  { key: 'all', label: d.feed.filterAll },
  { key: 'activity_badge', label: d.feed.filterActivityBadge },
  { key: 'badge', label: d.feed.filterItem },
  { key: 'mission', label: d.feed.filterMission },
];

// 탭을 눌러 선택이 옮겨 가는 모습을 보이려고 선택 상태를 스토리 안에서 쥔다
function Tabs({ items, label }: { items: SlidingTabItem[]; label: string }) {
  const [value, setValue] = useState(items[0].key);
  return (
    <div style={{ width: 320 }}>
      <SlidingTabs items={items} value={value} onChange={setValue} outlined={false} aria-label={label} />
    </div>
  );
}

/** 문의 내역의 정렬 탭 */
export const TwoTabs: Story = {
  name: '탭 2개',
  render: () => <Tabs items={SORT_TABS} label={d.voc.sortAriaLabel} />,
};

/** 미션 목록의 진행중·참가중·종료 탭 */
export const ThreeTabs: Story = {
  name: '탭 3개',
  render: () => <Tabs items={MISSION_TABS} label={d.missions.title} />,
};

/** 홈 피드의 필터 탭 */
export const FourTabs: Story = {
  name: '탭 4개',
  render: () => <Tabs items={FEED_TABS} label={d.feed.filterAll} />,
};

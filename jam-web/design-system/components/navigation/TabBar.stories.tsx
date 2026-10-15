import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { TabBar } from './TabBar';
import type { TabKey } from './TabBar';

// 20260816_012: 흰 필 보더 제거 — 다크 배경 위 색 대비만으로 구분됨
const meta: Meta<typeof TabBar> = {
  title: 'MODULAR/Navigation/TabBar',
  component: TabBar,
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    active: {
      control: 'select',
      options: ['today', 'badges', 'drops', 'missions', 'inventory'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof TabBar>;

export const Today: Story = {
  name: '투데이 활성',
  args: { active: 'today' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Badges: Story = {
  name: '배지 활성',
  args: { active: 'badges' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Drops: Story = {
  name: '드랍 활성',
  args: { active: 'drops' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Missions: Story = {
  name: '미션 활성',
  args: { active: 'missions' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Inventory: Story = {
  name: '인벤토리 활성',
  args: { active: 'inventory' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Material: Story = {
  name: '재질 (반투명 크롬 + 스크롤 콘텐츠)',
  args: { active: 'badges' },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 260, position: 'relative', background: 'var(--background)' }}>
        {/* TabBar 아래로 스크롤되어 지나가는 콘텐츠 — backdrop-filter가 실제로 blur하는
            대상이 있어야 재질 효과가 Storybook 프리뷰에서도 보인다. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--rarity-epic), var(--rarity-rare))',
          padding: 24,
          color: 'var(--foreground)',
          fontSize: 'var(--text-5xl)',
          fontWeight: 700,
        }}>
          Material Test<br />Material Test<br />Material Test
        </div>
        <Story />
      </div>
    ),
  ],
};

export const WithUsername: Story = {
  name: '로그인 유저 (username 전달)',
  args: { active: 'badges', username: 'jam_user' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--background)', position: 'relative' }}><Story /></div>],
};

export const Interactive: Story = {
  name: '인터랙티브 (탭 전환)',
  render: () => {
    const [active, setActive] = useState<TabKey>('today');
    return (
      <div style={{ minHeight: 200, background: 'var(--background)', position: 'relative' }}>
        <TabBar active={active} onChange={setActive} />
        <p style={{
          textAlign: 'center', paddingTop: 16,
          color: 'var(--muted)',
          fontSize: 'var(--text-sm)',
        }}>
          현재 탭: <strong style={{ color: 'var(--link)' }}>{active}</strong>
        </p>
      </div>
    );
  },
};

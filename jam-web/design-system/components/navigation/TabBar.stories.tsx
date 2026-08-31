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
    backgrounds: { default: 'dark' },
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
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Badges: Story = {
  name: '배지 활성',
  args: { active: 'badges' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Drops: Story = {
  name: '드랍 활성',
  args: { active: 'drops' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Missions: Story = {
  name: '미션 활성',
  args: { active: 'missions' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Inventory: Story = {
  name: '인벤토리 활성',
  args: { active: 'inventory' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Material: Story = {
  name: '재질 (반투명 크롬 + 스크롤 콘텐츠)',
  args: { active: 'badges' },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 260, position: 'relative', background: 'var(--color-bg)' }}>
        {/* TabBar 아래로 스크롤되어 지나가는 콘텐츠 — backdrop-filter가 실제로 blur하는
            대상이 있어야 재질 효과가 Storybook 프리뷰에서도 보인다. */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-rarity-epic), var(--color-rarity-rare))',
          padding: 24,
          color: 'var(--color-text)',
          fontSize: 'var(--text-h2)',
          fontWeight: 700,
        }}>
          Material Test<br />Material Test<br />Material Test
        </div>
        <Story />
      </div>
    ),
  ],
};

export const Interactive: Story = {
  name: '인터랙티브 (탭 전환)',
  render: () => {
    const [active, setActive] = useState<TabKey>('today');
    return (
      <div style={{ minHeight: 200, background: 'var(--color-bg)', position: 'relative' }}>
        <TabBar active={active} onChange={setActive} />
        <p style={{
          textAlign: 'center', paddingTop: 16,
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-small)',
        }}>
          현재 탭: <strong style={{ color: 'var(--color-primary)' }}>{active}</strong>
        </p>
      </div>
    );
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { TabBar } from './TabBar';
import type { TabKey } from './TabBar';

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
      options: ['today', 'badges', 'drops', 'missions', 'inventory', 'profile'],
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
  name: '인벤 활성',
  args: { active: 'inventory' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
};

export const Profile: Story = {
  name: '프로필 활성',
  args: { active: 'profile' },
  decorators: [(Story) => <div style={{ minHeight: 180, background: 'var(--color-bg)', position: 'relative' }}><Story /></div>],
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

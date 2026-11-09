import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { TabBar } from './TabBar';
import type { TabKey } from './TabBar';

// 20260816_012: 흰 필 보더 제거. 지금은 크림 바탕 위의 흰 72% 반투명 크롬이라 경계가 약하다 —
// 모양을 그대로 두고 렌더를 본 뒤 외곽선 여부를 정한다(티켓 20261015_2133, 사용자 결정 9).
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
    inverted: { control: 'boolean' },
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

export const Inverted: Story = {
  name: '반전 (어두운 면 위)',
  args: { active: 'badges', inverted: true },
  // 반전 면이 75% 반투명이라 뒤에 비치는 글자를 보이려고, 밝은 면과 어두운 푸터 면의 경계에 탭바가 걸치도록 둔다(티켓 20261109_1325).
  decorators: [(Story) => (
    <div style={{ height: '100vh', minHeight: 240, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ flex: 1, background: 'var(--background)', color: 'var(--foreground)', fontSize: 'var(--text-sm)', padding: 16, display: 'flex', alignItems: 'flex-end' }}>
        밝은 면 위의 글자는 탭바 뒤에서 blur로 뭉개져 은은히 비친다.
      </div>
      <div style={{ height: 40, background: 'var(--background-inverse)', color: 'var(--muted-on-inverse)', fontSize: 'var(--text-sm)', padding: '8px 16px' }}>
        어두운 푸터 위의 글자
      </div>
      <Story />
    </div>
  )],
};

// 푸터 감지는 서비스의 일이다 — 여기서는 버튼이 그 판정을 흉내 내는 가상 재료다.
export const InvertedToggle: Story = {
  name: '반전 토글 (푸터 장면 흉내)',
  render: () => {
    const [inverted, setInverted] = useState(false);
    const [active, setActive] = useState<TabKey>('badges');
    return (
      <div style={{ minHeight: 320, position: 'relative' }}>
        <div style={{ height: 160, background: 'var(--background)', textAlign: 'center', paddingTop: 16 }}>
          <button onClick={() => setInverted((v) => !v)} style={{ color: 'var(--link)', fontSize: 'var(--text-sm)' }}>
            {inverted ? '밝은 면으로' : '푸터 위로'} (inverted={String(inverted)})
          </button>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>푸터 감지는 서비스의 일이고, 이 버튼은 그 판정을 흉내 낸다.</p>
        </div>
        <div style={{ height: 160, background: 'var(--background-inverse)' }} />
        <TabBar active={active} onChange={setActive} inverted={inverted} />
      </div>
    );
  },
};

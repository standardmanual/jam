import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { SlidingTabs } from './SlidingTabs';

const ACTIVITY_TABS = [
  { key: 'all', label: '전체' },
  { key: 'running', label: '러닝' },
  { key: 'cycling', label: '사이클링' },
  { key: 'swimming', label: '수영' },
  { key: 'hiking', label: '하이킹' },
];

// 20260816_012: 보더/구분선 감사 결과 이 컴포넌트는 이미 보더 없음(border: 'none') — 변경 불필요.
// 프로덕션 SlidingTabs.tsx의 outlined 변형(별도 API)에서 보더를 제거하고 --color-surface-elevated로 대체함.
const meta: Meta<typeof SlidingTabs> = {
  title: 'MODULAR/Navigation/SlidingTabs',
  component: SlidingTabs,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof SlidingTabs>;

export const Default: Story = {
  args: { tabs: ACTIVITY_TABS, active: 'all' },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const Interactive: Story = {
  name: '인터랙티브 (탭 전환)',
  render: () => {
    const [active, setActive] = useState('all');
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs tabs={ACTIVITY_TABS} active={active} onChange={setActive} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-small)', marginTop: 12 }}>
          선택: <strong style={{ color: 'var(--color-primary)' }}>{active}</strong>
        </p>
      </div>
    );
  },
};

export const ManyTabs: Story = {
  name: '많은 탭 (수평 스크롤)',
  render: () => {
    const [active, setActive] = useState('t1');
    const tabs = Array.from({ length: 12 }, (_, i) => ({ key: `t${i + 1}`, label: `탭 ${i + 1}` }));
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs tabs={tabs} active={active} onChange={setActive} />
      </div>
    );
  },
};

export const WithTabPanel: Story = {
  name: 'tabpanel 연결 패턴 (aria-controls ↔ role="tabpanel")',
  render: () => {
    const [active, setActive] = useState('all');
    const TABS = [
      { key: 'all', label: '전체' },
      { key: 'running', label: '러닝' },
      { key: 'cycling', label: '사이클링' },
    ];
    const CONTENT: Record<string, string> = {
      all: '모든 활동 목록이 표시됩니다.',
      running: '러닝 활동만 표시됩니다.',
      cycling: '사이클링 활동만 표시됩니다.',
    };
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs
          tabs={TABS.map((t) => ({ ...t, 'aria-controls': `panel-${t.key}` }))}
          active={active}
          onChange={setActive}
        />
        {TABS.map((t) => (
          <div
            key={t.key}
            id={`panel-${t.key}`}
            role="tabpanel"
            hidden={active !== t.key}
            style={{ padding: '16px 4px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-small)' }}
          >
            {CONTENT[t.key]}
          </div>
        ))}
      </div>
    );
  },
};

export const TwoTabs: Story = {
  name: '2개 탭',
  render: () => {
    const [active, setActive] = useState('ongoing');
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs
          tabs={[{ key: 'ongoing', label: '진행 중' }, { key: 'completed', label: '완료' }]}
          active={active}
          onChange={setActive}
        />
      </div>
    );
  },
};

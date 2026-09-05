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
// 20260901_1926: props API를 서비스 기준(items/value/variant/size/shape/block/outlined)으로 재정렬.
const meta: Meta<typeof SlidingTabs> = {
  title: 'MODULAR/Navigation/SlidingTabs',
  component: SlidingTabs,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof SlidingTabs>;

export const Default: Story = {
  args: { items: ACTIVITY_TABS, value: 'all', variant: 'onSurface', size: 'lg', shape: 'pill', block: true, outlined: true },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const Interactive: Story = {
  name: '인터랙티브 (탭 전환)',
  render: () => {
    const [value, setValue] = useState('all');
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs items={ACTIVITY_TABS} value={value} onChange={setValue} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-small)', marginTop: 12 }}>
          선택: <strong style={{ color: 'var(--color-primary)' }}>{value}</strong>
        </p>
      </div>
    );
  },
};

export const OnCardVariant: Story = {
  name: 'onCard 팔레트 (라이트 카드 위)',
  render: () => {
    const [value, setValue] = useState('all');
    return (
      <div style={{ width: 360, background: 'var(--color-surface-inverse)', padding: 16, borderRadius: 12 }}>
        <SlidingTabs items={ACTIVITY_TABS} value={value} onChange={setValue} variant="onCard" />
      </div>
    );
  },
};

export const CardShapeNotBlock: Story = {
  name: 'card 모서리 · 스크롤 (block=false)',
  render: () => {
    const [value, setValue] = useState('t1');
    const items = Array.from({ length: 12 }, (_, i) => ({ key: `t${i + 1}`, label: `탭 ${i + 1}` }));
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs items={items} value={value} onChange={setValue} shape="card" block={false} />
      </div>
    );
  },
};

export const WithTabPanel: Story = {
  name: 'tabpanel 연결 패턴 (aria-controls ↔ role="tabpanel")',
  render: () => {
    const [value, setValue] = useState('all');
    const ITEMS = [
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
        <SlidingTabs items={ITEMS} value={value} onChange={setValue} />
        {ITEMS.map((t) => (
          <div
            key={t.key}
            id={`panel-${t.key}`}
            role="tabpanel"
            hidden={value !== t.key}
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
    const [value, setValue] = useState('ongoing');
    return (
      <div style={{ width: 360 }}>
        <SlidingTabs
          items={[{ key: 'ongoing', label: '진행 중' }, { key: 'completed', label: '완료' }]}
          value={value}
          onChange={setValue}
        />
      </div>
    );
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { BadgeGridCard } from './BadgeGridCard';

const meta: Meta<typeof BadgeGridCard> = {
  title: 'MODULAR/Patterns/BadgeGridCard',
  component: BadgeGridCard,
  parameters: { layout: 'centered', docs: { description: { component: '레이아웃: 썸네일(투명 배경) → 등급 pill → 이름' } } },
  argTypes: {
    rarity: { control: 'select', options: ['common', 'rare', 'legend', 'mythic'] },
    earned: { control: 'boolean' },
    undiscovered: { control: 'boolean' },
    selected: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeGridCard>;

const SAMPLE_IMAGE = '/ds-assets/uploads/jam_logo.png';

export const EarnedCommon: Story = {
  name: '획득됨 — Common',
  args: {
    name: '첫 러닝',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'common',
    earned: true,
  },
};

export const EarnedRare: Story = {
  name: '획득됨 — Rare',
  args: {
    name: '10km 완주',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'rare',
    earned: true,
  },
};

export const EarnedLegend: Story = {
  name: '획득됨 — Legend',
  args: {
    name: '한강 마스터',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'legend',
    earned: true,
  },
};

export const EarnedMythic: Story = {
  name: '획득됨 — Mythic',
  args: {
    name: '신화의 달리기',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'mythic',
    earned: true,
  },
};

export const Unearned: Story = {
  name: '미획득 (흑백+반투명)',
  args: {
    name: '미획득 배지',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'rare',
    earned: false,
  },
};

export const Undiscovered: Story = {
  name: '미발견 (??? 표시)',
  args: {
    name: '???',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'legend',
    undiscovered: true,
    earned: false,
  },
};

export const Selected: Story = {
  // 20260816_012: 2px 보더 링 → 배경톤 채움(rgba primary 15%)으로 대체
  name: '선택됨 (배경톤 강조)',
  args: {
    name: '선택된 배지',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'rare',
    earned: true,
    selected: true,
  },
};

export const NoImage: Story = {
  name: '이미지 없음',
  args: {
    name: '이미지 없는 배지',
    imageUrl: null,
    rarity: 'common',
    earned: true,
  },
};

export const WithChildren: Story = {
  name: '슬롯 버튼 포함',
  args: {
    name: '아이템 배지',
    imageUrl: SAMPLE_IMAGE,
    rarity: 'mythic',
    earned: true,
    children: (
      <button
        style={{
          marginTop: 'var(--spacing-8)',
          padding: '4px 12px',
          fontSize: 'var(--text-small)',
          background: 'var(--color-primary)',
          color: 'var(--color-text-inverse)',
          border: 'none',
          borderRadius: 'var(--radius-button)',
          cursor: 'pointer',
        }}
      >
        믹스하기
      </button>
    ),
  },
};

export const Grid: Story = {
  name: '그리드 레이아웃 (4×2)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 120px)', gap: 'var(--spacing-8)' }}>
      {([
        { name: '첫 러닝', rarity: 'common', earned: true },
        { name: '10km 완주', rarity: 'rare', earned: true },
        { name: '한강 마스터', rarity: 'legend', earned: true },
        { name: '신화의 달리기', rarity: 'mythic', earned: true },
        { name: '미획득 배지', rarity: 'common', earned: false },
        { name: '???', rarity: 'rare', earned: false, undiscovered: true },
        { name: '선택됨', rarity: 'legend', earned: true, selected: true },
        { name: '이미지 없음', rarity: 'mythic', earned: true, imageUrl: null },
      ] as const).map((props, i) => (
        <BadgeGridCard key={i} {...props} imageUrl={'imageUrl' in props ? props.imageUrl : SAMPLE_IMAGE} />
      ))}
    </div>
  ),
};

export const Interactive: Story = {
  name: '인터랙티브 (선택 모드)',
  render: () => {
    const items = [
      { id: 1, name: '첫 러닝', rarity: 'common' as const },
      { id: 2, name: '10km 완주', rarity: 'rare' as const },
      { id: 3, name: '한강 마스터', rarity: 'legend' as const },
      { id: 4, name: '신화의 달리기', rarity: 'mythic' as const },
    ];
    const [selected, setSelected] = useState<number | null>(null);
    return (
      <div>
        <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-12)', textAlign: 'center' }}>
          {selected != null ? `"${items.find(i => i.id === selected)?.name}" 선택됨` : '배지를 선택해 보세요'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 120px)', gap: 'var(--spacing-8)' }}>
          {items.map(item => (
            <BadgeGridCard
              key={item.id}
              name={item.name}
              imageUrl={SAMPLE_IMAGE}
              rarity={item.rarity}
              earned
              selected={selected === item.id}
              onClick={() => setSelected(selected === item.id ? null : item.id)}
            />
          ))}
        </div>
      </div>
    );
  },
};

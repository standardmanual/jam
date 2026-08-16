import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { RarityBadge } from './RarityBadge';

const meta: Meta<typeof RarityBadge> = {
  title: 'MODULAR/Cards/RarityBadge',
  component: RarityBadge,
  parameters: { layout: 'centered' },
  argTypes: {
    rarity: { control: 'radio', options: ['common', 'rare', 'legend', 'mythic'] },
  },
};

export default meta;
type Story = StoryObj<typeof RarityBadge>;

export const Common: Story = { args: { rarity: 'common' } };
export const Rare: Story = { args: { rarity: 'rare' } };
export const Legend: Story = { args: { rarity: 'legend' } };
export const Mythic: Story = { args: { rarity: 'mythic' } };

export const AllRarities: Story = {
  name: '전체 희귀도',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <RarityBadge rarity="common" />
      <RarityBadge rarity="rare" />
      <RarityBadge rarity="legend" />
      <RarityBadge rarity="mythic" />
    </div>
  ),
};

export const OnCard: Story = {
  name: '카드 위 배치 예시',
  render: () => (
    <div style={{
      padding: 'var(--layout-card-padding)',
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-card)',
      border: '1px solid var(--color-border)',
      display: 'flex', flexDirection: 'column', gap: 12, width: 240,
    }}>
      <RarityBadge rarity="mythic" />
      <p style={{ margin: 0, fontSize: 'var(--text-h4)', fontWeight: 700, color: 'var(--color-text)' }}>전설의 배지</p>
      <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>100km 완주 달성</p>
    </div>
  ),
};

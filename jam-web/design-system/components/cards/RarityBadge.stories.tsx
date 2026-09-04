import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { RarityBadge, getRarityLabel } from './RarityBadge';

const meta: Meta<typeof RarityBadge> = {
  title: 'MODULAR/Cards/RarityBadge',
  component: RarityBadge,
  parameters: { layout: 'centered' },
  argTypes: {
    rarity: { control: 'radio', options: ['common', 'rare', 'epic', 'mystic'] },
  },
};

export default meta;
type Story = StoryObj<typeof RarityBadge>;

export const Common: Story = { args: { rarity: 'common' } };
export const Rare: Story = { args: { rarity: 'rare' } };
export const Epic: Story = { args: { rarity: 'epic' } };
export const Mystic: Story = { args: { rarity: 'mystic' } };

export const AllRarities: Story = {
  name: '전체 희귀도',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <RarityBadge rarity="common" />
      <RarityBadge rarity="rare" />
      <RarityBadge rarity="epic" />
      <RarityBadge rarity="mystic" />
    </div>
  ),
};

/**
 * getRarityLabel(rarity) — 칩을 렌더링하지 않고 라벨 문자열만 조회하는 헬퍼(20260904_1502).
 * common일 때 `<RarityBadge>`는 시각적으로 칩을 그리지 않지만(20260827_024), 이 헬퍼는 그
 * 정책과 무관하게 4개 등급 모두의 라벨을 반환해야 한다 — 라이브 리전처럼 "화면엔 안 보여도
 * 텍스트로는 필요한" 소비처(BadgeRevealCarousel)가 여기 의존한다. 헬퍼 출력이 칩 라벨과
 * 어긋나면 같은 회귀가 재발하므로 play에서 고정 문자열로 실측한다.
 */
export const LabelHelperParity: Story = {
  name: '헬퍼 — getRarityLabel이 칩 라벨과 항상 일치',
  render: () => (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {(['common', 'rare', 'epic', 'mystic'] as const).map((r) => (
        <li key={r} data-testid={`label-${r}`} style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--text-small)' }}>
          {r} → {getRarityLabel(r)}
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const text = (r: string) => canvasElement.querySelector(`[data-testid="label-${r}"]`)?.textContent ?? '';
    expect(text('common')).toContain('Common');
    expect(text('rare')).toContain('Rare');
    expect(text('epic')).toContain('Epic');
    expect(text('mystic')).toContain('Mystic');
  },
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
      <RarityBadge rarity="mystic" />
      <p style={{ margin: 0, fontSize: 'var(--text-h4)', fontWeight: 700, color: 'var(--color-text)' }}>Epic 배지</p>
      <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>100km 완주 달성</p>
    </div>
  ),
};

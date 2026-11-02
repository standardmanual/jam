import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CollectionGridCard } from './CollectionGridCard';

const meta: Meta<typeof CollectionGridCard> = {
  title: 'MODULAR/Patterns/CollectionGridCard',
  component: CollectionGridCard,
  parameters: {
    layout: 'centered',
    docs: { description: { component: '레이아웃: 썸네일(투명 배경) → 타이틀 → [프로그레스바 | 카운트]. 썸네일 좌상단에 완성 태그 → 등급 태그들(폭이 모자라면 줄바꿈).' } },
  },
  argTypes: {
    completed: { control: 'boolean' },
    rarities: { control: 'check', options: ['common', 'rare', 'epic', 'mystic'] },
    collected: { control: { type: 'number', min: 0 } },
    total: { control: { type: 'number', min: 1 } },
  },
};

export default meta;
type Story = StoryObj<typeof CollectionGridCard>;

const SAMPLE_IMAGE = '/ds-assets/uploads/jam_logo.png';

/**
 * 크림 캔버스 위 카드 면(JAM 2.0 라이트, 티켓 20261015_2133) — BadgeGridCard와 같은 면(흰 면 + 1px --border + 안쪽 여백 12).
 * 진행 바 트랙은 ProgressBar 기본 트랙(--border)이라 크림 위에서도 보인다.
 */
export const OnCreamCanvas: Story = {
  name: '크림 캔버스 위 — 카드 면과 진행 바',
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div
      style={{
        width: 393, boxSizing: 'border-box', background: 'var(--background)', padding: 16,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
      }}
    >
      <CollectionGridCard name="한강 러너 컬렉션" imageUrl={SAMPLE_IMAGE} collected={5} total={10} rarities={['rare']} />
      <CollectionGridCard name="이미지 없는 컬렉션" collected={0} total={10} />
    </div>
  ),
};

export const InProgress: Story = {
  name: '수집 중 (5/10) — Rare',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 5,
    total: 10,
    rarities: ['rare'],
  },
};

export const Completed: Story = {
  name: '완성됨 — Epic',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
    rarities: ['epic'],
  },
};

export const CompletedNoRarity: Story = {
  name: '완성됨 — 등급 없음',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
  },
};

export const MultiRarities: Story = {
  name: '등급 여러 개 — Rare+Epic+Mystic (완성 아님)',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 4,
    total: 10,
    rarities: ['rare', 'epic', 'mystic'],
  },
};

export const CompletedWithRarities: Story = {
  name: '완성 + 등급 3개 — 완성 칩 뒤에 등급 칩',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
    rarities: ['rare', 'epic', 'mystic'],
  },
};

export const WrapNarrow: Story = {
  name: '좁은 폭(2열 320px) — 완성 + 등급 3개 줄바꿈',
  render: () => (
    <div style={{ width: 140 }}>
      <CollectionGridCard
        name="한강 러너 컬렉션"
        imageUrl={SAMPLE_IMAGE}
        collected={10}
        total={10}
        completed
        rarities={['rare', 'epic', 'mystic']}
      />
    </div>
  ),
};

export const CommonOnly: Story = {
  name: 'Common만 — 칩 없음',
  args: {
    name: '도시 탐험가 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 2,
    total: 10,
    rarities: ['common'],
  },
};

export const Empty: Story = {
  name: '시작 전 (0/10) — Common',
  args: {
    name: '도시 탐험가 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 0,
    total: 10,
    rarities: ['common'],
  },
};

export const AlmostDone: Story = {
  name: '거의 완성 (9/10) — Mystic',
  args: {
    name: '마라톤 챌린저',
    imageUrl: SAMPLE_IMAGE,
    collected: 9,
    total: 10,
    rarities: ['mystic'],
  },
};

export const NoImage: Story = {
  name: '이미지 없음',
  args: {
    name: '이미지 없는 컬렉션',
    imageUrl: null,
    collected: 3,
    total: 8,
    rarities: ['rare'],
  },
};

export const Grid: Story = {
  name: '그리드 레이아웃 (4종)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 160px)', gap: 'var(--spacing-16)' }}>
      <CollectionGridCard name="한강 러너" imageUrl={SAMPLE_IMAGE} collected={0} total={10} rarities={['common']} />
      <CollectionGridCard name="도시 탐험가" imageUrl={SAMPLE_IMAGE} collected={5} total={10} rarities={['rare']} />
      <CollectionGridCard name="마라톤 챌린저" imageUrl={SAMPLE_IMAGE} collected={9} total={10} rarities={['epic']} />
      <CollectionGridCard name="산악 마스터" imageUrl={SAMPLE_IMAGE} collected={10} total={10} completed rarities={['mystic']} />
    </div>
  ),
};

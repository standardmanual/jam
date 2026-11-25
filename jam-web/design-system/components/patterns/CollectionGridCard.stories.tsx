import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CollectionGridCard } from './CollectionGridCard';

const meta: Meta<typeof CollectionGridCard> = {
  title: 'MODULAR/Patterns/CollectionGridCard',
  component: CollectionGridCard,
  parameters: {
    layout: 'centered',
    docs: { description: { component: '레이아웃: 썸네일(투명 배경) → 타이틀 → [프로그레스바 | 카운트]. 진행 바 채움색은 홈 캡슐 게이지와 같은 --capsule-fill이다. 완성 카드는 면이 검정이고 바·숫자 자리에 등급 칩이 온다.' } },
  },
  argTypes: {
    completed: { control: 'boolean' },
    rarities: { control: 'object' },
    hideProgress: { control: 'boolean' },
    collected: { control: { type: 'number', min: 0 } },
    total: { control: { type: 'number', min: 1 } },
  },
};

export default meta;
type Story = StoryObj<typeof CollectionGridCard>;

const SAMPLE_IMAGE = '/ds-assets/uploads/jam_logo.png';

/**
 * 크림 캔버스 위 카드 면(JAM 2.0 라이트, 티켓 20261015_2133) — BadgeGridCard와 같은 면(흰 면 + 1px --border + 안쪽 여백 12).
 * 진행 바는 캡슐 모양(어두운 트랙 --capsule-track + 캡슐 게이지와 같은 --capsule-fill 채움)이라 크림·흰 면 위에서도 보인다. 완성 카드는 검정 면에 등급 칩.
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
      <CollectionGridCard name="한강 러너 컬렉션" imageUrl={SAMPLE_IMAGE} collected={5} total={10} />
      <CollectionGridCard name="이미지 없는 컬렉션" collected={0} total={10} />
      <CollectionGridCard name="산악 마스터" imageUrl={SAMPLE_IMAGE} collected={10} total={10} completed rarities={['rare', 'mystic']} />
      <CollectionGridCard name="이미지 없는 완성 컬렉션" collected={10} total={10} completed rarities={['rare']} />
    </div>
  ),
};

export const InProgress: Story = {
  name: '수집 중 (5/10)',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 5,
    total: 10,
  },
};

export const Completed: Story = {
  name: '완성됨',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
    rarities: ['rare', 'epic'],
  },
};

export const CompletedNoRarity: Story = {
  name: '완성됨 — 등급 칩 없음',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
  },
};

export const Empty: Story = {
  name: '시작 전 (0/10)',
  args: {
    name: '도시 탐험가 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 0,
    total: 10,
  },
};

export const AlmostDone: Story = {
  name: '거의 완성 (9/10)',
  args: {
    name: '마라톤 챌린저',
    imageUrl: SAMPLE_IMAGE,
    collected: 9,
    total: 10,
  },
};

export const NoImage: Story = {
  name: '이미지 없음',
  args: {
    name: '이미지 없는 컬렉션',
    imageUrl: null,
    collected: 3,
    total: 8,
  },
};

export const HideProgress: Story = {
  name: '진행 표시 숨김 (0/0) — 운영툴 미리보기',
  parameters: { docs: { description: { story: '전체 슬롯 수를 아직 모를 때 써요. 맨 아래 행이 없어서 카드가 그만큼 낮아져요.' } } },
  args: {
    name: '도시 탐험가 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 0,
    total: 0,
    hideProgress: true,
  },
  render: (args) => (
    <div style={{ width: 128 }}>
      <CollectionGridCard {...args} />
    </div>
  ),
};

export const HideProgressCompleted: Story = {
  name: '진행 표시 숨김이어도 등급 칩은 남음',
  parameters: { docs: { description: { story: '완성 카드는 hideProgress를 켜도 등급 칩 행이 그대로 보여요.' } } },
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: SAMPLE_IMAGE,
    collected: 10,
    total: 10,
    completed: true,
    rarities: ['epic'],
    hideProgress: true,
  },
};

export const Grid: Story = {
  name: '그리드 레이아웃 (4종)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 160px)', gap: 'var(--spacing-16)' }}>
      <CollectionGridCard name="한강 러너" imageUrl={SAMPLE_IMAGE} collected={0} total={10} />
      <CollectionGridCard name="도시 탐험가" imageUrl={SAMPLE_IMAGE} collected={5} total={10} />
      <CollectionGridCard name="마라톤 챌린저" imageUrl={SAMPLE_IMAGE} collected={9} total={10} />
      <CollectionGridCard name="산악 마스터" imageUrl={SAMPLE_IMAGE} collected={10} total={10} completed rarities={['rare', 'mystic']} />
    </div>
  ),
};

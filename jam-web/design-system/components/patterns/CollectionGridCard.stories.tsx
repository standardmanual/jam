import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CollectionGridCard } from './CollectionGridCard';

const meta: Meta<typeof CollectionGridCard> = {
  title: 'MODULAR/Patterns/CollectionGridCard',
  component: CollectionGridCard,
  parameters: { layout: 'centered' },
  argTypes: {
    completed: { control: 'boolean' },
    collected: { control: { type: 'number', min: 0 } },
    total: { control: { type: 'number', min: 1 } },
  },
};

export default meta;
type Story = StoryObj<typeof CollectionGridCard>;

const SAMPLE_IMAGE = '/ds-assets/uploads/jam_logo.png';

export const InProgress: Story = {
  name: '수집 중 (50%)',
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

export const Grid: Story = {
  name: '그리드 레이아웃 (3종)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 150px)', gap: 'var(--spacing-12)' }}>
      <CollectionGridCard name="한강 러너" imageUrl={SAMPLE_IMAGE} collected={0} total={10} />
      <CollectionGridCard name="도시 탐험가" imageUrl={SAMPLE_IMAGE} collected={5} total={10} />
      <CollectionGridCard name="마라톤 챌린저" imageUrl={SAMPLE_IMAGE} collected={10} total={10} completed />
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import CollectionGridCard from './CollectionGridCard';

const COVER = '/itembooks/sample/b001.png';

const meta: Meta<typeof CollectionGridCard> = {
  title: 'UI/Cards/CollectionGridCard',
  component: CollectionGridCard,
  parameters: { layout: 'centered' },
  // 서비스 그리드는 2열이라 한 칸 폭을 흉내 낸다
  decorators: [(Story) => <div style={{ width: 170 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof CollectionGridCard>;

/** 내 배지 목록(`BadgesClient`)의 컬렉션 탭 — 진행 바와 «수집/전체» 숫자 */
export const InProgress: Story = {
  name: '진행 중',
  args: { name: '한강 러너 컬렉션', imageUrl: COVER, collected: 3, total: 8, href: '/collections/sample' },
};

/** 내 배지 목록의 컬렉션 탭에서 아직 하나도 모으지 못한 컬렉션 */
export const NotStarted: Story = {
  name: '진행 전',
  args: { name: '한강 러너 컬렉션', imageUrl: COVER, collected: 0, total: 8, href: '/collections/sample' },
};

/** 내 배지 목록의 완성한 컬렉션 — 검정 면, 진행 바 자리에 장착한 배지의 등급 칩 */
export const Completed: Story = {
  name: '완성',
  args: {
    name: '한강 러너 컬렉션',
    imageUrl: COVER,
    collected: 8,
    total: 8,
    completed: true,
    rarities: ['common', 'rare', 'epic', 'mystic'],
    href: '/collections/sample',
  },
};

/** 표지 이미지가 없거나 불러오지 못한 컬렉션 — 책 아이콘으로 대체 */
export const ImageFallback: Story = {
  name: '이미지 없음',
  args: { name: '한강 러너 컬렉션', imageUrl: null, collected: 3, total: 8, href: '/collections/sample' },
};

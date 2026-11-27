import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CategorySticker } from './CategorySticker';

const meta: Meta<typeof CategorySticker> = {
  title: 'UI/Cards/CategorySticker',
  component: CategorySticker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈피드 «분류 스티커» — 티켓 20261122_2227. 정원(92×92) 바탕, 둘레 글자(굵기 900), ' +
          '가운데 JAM 로고 글자(색 채움 + 본문색 외곽선), 보색 짝 8개. 모양은 정원 하나이고 호출부는 홈 피드 칩 층이다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof CategorySticker>;

/** 홈 피드 카드(`FeedCardParts`의 `PlannedChipView`)에서 분류 문구를 단 조약돌 모양 스티커 */
export const Pebble: Story = {
  name: '조약돌 — MISSION',
  render: () => <CategorySticker label="MISSION" pair="green-pink" letter="J" />,
};

/** 같은 정원에 다른 문구·색 짝·로고 글자를 단 스티커 */
export const Item: Story = {
  name: 'ITEM',
  render: () => <CategorySticker label="ITEM" pair="pink-green" letter="a" />,
};

/** 가장 긴 분류 문구(컬렉션 카드의 COLLECTION)는 글자 크기를 줄여 둘레에 맞춘다 */
export const LongestLabel: Story = {
  name: '가장 긴 문구 — COLLECTION',
  render: () => <CategorySticker label="COLLECTION" pair="yellow-purple" letter="m" />,
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { CategorySticker, STICKER_COLOR_PAIRS } from './CategorySticker';
import type { CategoryStickerPair } from './CategorySticker';

const meta: Meta<typeof CategorySticker> = {
  title: 'UI/Cards/CategorySticker',
  component: CategorySticker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '홈피드 «분류 스티커» — 티켓 20261122_2227. 조약돌(96×92)·물결 덩어리(112×92), 둘레 글자(굵기 900), ' +
          '가운데 JAM 로고 글자(색 채움 + 본문색 외곽선), 보색 짝 8개. 같은 시드는 늘 같은 모양이다. 호출부는 다음 티켓이 붙인다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof CategorySticker>;

const PAIRS = Object.keys(STICKER_COLOR_PAIRS) as CategoryStickerPair[];
const LABELS = ['ACTIVITY', 'ITEM', 'MISSION', 'CHECK IN', 'COLLECTION', 'DROP', 'PICKUP'];
const LETTERS = ['J', 'a', 'm'] as const;
const SHAPES = ['pebble', 'wave'] as const;
const wrap: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 16 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };

export const PairsGrid: Story = {
  name: '두 모양 × 보색 짝 8개 (16장)',
  render: () => (
    <div style={col}>
      {SHAPES.map((shape) => (
        <div key={shape} style={wrap}>
          {PAIRS.map((pair, i) => (
            <CategorySticker key={pair} shape={shape} seed={`pair-${i}`} label="MISSION" pair={pair} letter={LETTERS[i % 3]} />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const Labels: Story = {
  name: '문구 7개 × 두 모양',
  render: () => (
    <div style={col}>
      {SHAPES.map((shape) => (
        <div key={shape} style={wrap}>
          {LABELS.map((label, i) => (
            <CategorySticker key={label} shape={shape} seed="labels" label={label} pair={PAIRS[i]} letter={LETTERS[i % 3]} />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const LongestLabel: Story = {
  name: '가장 긴 문구(COLLECTION) — 글자 줄임',
  render: () => (
    <div style={wrap}>
      <CategorySticker shape="pebble" seed="long" label="COLLECTION" pair="green-pink" letter="J" />
      <CategorySticker shape="wave" seed="long" label="COLLECTION" pair="pink-green" letter="a" />
      <CategorySticker shape="wave" seed="long" label="ITEM" pair="pink-green" letter="a" />
    </div>
  ),
};

export const Seeds: Story = {
  name: '시드 바꿔 보기 — 같은 시드는 같은 모양',
  render: () => (
    <div style={col}>
      {SHAPES.map((shape) => (
        <div key={shape} style={wrap}>
          {['a', 'b', 'c', 'd', 'e', 'f', 'a'].map((seed, i) => (
            <CategorySticker key={i} shape={shape} seed={seed} label="PICKUP" pair="yellow-purple" letter="m" />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const EmptyLabel: Story = {
  name: '문구 없음 — 바탕과 로고만',
  render: () => (
    <div style={wrap}>
      <CategorySticker shape="pebble" seed="empty" label="" pair="sky-red" letter="J" />
      <CategorySticker shape="wave" seed="empty" label="" pair="sky-red" letter="J" />
    </div>
  ),
};

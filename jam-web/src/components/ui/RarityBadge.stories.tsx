import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { RarityBadge } from './RarityBadge';

const meta: Meta<typeof RarityBadge> = {
  title: 'UI/Cards/RarityBadge',
  component: RarityBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: '등급(Common~Mystic) 라벨 칩.',
      },
    },
  },
  argTypes: {
    rarity: { control: 'radio', options: ['common', 'rare', 'epic', 'mystic'] },
    size: { control: 'radio', options: ['sm', 'md', 'row'] },
  },
};

export default meta;
type Story = StoryObj<typeof RarityBadge>;

/** 홈 피드·미션 목록·레시피 보상 행(`ListRow`) 안의 등급 칩 — 12px 글자 · 높이 20px */
export const RowRare: Story = {
  name: '행 안 칩 · Rare',
  args: { rarity: 'rare', size: 'row' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 홈 피드·미션 목록·레시피 보상 행 안의 등급 칩 */
export const RowEpic: Story = {
  name: '행 안 칩 · Epic',
  args: { rarity: 'epic', size: 'row' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 홈 피드·미션 목록·레시피 보상 행 안의 등급 칩 */
export const RowMystic: Story = {
  name: '행 안 칩 · Mystic',
  args: { rarity: 'mystic', size: 'row' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 배지 상세 제목 박스·컬렉션 상세·후보 행의 등급 칩 — 12px 글자 · 높이 20px */
export const MdRare: Story = {
  name: '상세 칩 · Rare',
  args: { rarity: 'rare', size: 'md' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 배지 상세 제목 박스·컬렉션 상세·후보 행의 등급 칩 */
export const MdEpic: Story = {
  name: '상세 칩 · Epic',
  args: { rarity: 'epic', size: 'md' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 배지 상세 제목 박스·컬렉션 상세·후보 행의 등급 칩 */
export const MdMystic: Story = {
  name: '상세 칩 · Mystic',
  args: { rarity: 'mystic', size: 'md' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).fontSize).toBe('12px');
    expect(chip.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};

/** 등급 올리기(`TierUpPanel`)의 재료 묶음 머리글 — `showCommon`을 켜면 Common도 칩으로 그린다 */
export const CommonShown: Story = {
  name: 'Common 표시(showCommon)',
  args: { rarity: 'common', showCommon: true, size: 'md' },
  play: async ({ canvasElement }) => {
    expect(canvasElement.textContent).toBe('Common');
    // 면은 레벨 칩과 같다: --default-soft(#e5e5e5) 면 + --foreground(#171717) 글자
    const chip = canvasElement.querySelector('span') as HTMLElement;
    expect(getComputedStyle(chip).backgroundColor).toBe('rgb(229, 229, 229)');
    expect(getComputedStyle(chip).color).toBe('rgb(23, 23, 23)');
  },
};

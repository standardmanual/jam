import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { d } from '@/lib/i18n';
import { BadgeHeroSection } from './BadgeHeroSection';
import { LabelChip } from './LabelChip';
import { LockedTile } from './LockedTile';
import { MedalIcon } from '@/components/ui/icons';

const SAMPLE = '/badges/sample/s331.png';

const meta: Meta<typeof BadgeHeroSection> = {
  title: 'UI/Cards/BadgeHeroSection',
  component: BadgeHeroSection,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '«배지 한 장의 대표 카드» — 티켓 20261112_1818. 이미지 · 등급/레벨 칩 · 이름 · 설명을 가운데 정렬로 쌓은 흰 카드(`--card-bg`, `--radius-2xl`, 외곽선 없음). ' +
          '서비스 도메인 지식(이미지 안전 렌더, 블롭 배경, 테마 판정, 문장 나누기)은 모두 슬롯과 값으로 받는다. ' +
          '이 부품은 DS에서 처음으로 Tailwind 별칭 클래스(`gap-4 p-6`, `text-snow` 등)를 그대로 쓴다 — 서비스 시험이 클래스 문자열을 단언하고 시각 변화가 0이어야 해서다. ' +
          '`onMedia`는 어두운 면 위 전용이고, 카드 한 장 전용이다(목록 행에는 ListRow).',
      },
    },
  },
  argTypes: {
    size: { control: 'radio', options: ['page', 'sheet'] },
    rarity: { control: 'radio', options: ['common', 'rare', 'epic', 'mystic'] },
    onMedia: { control: 'boolean' },
    strongText: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeHeroSection>;

/** 서비스 어댑터가 만드는 기본 이미지 상자와 같은 크기 규칙(page 200 / sheet 176)이다. 크기 규칙은 슬롯 안에서 호출부가 정한다. */
const Image = ({ px, alt }: { px: number; alt: string }) => (
  <div style={{ width: px, height: px }} className="flex items-center justify-center">
    {/* eslint-disable-next-line @next/next/no-img-element -- 스토리 샘플 이미지 */}
    <img src={SAMPLE} alt={alt} width={px} height={px} className="object-contain w-full h-full" />
  </div>
);

/** 서비스 열 폭(430)과 모바일 최소 폭(360) 두 가지로 확인한다. */
const Column = ({ children, width = 430 }: { children: React.ReactNode; width?: number }) => (
  <div data-testid="column" style={{ width, background: 'var(--background)', padding: '16px 0' }}>
    {children}
  </div>
);

const DESCRIPTION = ['짝 잃은 양말이 제 짝을 찾아 빨랫줄에 나란히 걸렸습니다.', '오늘도 한 걸음 더 달려 봐요.'];

/** 배지 상세 페이지(`badges/[id]`)의 대표 카드 */
export const Page: Story = {
  name: '기본 — page',
  render: () => (
    <Column>
      <BadgeHeroSection name="한강 러너" rarity="rare" descriptionLines={DESCRIPTION} imageSlot={<Image px={200} alt="한강 러너" />} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const h1 = canvasElement.querySelector('h1')!;
    expect(h1.textContent).toBe('한강 러너');
    expect(h1.className).toContain('text-foreground');
    const card = h1.closest('.rounded-2xl') as HTMLElement;
    expect(card.className).toContain('bg-card-bg');
    expect(card.className).toContain('p-6');
    expect(getComputedStyle(card).borderTopWidth).toBe('0px');
    expect(canvasElement.querySelectorAll('p').length).toBe(1);
    expect(canvasElement.querySelectorAll('p > span').length).toBe(2);
  },
};

/** 지도 드랍 바텀시트(`BadgeDetailSheet`)의 대표 카드 */
export const Sheet: Story = {
  name: '기본 — sheet (폭 360)',
  render: () => (
    <Column width={360}>
      <div style={{ padding: '0 16px' }}>
        <BadgeHeroSection size="sheet" name="한강 러너" rarity="epic" descriptionLines={DESCRIPTION} imageSlot={<Image px={176} alt="한강 러너" />} />
      </div>
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('h1')!.closest('.rounded-2xl') as HTMLElement;
    expect(card.className).toContain('py-6');
    expect(card.className).toContain('px-4');
  },
};

/** 무한레벨형 배지(등급 대신 Lv.N 칩)의 상세 대표 카드 */
export const Leveled: Story = {
  name: '레벨형 — Lv.N 칩',
  render: () => (
    <Column>
      <BadgeHeroSection name="누적 러닝 거리" level={7} descriptionLines={['누적 70km를 달렸어요.']} imageSlot={<Image px={200} alt="누적 러닝 거리" />} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.textContent).toContain('Lv.7');
  },
};

/** 잠긴 아이템 배지 상세(`LockedItemDetail`)의 대표 카드 — 이름·설명을 가리고 «잠김» 칩을 붙인다 */
export const Locked: Story = {
  name: '잠긴 개체 — chipExtra · titleNode · descriptionNode',
  render: () => (
    <Column>
      <BadgeHeroSection
        name="잠긴 배지"
        rarity="rare"
        chipExtra={<LabelChip>{d.lockedItem.detail.chip}</LabelChip>}
        titleNode={d.lockedItem.card.name}
        descriptionNode={d.lockedItem.detail.description}
        imageSlot={<LockedTile size={200} />}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.textContent).toContain(d.lockedItem.detail.chip);
    expect(canvasElement.querySelector('h1')!.textContent).toBe(d.lockedItem.card.name);
    expect(canvasElement.querySelectorAll('p').length).toBe(1);
  },
};

/** 배지 이미지가 없을 때 메달 아이콘으로 대신하는 대표 카드 */
export const NoImage: Story = {
  name: '이미지 없음 — MedalIcon',
  render: () => (
    <Column>
      <BadgeHeroSection name="이름 없는 도전" rarity="common" descriptionLines={['아직 이미지가 없어요.']} imageSlot={<MedalIcon className="w-28 h-28" />} />
    </Column>
  ),
};

/** 설명이 없는 배지의 대표 카드 — 설명 블록을 그리지 않는다 */
export const NoDescription: Story = {
  name: '설명 없음 — 설명 블록 미렌더',
  render: () => (
    <Column>
      <BadgeHeroSection name="한강 러너" rarity="rare" imageSlot={<Image px={200} alt="한강 러너" />} />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelectorAll('p').length).toBe(0);
  },
};

/** 배경 슬롯은 카드 안에만 갇히고 라운드로 잘린다. 샘플은 `--background-inverse` 단색 블록 하나다(실제 서비스는 블롭 캔버스를 넣는다). */
export const WithBackground: Story = {
  name: '배경 슬롯 있음 — onMedia',
  render: () => (
    <Column>
      <BadgeHeroSection
        onMedia
        backgroundColor="var(--background-inverse)"
        backgroundSlot={<div data-testid="bg" className="absolute inset-0 z-0" style={{ background: 'var(--background-inverse)' }} />}
        name="새벽 러너"
        rarity="mystic"
        descriptionLines={DESCRIPTION}
        imageSlot={<Image px={200} alt="새벽 러너" />}
      />
    </Column>
  ),
  play: async ({ canvasElement }) => {
    const h1 = canvasElement.querySelector('h1')!;
    expect(h1.className).toContain('text-snow');
    expect(canvasElement.querySelector('p')!.className).toContain('text-snow');
    const card = h1.closest('.rounded-2xl') as HTMLElement;
    expect(card.className).toContain('bg-transparent');
    expect(card.querySelector('[data-testid="bg"]')).toBeTruthy();
  },
};

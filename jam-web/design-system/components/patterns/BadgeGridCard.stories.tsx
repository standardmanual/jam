import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { expect } from 'storybook/test';
import { BadgeGridCard } from './BadgeGridCard';

const meta: Meta<typeof BadgeGridCard> = {
  title: 'MODULAR/Patterns/BadgeGridCard',
  component: BadgeGridCard,
  parameters: { layout: 'centered', docs: { description: { component: '레이아웃: 썸네일(투명 배경) → 이름 → 등급 pill 또는 Lv.N 칩(있을 때만). 반복 획득은 썸네일 모서리 ×N.' } } },
  argTypes: {
    rarity: { control: 'select', options: ['common', 'rare', 'epic', 'mystic', null] },
    level: { control: 'number' },
    count: { control: 'number' },
    earned: { control: 'boolean' },
    undiscovered: { control: 'boolean' },
    selected: { control: 'boolean' },
    highlighted: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeGridCard>;

// 실제 DB의 badges 테이블에서 등급별 샘플 이미지를 가져왔다 (public/badges/sample/ 시드 자산).
const SAMPLE_IMAGES = {
  common: '/badges/sample/s222.png', // 혹한의 등반자
  rare: '/badges/sample/s142.png', // 첫 숨결 레벨업
  epic: '/badges/sample/s331.png', // 첫 숨결 레벨업 Hard
  mystic: '/badges/sample/s019.png', // 야생의 주자 레벨업 Ultra
} as const;

export const EarnedCommon: Story = {
  name: '획득됨 — Common',
  args: {
    name: '첫 러닝',
    imageUrl: SAMPLE_IMAGES.common,
    rarity: 'common',
    earned: true,
  },
};

export const EarnedRare: Story = {
  name: '획득됨 — Rare',
  args: {
    name: '10km 완주',
    imageUrl: SAMPLE_IMAGES.rare,
    rarity: 'rare',
    earned: true,
  },
};

export const EarnedEpic: Story = {
  name: '획득됨 — Epic',
  args: {
    name: '한강 마스터',
    imageUrl: SAMPLE_IMAGES.epic,
    rarity: 'epic',
    earned: true,
  },
};

export const EarnedMystic: Story = {
  name: '획득됨 — Mystic',
  args: {
    name: '신화의 달리기',
    imageUrl: SAMPLE_IMAGES.mystic,
    rarity: 'mystic',
    earned: true,
  },
};

export const Unearned: Story = {
  name: '미획득 (흑백+반투명)',
  args: {
    name: '미획득 배지',
    imageUrl: SAMPLE_IMAGES.rare,
    rarity: 'rare',
    earned: false,
  },
};

export const Undiscovered: Story = {
  name: '미발견 (??? 표시)',
  args: {
    name: '???',
    imageUrl: SAMPLE_IMAGES.epic,
    rarity: 'epic',
    undiscovered: true,
    earned: false,
  },
};

export const Selected: Story = {
  // 20260816_012: 2px 보더 링 → 배경톤 채움(rgba primary 15%)으로 대체
  name: '선택됨 (배경톤 강조)',
  args: {
    name: '선택된 배지',
    imageUrl: SAMPLE_IMAGES.rare,
    rarity: 'rare',
    earned: true,
    selected: true,
  },
};

export const Highlighted: Story = {
  // 컬렉션 슬롯 장착 모드(`/collections/[id]?slot=1`)에서 "지금 넣을 수 있는 칸"을 짚어주는
  // 강조 링 — selected(배경톤 채움)와 시각적으로 다르다.
  name: '슬롯 하이라이트 (강조 링)',
  args: {
    name: '장착 가능 칸',
    imageUrl: SAMPLE_IMAGES.epic,
    rarity: 'epic',
    earned: true,
    highlighted: true,
  },
};

export const NoImage: Story = {
  name: '이미지 없음',
  args: {
    name: '이미지 없는 배지',
    imageUrl: null,
    rarity: 'common',
    earned: true,
  },
};

export const WithChildren: Story = {
  name: '슬롯 버튼 포함',
  args: {
    name: '아이템 배지',
    imageUrl: SAMPLE_IMAGES.mystic,
    rarity: 'mystic',
    earned: true,
    children: (
      <button
        style={{
          marginTop: 'var(--spacing-8)',
          padding: '4px 12px',
          fontSize: 'var(--text-small)',
          background: 'var(--color-primary)',
          color: 'var(--color-text-inverse)',
          border: 'none',
          borderRadius: 'var(--radius-pill)',
          cursor: 'pointer',
        }}
      >
        믹스하기
      </button>
    ),
  },
};

export const Grid: Story = {
  name: '그리드 레이아웃 (4×2)',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 120px)', gap: 'var(--spacing-8)' }}>
      {([
        { name: '첫 러닝', rarity: 'common', earned: true },
        { name: '10km 완주', rarity: 'rare', earned: true },
        { name: '한강 마스터', rarity: 'epic', earned: true },
        { name: '신화의 달리기', rarity: 'mystic', earned: true },
        { name: '미획득 배지', rarity: 'common', earned: false },
        { name: '???', rarity: 'rare', earned: false, undiscovered: true },
        { name: '선택됨', rarity: 'epic', earned: true, selected: true },
        { name: '이미지 없음', rarity: 'mystic', earned: true, imageUrl: null },
      ] as const).map((props, i) => (
        <BadgeGridCard key={i} {...props} imageUrl={'imageUrl' in props ? props.imageUrl : SAMPLE_IMAGES[props.rarity]} />
      ))}
    </div>
  ),
};

export const Interactive: Story = {
  name: '인터랙티브 (선택 모드)',
  render: () => {
    const items = [
      { id: 1, name: '첫 러닝', rarity: 'common' as const },
      { id: 2, name: '10km 완주', rarity: 'rare' as const },
      { id: 3, name: '한강 마스터', rarity: 'epic' as const },
      { id: 4, name: '신화의 달리기', rarity: 'mystic' as const },
    ];
    const [selected, setSelected] = useState<number | null>(null);
    return (
      <div>
        <p style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-12)', textAlign: 'center' }}>
          {selected != null ? `"${items.find(i => i.id === selected)?.name}" 선택됨` : '배지를 선택해 보세요'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 120px)', gap: 'var(--spacing-8)' }}>
          {items.map(item => (
            <BadgeGridCard
              key={item.id}
              name={item.name}
              imageUrl={SAMPLE_IMAGES[item.rarity]}
              rarity={item.rarity}
              earned
              selected={selected === item.id}
              onClick={() => setSelected(selected === item.id ? null : item.id)}
            />
          ))}
        </div>
      </div>
    );
  },
};

/**
 * 미획득·미발견 썸네일 — 원본 + grayscale(1) (2026-09-06 확정).
 *
 * 미획득·미발견 썸네일은 **원본 이미지 + `filter: grayscale(1)`** 이다.
 * 20260905_0036이 한때 실루엣으로 바꿨다가 2026-09-06 사용자 확정으로 되돌렸다 —
 * 외형을 감추는 것보다 어떤 배지인지 알아볼 수 있는 쪽을 택한다.
 */
export const GrayscaleWhenHidden: Story = {
  name: '미획득·미발견 — 원본 이미지를 그레이로',
  render: () => (
    <div data-testid="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 'var(--spacing-8)' }}>
      <BadgeGridCard name="동네 산책러" imageUrl={SAMPLE_IMAGES.rare} rarity="rare" earned />
      <BadgeGridCard name="동네 산책러" imageUrl={SAMPLE_IMAGES.rare} rarity="rare" earned={false} />
      <BadgeGridCard name="동네 산책러" imageUrl={SAMPLE_IMAGES.rare} rarity="rare" undiscovered />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // 세 장 모두 **원본 이미지**를 쓴다(실루엣 폐기, 2026-09-06 확정). 감추는 건 색뿐이다.
    const imgs = canvasElement.querySelector('[data-testid="cards"]')!.querySelectorAll('img');
    expect(imgs.length).toBe(3);
    expect(imgs[0].style.filter).toBe('none');
    expect(imgs[1].style.filter).toBe('grayscale(1)');
    expect(imgs[2].style.filter).toBe('grayscale(1)');
  },
};

/**
 * v5 배지 종류별 칩 (티켓 20260905_0038 B).
 * 레벨형은 `rarity`가 NULL이고 `level`만 있다 — 등급 칩 자리를 `BadgeLevelChip`이 가져간다.
 * 두 축은 배타적이라 한 카드에 칩이 두 개 그려지는 상태는 존재하지 않는다.
 */
export const LevelChip: Story = {
  name: '레벨형 — 등급 칩 대신 Lv.N',
  render: () => (
    <div data-testid="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 'var(--spacing-8)' }}>
      <BadgeGridCard name="첫 숨결" imageUrl={SAMPLE_IMAGES.rare} rarity="rare" earned />
      <BadgeGridCard name="첫 숨결" imageUrl={SAMPLE_IMAGES.rare} rarity={null} level={7} earned />
      <BadgeGridCard name="첫 숨결" imageUrl={SAMPLE_IMAGES.rare} rarity={null} level={128} earned />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cards = canvasElement.querySelector('[data-testid="cards"]')!;
    expect(cards.textContent).toContain('Lv.7');
    expect(cards.textContent).toContain('Lv.128');
    expect(cards.textContent).toContain('Rare');
  },
};

/**
 * 반복 획득 «×N» (티켓 20260905_0038 B).
 * 1회면 아무것도 붙지 않는다 — 「한 번 받았다」를 굳이 숫자로 말하지 않는다.
 */
/**
 * 긴 이름 — 말줄임(ellipsis) 대신 2줄까지 그대로 보여준다(티켓 20260909_2226).
 * 3줄 이상 넘치는 부분만 잘린다(line-clamp: 2).
 */
export const LongName: Story = {
  name: '긴 이름 — 2줄 표시',
  args: {
    name: '겨울 한강 야간 러닝 마스터 챌린지',
    imageUrl: SAMPLE_IMAGES.epic,
    rarity: 'epic',
    earned: true,
  },
};

export const RepeatCount: Story = {
  name: '반복 획득 — 썸네일 ×N',
  render: () => (
    <div data-testid="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 'var(--spacing-8)' }}>
      <BadgeGridCard name="한 번 받은 배지" imageUrl={SAMPLE_IMAGES.common} rarity="common" count={1} earned />
      <BadgeGridCard name="세 번 받은 배지" imageUrl={SAMPLE_IMAGES.rare} rarity="rare" count={3} earned />
      <BadgeGridCard name="열다섯 번 받은 배지" imageUrl={SAMPLE_IMAGES.epic} rarity="epic" count={15} earned />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const cards = canvasElement.querySelector('[data-testid="cards"]')!;
    // 1회 카드에는 필이 아예 없다 — 「한 번 받았다」를 숫자로 말하지 않는다.
    expect(cards.children[0].textContent).not.toContain('×');
    expect(cards.children[1].textContent).toContain('×3');
    expect(cards.children[2].textContent).toContain('×15');
  },
};

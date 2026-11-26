import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import BadgeGridCard, { BadgeGridCardPlaceholder } from './BadgeGridCard';
import { LabelChip } from './LabelChip';
import { ListRowChip } from './ListRow';
import { d } from '@/lib/i18n';

const SAMPLE = '/badges/sample/s331.png';
const SAMPLE_B = '/badges/sample/s222.png';

const meta: Meta<typeof BadgeGridCard> = {
  title: 'UI/Cards/BadgeGridCard',
  component: BadgeGridCard,
  parameters: { layout: 'centered' },
  // 서비스 그리드는 3열(grid-cols-3)이라 한 칸 폭을 흉내 낸다
  decorators: [(Story) => <div style={{ width: 114 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof BadgeGridCard>;

/** 인벤토리 목록(`InventoryGrid`)의 아이템 배지 카드 — 등급 칩이 붙는 기본 모양 */
export const Default: Story = {
  name: '기본 · 등급 칩',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', href: '/inventory/sample' },
};

/** 내 배지 목록(`BadgesClient`)의 무한레벨형 배지 — 등급 칩 자리에 Lv.N 칩 */
export const WithLevel: Story = {
  name: '레벨 칩',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: null, level: 3, showCommonChip: true, href: '/badges/sample' },
};

/** 내 배지 목록의 활동 배지 — Common도 등급 칩으로 알린다 */
export const CommonChip: Story = {
  name: 'Common 칩 포함',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'common', showCommonChip: true, href: '/badges/sample' },
};

/** 내 배지 목록의 체크인 배지 — 이름 아래 «×방문 횟수» 칩 */
export const VisitCount: Story = {
  name: '방문 횟수 칩',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: null, visitCount: 3, href: '/badges/sample' },
};

/** 내 배지 목록·배지 상세 아래 목록에서 아직 얻지 못한 배지 — 흑백 반투명 */
export const NotEarned: Story = {
  name: '미획득',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', showCommonChip: true, earned: false, href: '/badges/sample' },
};

/** 인벤토리 선택 모드(`InventoryGrid`) — 같은 배지를 여러 개 가지면 썸네일 모서리에 «×N» */
export const WithCount: Story = {
  name: '획득 횟수 ×N',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', count: 3, onClick: () => {} },
};

/** 인벤토리 만료 임박 개체 — 카드 아래에 만료 칩 */
export const ExpiringChip: Story = {
  name: '만료 임박 칩',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', href: '/inventory/sample' },
  render: (args) => (
    <BadgeGridCard {...args}>
      <ListRowChip style={{ background: 'transparent', color: 'var(--muted)', boxShadow: 'inset 0 0 0 1px var(--border)' }}>
        {`11/30${d.inventory.expiringSuffix}`}
      </ListRowChip>
    </BadgeGridCard>
  ),
};

/** 컬렉션 장착 시트의 개체 후보(`ItemCandidateRow`) — 고른 카드는 블랙 링 */
export const Selected: Story = {
  name: '선택됨',
  args: { name: '', imageUrl: SAMPLE, rarity: null, selected: true, pressed: true, onClick: () => {} },
};

/** 믹스 가방(`BagItemCell`)에서 이미 레시피에 넣은 배지 — 흑백 반투명 + «추가됨» 칩 */
export const MixerUsed: Story = {
  name: '믹스에 추가됨',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', earned: false, onClick: () => {} },
  render: (args) => (
    <BadgeGridCard {...args}>
      <div className="flex justify-center">
        <LabelChip>{d.combine.bagUsedLabel}</LabelChip>
      </div>
    </BadgeGridCard>
  ),
};

/** 믹스 결과·인벤토리의 잠긴 아이템 배지 — 이름·그림을 가리고 잠금 타일 */
export const Locked: Story = {
  name: '잠김',
  args: { rarity: 'rare', locked: true },
};

/** 컬렉션 상세(`SlotGrid`)에서 후보가 없는 칸 — 이미지 윤곽의 점선 */
export const Undiscovered: Story = {
  name: '미발견 칸',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: null, earned: false, undiscovered: true },
};

/** 컬렉션 상세 장착 모드에서 지금 넣을 수 있는 칸 — 흑백 이미지 위에 점선과 하이라이트 */
export const Slottable: Story = {
  name: '넣을 수 있는 칸',
  args: {
    name: '한강 러너',
    imageUrl: SAMPLE,
    rarity: 'rare',
    earned: false,
    outlined: true,
    highlighted: true,
    nameMuted: true,
    chipGray: true,
    href: '/badges/sample',
  },
};

/** 컬렉션 상세에서 아직 장착하지 않은 칸 — 이름과 등급 칩을 흐리게 */
export const Unslotted: Story = {
  name: '미장착 칸',
  args: {
    name: '한강 러너',
    imageUrl: SAMPLE_B,
    rarity: 'epic',
    earned: false,
    nameMuted: true,
    chipGray: true,
    href: '/badges/sample',
  },
};

/** 이미지 주소가 없거나 불러오지 못했을 때 — 메달 아이콘으로 대체(`SafeImage` fallback) */
export const ImageFallback: Story = {
  name: '이미지 없음',
  args: { name: '한강 러너', imageUrl: null, rarity: 'rare', href: '/badges/sample' },
};

/** 체크인 지점 카드(`PoiCarouselModal`)의 3열 갤러리 — 좁은 칸용 고정 규격 */
export const Compact: Story = {
  name: '컴팩트',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', compact: true, onClick: () => {} },
  decorators: [(Story) => <div style={{ width: 96 }}><Story /></div>],
};

/** 체크인 지점 갤러리에서 같은 배지를 여러 번 받은 칸 — 썸네일 모서리 «×N» */
export const CompactWithCount: Story = {
  name: '컴팩트 · 획득 횟수 ×N',
  args: { name: '한강 러너', imageUrl: SAMPLE, rarity: 'rare', count: 2, compact: true, onClick: () => {} },
  decorators: [(Story) => <div style={{ width: 96 }}><Story /></div>],
};

/** 체크인 지점 갤러리의 잠긴 아이템 배지 칸 */
export const CompactLocked: Story = {
  name: '컴팩트 · 잠김',
  args: { rarity: 'rare', compact: true, locked: true, onClick: () => {} },
  decorators: [(Story) => <div style={{ width: 96 }}><Story /></div>],
};

/** 인벤토리 목록의 비어 있는 슬롯(`InventoryGrid`의 `emptySlots`) */
export const Placeholder: Story = {
  name: '빈 슬롯',
  render: () => <BadgeGridCardPlaceholder />,
};

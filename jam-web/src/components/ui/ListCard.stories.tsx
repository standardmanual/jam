import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ListCard } from './ListCard';
import { ListRowChip } from './ListRow';
import { PointText } from './PointText';
import { LockIcon } from './icons';
import { d } from '@/lib/i18n';

const IMAGE = '/itembooks/sample/b001.png';

const meta: Meta<typeof ListCard> = {
  title: 'UI/Cards/ListCard',
  component: ListCard,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 358 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof ListCard>;

/** 미션 목록(`MissionsListClient`)의 열린 미션 — 이미지 위 제목, 상태·기간 칩, 보상 포인트 */
export const Open: Story = {
  name: '열린 미션',
  args: {
    imageUrl: IMAGE,
    title: '한강 러너 미션',
    description: '한강에서 달리고 배지를 모아 보세요.',
    chips: (
      <>
        <ListRowChip tone="done">{d.missions.tagNew}</ListRowChip>
        <ListRowChip tone="red">{d.missions.tagJoined}</ListRowChip>
        <ListRowChip>{d.missions.tagPermanent}</ListRowChip>
      </>
    ),
    value: <PointText value={500} />,
    href: '/missions/sample',
  },
};

/** 미션 목록의 시작 전 미션 — 이미지만 옅게 */
export const Upcoming: Story = {
  name: '시작 전 미션',
  args: {
    imageUrl: IMAGE,
    imageDim: 0.6,
    title: '한강 러너 미션',
    description: '한강에서 달리고 배지를 모아 보세요.',
    chips: <ListRowChip>{d.missions.tagUpcoming}</ListRowChip>,
    value: <span style={{ color: 'var(--muted)' }}>{d.missions.rewardNone}</span>,
    href: '/missions/sample',
  },
};

/** 미션 목록의 잠긴 미션 — 이미지는 흑백으로 옅게, 가운데 자물쇠, «조건» 줄 */
export const Locked: Story = {
  name: '잠긴 미션',
  args: {
    imageUrl: IMAGE,
    imageDim: 0.4,
    grayscale: true,
    imageOverlay: <LockIcon className="w-6 h-6" />,
    title: '한강 러너 미션',
    chips: <ListRowChip>{d.missions.tagLocked}</ListRowChip>,
    footer: (
      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 'var(--text-xs--line-height)' }}>
        <span style={{ marginRight: 'var(--spacing-4)' }}>{d.missions.cardConditionLabel}</span>
        {d.missions.lockedBodyGeneric}
      </span>
    ),
    onClick: () => {},
    'aria-disabled': 'true',
  },
};

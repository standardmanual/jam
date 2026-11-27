import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ListRow, ListRowChip, ListRowEm } from './ListRow';
import Avatar from './Avatar';
import Button from './Button';
import { LockedTile } from './LockedTile';
import { PointText } from './PointText';
import { ProgressBar } from './ProgressBar';
import { RarityBadge } from './RarityBadge';
import { MagicBookIcon, PuzzleIcon } from './icons';
import SafeImage from '@/components/SafeImage';
import { d, t } from '@/lib/i18n';

const SAMPLE = '/badges/sample/s331.png';

const meta: Meta<typeof ListRow> = {
  title: 'UI/Cards/ListRow',
  component: ListRow,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 358 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof ListRow>;

const BadgeImage = () => (
  <SafeImage src={SAMPLE} alt="" width={48} height={48} fallback={null} />
);

/** 배지 상세 «획득 정보» 카드(`badges/[id]/page.tsx`)의 라벨·값 행 — 값은 한 줄로 고정 */
export const LabelValue: Story = {
  name: '라벨·값 행',
  args: {
    tone: 'flat',
    titleVariant: 'label',
    titleLines: 0,
    title: d.badges.earnedAt,
    value: '2026. 11. 25. 오후 5:38',
    valueNoWrap: true,
  },
};

/** 획득 이력 목록(`ItemEarnHistory`)의 행 — 날짜 + 쉐브론, 누르면 이력 시트 */
export const HistoryChevron: Story = {
  name: '쉐브론 행',
  args: { title: '2026. 11. 25. 오후 5:38', titleVariant: 'regular', titleLines: 2, chevron: true, onClick: () => {} },
};

/** 체크인 기록 목록(`PoiEarnHistory`)의 첫 기록 행 — 위에 «처음 받은 날» 칩 */
export const HistoryWithEyebrowChip: Story = {
  name: '쉐브론 행 · 위 칩',
  args: {
    eyebrow: <ListRowChip tone="neutral">{d.badges.firstEarnedChip}</ListRowChip>,
    title: '2026. 11. 25. 오후 5:38',
    titleVariant: 'regular',
    titleLines: 2,
    chevron: true,
    onClick: () => {},
  },
};

/** 배지 상세의 속한 컬렉션 행 — 타일 이미지, 이름, 쉐브론, 컬렉션 상세로 연결 */
export const CollectionLink: Story = {
  name: '타일 이미지 링크 행',
  args: {
    href: '/collections/sample',
    leadShape: 'tile',
    lead: <MagicBookIcon className="w-5 h-5 text-foreground" />,
    title: '한강 러너 컬렉션',
    chevron: true,
  },
};

/** 팔로우 목록(`FollowUserList`·프로필)의 사용자 행 — 원형 아바타와 오른쪽 팔로우 버튼 */
export const UserWithAction: Story = {
  name: '사용자 행 · 버튼',
  args: {
    href: '/runner',
    lead: <Avatar src={null} alt="" size={48} iconClassName="w-5 h-5 text-muted" />,
    leadShape: 'round',
    title: '러너',
    titleVariant: 'regular',
    trail: (
      <Button surface="sub" variant="primary" size="xs" className="shrink-0">
        {d.profile.followButton}
      </Button>
    ),
  },
};

/** 미션 참가자 상황(`MissionStatusClient`)의 달성 현황 행 — 오른쪽에 상태 칩 */
export const StatusChip: Story = {
  name: '값 칸 칩 행',
  args: {
    tone: 'tint',
    leadShape: 'round',
    lead: <Avatar src={null} alt="" size={48} iconClassName="w-5 h-5 text-muted" />,
    title: '러너',
    value: <ListRowChip tone="done">{d.missions.achieved}</ListRowChip>,
  },
};

/** 미션 순위(`RankingListRow`)의 행 — 순위 표시, 아바타, «나» 칩, 진행 막대, 값 */
export const Ranking: Story = {
  name: '순위 행',
  args: {
    tone: 'tint',
    leadShape: 'round',
    indicator: <span aria-hidden="true">2</span>,
    lead: <Avatar src={null} alt="" size={48} iconClassName="w-5 h-5 text-muted" />,
    title: '러너',
    titleSuffix: <ListRowChip tone="accent">{d.missions.statusMeChip}</ListRowChip>,
    meta: (
      <span aria-hidden="true" className="block">
        <ProgressBar as="span" percent={60} height={16} />
      </span>
    ),
    value: '12.5 km',
  },
};

/** 검정 카드(Card tone="inverse") 위 한 단계 밝은 어두운 행 — 미션 현황 티켓의 달성 현황·전체 랭킹 행 (티켓 20261127_1145) */
export const OnInverseRow: Story = {
  name: '검정 카드 위 행(달성 칩)',
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [(Story) => <div style={{ width: 358, padding: 12, background: 'var(--background-inverse)', borderRadius: 'var(--radius-2xl)' }}><Story /></div>],
  args: {
    tone: 'onInverse',
    leadShape: 'round',
    lead: <Avatar src={null} alt="" size={48} face="none" iconClassName="w-5 h-5 text-muted" />,
    title: '러너',
    value: <ListRowChip tone="ticket">{d.missions.achieved}</ListRowChip>,
  },
};

/** 같은 행의 미달성 모양 — 행 면보다 한 단계 밝은 회색 칩 */
export const OnInverseRowNotAchieved: Story = {
  name: '검정 카드 위 행(미달성 칩)',
  parameters: { backgrounds: { default: 'dark' } },
  decorators: [(Story) => <div style={{ width: 358, padding: 12, background: 'var(--background-inverse)', borderRadius: 'var(--radius-2xl)' }}><Story /></div>],
  args: {
    tone: 'onInverse',
    leadShape: 'round',
    lead: <Avatar src={null} alt="" size={48} face="none" iconClassName="w-5 h-5 text-muted" />,
    title: '러너',
    value: <ListRowChip tone="on-inverse">{d.missions.notAchieved}</ListRowChip>,
  },
};

/** 큰 상태 알약 — 달성(done 면)과 미달성(outline 외곽선)이 면 색만으로 갈린다 (티켓 20261127_1145) */
export const LargeStatusPill: Story = {
  name: '큰 상태 알약',
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <ListRowChip tone="done" size="lg">{d.missions.achieved}</ListRowChip>
      <ListRowChip tone="outline" size="lg">{d.missions.notAchieved}</ListRowChip>
    </div>
  ),
};

/** 알림함(`NotificationsClient`)의 알림 행 — 문장형 제목에 굵은 핵심어와 시간 */
export const Notification: Story = {
  name: '알림 문장 행',
  args: {
    lead: <MagicBookIcon className="w-5 h-5" />,
    title: (
      <>
        <ListRowEm>한강 러너</ListRowEm>, 절반을 넘었어요
      </>
    ),
    titleVariant: 'sentence',
    time: '3분 전',
    href: '/missions/sample',
  },
};

/** 알림함의 새 소식 행 — 검정 면 */
export const NotificationInverse: Story = {
  name: '알림 문장 행 · 새 소식',
  args: {
    tone: 'inverse',
    lead: <MagicBookIcon className="w-5 h-5" />,
    title: (
      <>
        <ListRowEm>한강 러너</ListRowEm>, 절반을 넘었어요
      </>
    ),
    titleVariant: 'sentence',
    time: '3분 전',
    href: '/missions/sample',
  },
};

/** 프로필 피드(`FeedSection`)의 이벤트 행 — 배지 이미지, ×N, 이벤트 이름, 부제, 마지막 파편 칩 */
export const FeedEvent: Story = {
  name: '피드 이벤트 행',
  args: {
    lead: <BadgeImage />,
    leadBadge: '×3',
    eyebrow: '아이템 배지 드랍',
    time: '3분 전',
    title: '한강 러너',
    meta: t(d.feed.fragmentOf, { tribe: '아스팔트 레인저' }),
    chips: (
      <ListRowChip tone="neutral" style={{ gap: 'var(--spacing-4)' }}>
        <PuzzleIcon className="w-3 h-3" />
        {d.feed.lastPiece}
      </ListRowChip>
    ),
    onClick: () => {},
  },
};

/** 프로필 피드의 활동 묶음 머리 행 — 이미지 없이 글만, 아래에 썸네일 줄, 누르면 펼침 */
export const FeedGroup: Story = {
  name: '피드 묶음 행',
  args: {
    variant: 'media',
    tone: 'flat',
    eyebrow: '한강 러너',
    time: '3분 전',
    title: '배지 3개를 획득했어요',
    footer: (
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <SafeImage src={SAMPLE} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" fallback={null} />
        <span className="text-xs leading-none text-muted">{t(d.feed.groupMoreCount, { count: 2 })}</span>
      </span>
    ),
    'aria-expanded': false,
    onClick: () => {},
  },
};

/** 미션 상세(`MissionDetailClient`)의 잠긴 보상 행 — 잠금 타일, 등급 칩, «잠긴 아이템 배지» */
export const LockedReward: Story = {
  name: '잠긴 보상 행',
  args: {
    tone: 'tint',
    lead: <LockedTile size={48} />,
    eyebrow: <RarityBadge rarity="rare" size="row" />,
    title: d.lockedItem.card.name,
  },
};

/** 믹스 레시피 목록(`RecipeRewardRow`)의 행 — 보상 배지 이미지, 등급·잠김 칩, +N, 획득 포인트 */
export const RecipeReward: Story = {
  name: '레시피 보상 행',
  args: {
    lead: <BadgeImage />,
    eyebrow: (
      <span className="inline-flex items-center gap-1">
        <RarityBadge rarity="rare" size="row" />
        <ListRowChip tone="neutral">{d.lockedItem.detail.chip}</ListRowChip>
      </span>
    ),
    title: '한강 러너 +1',
    titleVariant: 'strong',
    titleLines: 1,
    titleSuffix: <ListRowChip tone="neutral">6</ListRowChip>,
    value: <PointText value={50} unit={d.combine.pointsUnit} layout="stacked" />,
    onClick: () => {},
  },
};

/** 포인트 내역(`PointHistoryList`)의 행 — 사유, 대상, 일시, 오른쪽 포인트 증감 */
export const PointHistory: Story = {
  name: '포인트 내역 행',
  args: {
    eyebrow: '미션 보상',
    title: '한강 러너',
    meta: '2026. 11. 25. 오후 5:38',
    metaLines: 1,
    value: <PointText value="+500" unit={d.points.unitSuffix} layout="stacked" />,
  },
};

/** 믹스 화면 위쪽 «등급 올리기» 입구 행 — 제목과 두 줄 부제, 쉐브론 */
export const EntryWithMeta: Story = {
  name: '부제 행',
  args: {
    title: d.combine.tierUp.title,
    meta: d.combine.tierUp.entrySubtitle,
    metaLines: 2,
    chevron: true,
    onClick: () => {},
  },
};

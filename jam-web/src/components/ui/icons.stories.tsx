import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  MedalIcon,
  CheckinIcon,
  TicketIcon,
  CrateIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  FlaskIcon,
  NewspaperIcon,
  PodiumIcon,
  MagicBookIcon,
  SparkleCircleIcon,
  PinIcon,
  InfoIcon,
  CoinIcon,
  MixingBowlIcon,
  PuzzleIcon,
  SyncCircleIcon,
  UserIcon,
  UsersIcon,
  CheckBoldIcon,
  XBoldIcon,
  LockIcon,
  AlertTriangleIcon,
  InboxIcon,
  BellIcon,
  SearchIcon,
  PencilIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  PlusIcon,
  MinusIcon,
  CloseIcon,
  CheckIcon,
  SyncIcon,
  TreasureBoxIcon,
  LocateIcon,
  AlertCircleIcon,
  BanIcon,
  CopyIcon,
  DownloadIcon,
  MoreIcon,
} from './icons';

// 카탈로그 격자는 스토리 안에서만 쓴다(정본 컴포넌트가 아니다). 아이콘은 서비스 icons.tsx 정본이다.
interface IconEntry {
  name: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { variant?: 'line' | 'fill' }>;
  role: string;
  section: string;
  lineOnly: boolean;
}

/** 카탈로그에 노출할 전체 아이콘 — 사양(spec.json) 순서. role은 쓰임 한 줄 설명이다. */
const ICON_ENTRIES: IconEntry[] = [
  { name: 'HomeIcon', Icon: HomeIcon, role: '투데이', section: '하단 탭바', lineOnly: false },
  { name: 'MedalIcon', Icon: MedalIcon, role: '배지', section: '하단 탭바', lineOnly: false },
  { name: 'CheckinIcon', Icon: CheckinIcon, role: '체크인', section: '하단 탭바', lineOnly: false },
  { name: 'TicketIcon', Icon: TicketIcon, role: '미션', section: '하단 탭바', lineOnly: false },
  { name: 'CrateIcon', Icon: CrateIcon, role: '인벤토리', section: '하단 탭바', lineOnly: false },
  { name: 'ArrowDownIcon', Icon: ArrowDownIcon, role: '아이템 드랍', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'ArrowUpIcon', Icon: ArrowUpIcon, role: '아이템 픽업', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'FlaskIcon', Icon: FlaskIcon, role: '믹스 레시피', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'NewspaperIcon', Icon: NewspaperIcon, role: '기사', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PodiumIcon', Icon: PodiumIcon, role: '랭킹', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'MagicBookIcon', Icon: MagicBookIcon, role: '컬렉션·아이템북', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'SparkleCircleIcon', Icon: SparkleCircleIcon, role: '진행 알림', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PinIcon', Icon: PinIcon, role: '지역·드랍 위치', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'InfoIcon', Icon: InfoIcon, role: '컨텐츠 소개', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'CoinIcon', Icon: CoinIcon, role: '포인트', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'MixingBowlIcon', Icon: MixingBowlIcon, role: '믹스하기', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'PuzzleIcon', Icon: PuzzleIcon, role: '마지막 파편', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'SyncCircleIcon', Icon: SyncCircleIcon, role: 'Strava 연동', section: '컨텐츠·자원 15종', lineOnly: false },
  { name: 'UserIcon', Icon: UserIcon, role: '아바타 자리', section: '사람·상태 10종', lineOnly: false },
  { name: 'UsersIcon', Icon: UsersIcon, role: '팔로워·팔로잉', section: '사람·상태 10종', lineOnly: false },
  { name: 'CheckBoldIcon', Icon: CheckBoldIcon, role: '미션 완료', section: '사람·상태 10종', lineOnly: false },
  { name: 'XBoldIcon', Icon: XBoldIcon, role: '미션 취소', section: '사람·상태 10종', lineOnly: false },
  { name: 'LockIcon', Icon: LockIcon, role: '잠김', section: '사람·상태 10종', lineOnly: false },
  { name: 'AlertTriangleIcon', Icon: AlertTriangleIcon, role: '경고', section: '사람·상태 10종', lineOnly: false },
  { name: 'InboxIcon', Icon: InboxIcon, role: '피드 빈 상태', section: '사람·상태 10종', lineOnly: false },
  { name: 'BellIcon', Icon: BellIcon, role: '알림함', section: '사람·상태 10종', lineOnly: false },
  { name: 'SearchIcon', Icon: SearchIcon, role: '검색', section: '사람·상태 10종', lineOnly: false },
  { name: 'PencilIcon', Icon: PencilIcon, role: '프로필 편집', section: '사람·상태 10종', lineOnly: false },
  { name: 'ChevronRightIcon', Icon: ChevronRightIcon, role: '이동', section: '동작 글리프 7종', lineOnly: true },
  { name: 'ChevronDownIcon', Icon: ChevronDownIcon, role: '펼침', section: '동작 글리프 7종', lineOnly: true },
  { name: 'PlusIcon', Icon: PlusIcon, role: '칸 추가', section: '동작 글리프 7종', lineOnly: true },
  { name: 'MinusIcon', Icon: MinusIcon, role: '칸 빼기', section: '동작 글리프 7종', lineOnly: true },
  { name: 'CloseIcon', Icon: CloseIcon, role: '닫기', section: '동작 글리프 7종', lineOnly: true },
  { name: 'CheckIcon', Icon: CheckIcon, role: '성공', section: '동작 글리프 7종', lineOnly: true },
  { name: 'SyncIcon', Icon: SyncIcon, role: '동기화', section: '동작 글리프 7종', lineOnly: true },
  { name: 'TreasureBoxIcon', Icon: TreasureBoxIcon, role: '지도 마커', section: '지도와 화면 전용', lineOnly: false },
  { name: 'LocateIcon', Icon: LocateIcon, role: '현재 위치 버튼', section: '지도와 화면 전용', lineOnly: false },
  { name: 'AlertCircleIcon', Icon: AlertCircleIcon, role: '오류 화면', section: '지도와 화면 전용', lineOnly: false },
  { name: 'BanIcon', Icon: BanIcon, role: '접근 불가 (어드민)', section: '지도와 화면 전용', lineOnly: false },
  { name: 'CopyIcon', Icon: CopyIcon, role: '복사하기', section: '공유 시트', lineOnly: false },
  { name: 'DownloadIcon', Icon: DownloadIcon, role: '저장하기', section: '공유 시트', lineOnly: false },
  { name: 'MoreIcon', Icon: MoreIcon, role: '더보기', section: '공유 시트', lineOnly: true },
];

const SECTION_ORDER = ['하단 탭바', '컨텐츠·자원 15종', '사람·상태 10종', '동작 글리프 7종', '지도와 화면 전용', '공유 시트'];

/**
 * IconCatalog — 전체 아이콘 격자. Storybook 카탈로그 전용 컴포넌트.
 * 섹션별 격자이고, 칸 하나는 이름(코드 폰트) · 라인과 채움 나란히 · 쓰임 한 줄이다.
 * 동작 글리프(lineOnly)는 채움 칸에도 라인을 그대로 두고 «라인 전용»을 붙인다.
 */
function IconCatalog({ className = '', style = {} }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={className} style={{ color: 'var(--foreground)', ...style }}>
      <h2
        style={{
          margin: '0 0 var(--spacing-16)',
          fontSize: 'var(--text-lg)',
          lineHeight: 'var(--text-lg--line-height)',
          fontWeight: 700,
          wordBreak: 'keep-all',
          overflowWrap: 'break-word',
          textWrap: 'balance',
        }}
      >
        아이콘 {ICON_ENTRIES.length}종 · 라인과 채움
      </h2>
      {SECTION_ORDER.map((section) => {
        const entries = ICON_ENTRIES.filter((e) => e.section === section);
        return (
          <section key={section} style={{ marginBottom: 'var(--spacing-24)' }}>
            <h3
              style={{
                margin: '0 0 var(--spacing-12)',
                fontSize: 'var(--text-sm)',
                lineHeight: 'var(--text-sm--line-height)',
                fontWeight: 600,
                color: 'var(--muted)',
                wordBreak: 'keep-all',
                overflowWrap: 'break-word',
              }}
            >
              {section}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
                gap: 'var(--spacing-12)',
              }}
            >
              {entries.map(({ name, Icon, role, lineOnly }) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 'var(--spacing-8)',
                    padding: 'var(--spacing-12)',
                    borderRadius: 'var(--radius-2xl)',
                    background: 'var(--background)',
                  }}
                >
                  <code style={{ fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)' }}>{name}</code>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-16)' }}>
                    <Icon width={32} height={32} variant="line" />
                    <Icon width={32} height={32} variant="fill" />
                    {lineOnly && (
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          lineHeight: 'var(--text-xs--line-height)',
                          color: 'var(--muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        라인 전용
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      lineHeight: 'var(--text-xs--line-height)',
                      color: 'var(--muted)',
                      wordBreak: 'keep-all',
                      overflowWrap: 'break-word',
                    }}
                  >
                    {role}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const meta: Meta<typeof IconCatalog> = {
  title: 'UI/Icons/IconCatalog',
  component: IconCatalog,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof IconCatalog>;

export const AllIcons: Story = {
  name: `전체 아이콘 (${ICON_ENTRIES.length}종, 라인·채움)`,
  render: () => <IconCatalog />,
};

export const SingleIcon: Story = {
  name: '단일 아이콘 예시',
  render: () => (
    <div style={{ display: 'flex', gap: 24, color: 'var(--foreground)' }}>
      <MedalIcon width={32} height={32} />
      <MedalIcon width={32} height={32} variant="fill" />
      <LockIcon width={32} height={32} />
      <LockIcon width={32} height={32} variant="fill" />
    </div>
  ),
};

export const ColorInheritance: Story = {
  name: '색상 상속 (currentColor)',
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <span style={{ color: 'var(--link)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--muted)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--rarity-epic)' }}><MedalIcon width={28} height={28} /></span>
    </div>
  ),
};

const BACKGROUNDS = [
  { label: '흰색', bg: '#FFFFFF', fg: '#171717' },
  { label: '#F3F3F3', bg: '#F3F3F3', fg: '#171717' },
  { label: '#171717', bg: '#171717', fg: '#FFFFFF' },
  { label: '반투명', bg: 'rgba(23, 23, 23, 0.4)', fg: '#FFFFFF' },
  { label: '초록', bg: '#0C8A4B', fg: '#FFFFFF' },
];

export const OnFiveBackgrounds: Story = {
  name: '다섯 배경 위 (비운 면·틈이 배경을 비춘다)',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {BACKGROUNDS.map(({ label, bg, fg }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 12,
            background: bg,
            color: fg,
          }}
        >
          <code style={{ width: 72, fontSize: 12 }}>{label}</code>
          {ICON_ENTRIES.map(({ name, Icon }) => (
            <Icon key={name + '-line'} width={24} height={24} variant="line" />
          ))}
          {ICON_ENTRIES.map(({ name, Icon }) => (
            <Icon key={name + '-fill'} width={24} height={24} variant="fill" />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const SmallSizes: Story = {
  name: '작은 크기 (16·20·24px) — 가는 선과 채움 틈 점검',
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--foreground)' }}>
      {[16, 20, 24].map((size) => (
        <span key={size} style={{ display: 'flex', gap: 8 }}>
          <CoinIcon width={size} height={size} />
          <InfoIcon width={size} height={size} />
          <InfoIcon width={size} height={size} variant="fill" />
        </span>
      ))}
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ListCard } from './ListCard';
import { ListRowChip } from './ListRow';
import { PointText } from './PointText';
import { RarityBadge } from '../cards/RarityBadge';
import { LockIcon } from '../icons/IconCatalog';

// 티켓 20261114_1543: 큰 이미지 위에 제목을 얹는 세로 목록 카드(미션 목록이 첫 사용처).
const meta: Meta<typeof ListCard> = {
  title: 'MODULAR/Patterns/ListCard',
  component: ListCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ListCard>;

const textBreak = { wordBreak: 'keep-all', overflowWrap: 'break-word' } as const;

/** 크림 바탕 위 세로 목록 틀. 폭은 width 100% + maxWidth라 375px 화면에서도 오른쪽이 잘리지 않는다. */
const Frame = ({ children, width = 360 }: { children: React.ReactNode; width?: number }) => (
  <div style={{ width: '100%', maxWidth: width, minWidth: `min(${width}px, 100vw - 2rem)`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--gap-card-detail)' }}>{children}</div>
);
const withStack = (Story: React.ComponentType) => (
  <Frame><Story /></Frame>
);

const Caption = ({ children }: { children: React.ReactNode }) => (
  <p style={{ ...textBreak, margin: 'var(--spacing-8) 0 0', fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', color: 'var(--muted)' }}>{children}</p>
);

/** 스토리용 이미지: 단색 면 SVG. 어두운 면과 밝은(파스텔) 면 두 가지. */
const svg = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${fill}"/></svg>`)}`;
const DARK = svg('#2a3a5c');
const PASTEL = svg('#f6e7c8');

const noop = () => {};
const Reward = () => <RarityBadge rarity="rare" size="row" />;

const footerLine = (
  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: 'var(--text-xs)', fontWeight: 700, lineHeight: 'var(--text-xs--line-height)' }}>
    <Reward />
    <span>&nbsp;주말 러너 배지</span>
  </span>
);

export const Default: Story = {
  name: '기본',
  decorators: [withStack],
  render: () => (
    <ListCard
      href="#"
      imageUrl={DARK}
      title="주말 러닝 챌린지"
      chips={<><ListRowChip tone="red">참가중</ListRowChip><ListRowChip>3일 4시간 남음</ListRowChip></>}
      value={<PointText value={20} />}
      description="이번 주말 10km를 달리고 포인트를 받아요"
    />
  ),
};

export const NoImage: Story = {
  name: '이미지 없음 — 자리표시 면 위 제목',
  decorators: [withStack],
  render: () => (
    <ListCard
      href="#"
      title="주말 러닝 챌린지"
      chips={<ListRowChip>상시</ListRowChip>}
      value={<PointText value={20} />}
      description="이미지가 없어도 제목이 읽혀요"
    />
  ),
};

export const ThreeChips: Story = {
  name: '칩 3개 — NEW + 상태 + 기간',
  decorators: [withStack],
  render: () => (
    <ListCard
      href="#"
      imageUrl={DARK}
      title="첫 5km 달성"
      chips={<><ListRowChip tone="done">NEW</ListRowChip><ListRowChip tone="red">참가중</ListRowChip><ListRowChip>12일 3시간 남음</ListRowChip></>}
      value={<PointText value={20} />}
      description="칩이 넘치면 아래 줄로 내려가요"
    />
  ),
};

export const NoValue: Story = {
  name: '값 없음',
  decorators: [withStack],
  render: () => (
    <ListCard href="#" imageUrl={DARK} title="값이 없는 카드" chips={<ListRowChip>상시</ListRowChip>} description="오른쪽 값 칸이 비어요" />
  ),
};

export const WithFooter: Story = {
  name: '푸터 있음 — 보상 줄',
  decorators: [withStack],
  render: () => (
    <ListCard
      href="#"
      imageUrl={DARK}
      title="한강 러너 되기"
      chips={<ListRowChip>상시</ListRowChip>}
      value={<PointText value={20} />}
      description="한강 둔치를 달려요"
      footer={footerLine}
    />
  ),
};

export const LongTitle: Story = {
  name: '긴 제목·설명 — 2줄 말줄임',
  decorators: [withStack],
  render: () => (
    <ListCard
      href="#"
      imageUrl={DARK}
      title="아주아주 긴 미션 이름이 두 줄을 넘어가면 말줄임으로 잘려요 끝없이 이어져요"
      chips={<ListRowChip>상시</ListRowChip>}
      value={<PointText value={1200} />}
      description="설명도 길면 두 줄까지만 보이고 나머지는 말줄임으로 잘려요. 이 문장은 일부러 길게 적었어요. 세 번째 줄은 보이지 않아요."
    />
  ),
};

export const AsLink: Story = {
  name: '링크(href)',
  decorators: [withStack],
  render: () => <ListCard href="#" imageUrl={DARK} title="링크 카드" chips={<ListRowChip>상시</ListRowChip>} />,
};

export const AsButtonAriaDisabled: Story = {
  name: '버튼(aria-disabled) — 눌러서 안내',
  decorators: [withStack],
  render: () => (
    <ListCard
      onClick={noop}
      aria-disabled="true"
      imageUrl={DARK}
      imageDim={0.4}
      grayscale
      imageOverlay={<LockIcon width={24} height={24} />}
      title="잠긴 미션"
      chips={<ListRowChip>잠김</ListRowChip>}
    />
  ),
};

export const DimAndGrayscale: Story = {
  name: '딤·그레이스케일 — 잠김 모사',
  decorators: [withStack],
  render: () => (
    <>
      <ListCard
        onClick={noop}
        aria-disabled="true"
        imageUrl={DARK}
        imageDim={0.4}
        grayscale
        imageOverlay={<LockIcon width={24} height={24} />}
        title="잠긴 미션"
        chips={<><ListRowChip>잠김</ListRowChip><ListRowChip>상시</ListRowChip></>}
        value={<PointText value={20} />}
        description="잠긴 카드는 이미지만 흐려져요"
        footer={<span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>조건 주말 러너 배지</span>}
      />
      <Caption>시작 전: 이미지에만 imageDim 0.6</Caption>
      <ListCard href="#" imageUrl={DARK} imageDim={0.6} title="시작 전 미션" chips={<ListRowChip>시작전</ListRowChip>} />
    </>
  ),
};

export const BrightImageTitleContrast: Story = {
  name: '밝은 이미지 위 제목 대비 확인',
  decorators: [withStack],
  render: () => (
    <>
      <ListCard href="#" imageUrl={PASTEL} title="밝은 이미지 위 제목" chips={<ListRowChip>상시</ListRowChip>} value={<PointText value={20} />} />
      <Caption>막을 쓰지 않아 파스텔 이미지 위 흰 제목은 대비가 약하다. 이미지를 고르는 쪽이 어두운 이미지를 쓴다.</Caption>
    </>
  ),
};

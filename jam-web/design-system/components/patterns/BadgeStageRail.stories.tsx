import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { BadgeStageRail } from './BadgeStageRail';

const meta: Meta<typeof BadgeStageRail> = {
  title: 'MODULAR/Patterns/BadgeStageRail',
  component: BadgeStageRail,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '계열(같은 이름, 등급별 눈금) 진행 레일. 눈금 상태는 1차 범위에서 earned/ready/locked/' +
          'not-reached 4종만 지원한다(20260903_2329). "다음 목표" 강조 링·잔여값은 진행 계산 모듈이 ' +
          '필요한 2차에서 붙는다. ready/locked를 가르는 조건 충족 여부는 호출부가 계산해 stops[].status로 넘긴다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeStageRail>;

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

export const GateAheadReady: Story = {
  name: '게이트 앞 — 조건 충족 (라임)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="동네 산책러"
        nextRarityLabel="Epic"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'ready', href: '/badges/2' },
          { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/3' },
          { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/4' },
        ]}
        onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
      />
    </Frame>
  ),
};

export const GateAheadLocked: Story = {
  name: '게이트 앞 — 조건 미충족 (잠김)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="산책의 명상가"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2' },
          { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
        ]}
        onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
      />
    </Frame>
  ),
};

export const AllEarned: Story = {
  name: '모두 획득',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="첫 발자국"
        nextRarityLabel={null}
        stops={[{ id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' }]}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const NotStarted: Story = {
  name: '아직 시작 전 (전부 미도달)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="이달의 산책왕"
        nextRarityLabel="Common"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2' },
          { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
          { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
        ]}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const Expandable: Story = {
  name: '인터랙티브 — 펼치기/접기',
  render: () => {
    const [expanded, setExpanded] = useState(false);
    return (
      <Frame>
        <BadgeStageRail
          familyName="밤의 보행자"
          nextRarityLabel="Rare"
          expanded={expanded}
          onToggleExpand={() => setExpanded((v) => !v)}
          stops={[
            {
              id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1',
              description: '밤 10시 이후, 20분 이상 걸으면 받는 배지예요.',
            },
            {
              id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2',
              description: '밤 10시 이후, 45분 이상 걸으면 받는 배지예요.',
            },
          ]}
          onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
        />
      </Frame>
    );
  },
};

export const NoImage: Story = {
  name: '이미지 없음 (플레이스홀더)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="새 계열"
        nextRarityLabel="Common"
        stops={[{ id: '1', rarity: 'common', imageUrl: null, status: 'not-reached', href: '/badges/1' }]}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const LongFamilyName: Story = {
  name: '긴 계열 이름 (truncate 없음)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="일요일 새벽의 수도승 그리고 불타는 금요일 밤 산책"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'ready', href: '/badges/2' },
        ]}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

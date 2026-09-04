import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { expect } from 'storybook/test';
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
          'not-reached 4종만 지원한다(20260903_2329). ready/locked를 가르는 조건 충족 여부는 호출부가 ' +
          '계산해 stops[].status로 넘긴다. 프런티어(다음 목표) 진행 캡션·연결선 비례 채움·기록형 ' +
          '아쉬움 줄은 2c(20260904_0921)에서 `frontierProgress`/`regretLine` prop으로 추가됐다 — ' +
          '누적/기록/주기 3종만 다룬다(2축형·다중카운터형 전용 게이지는 2d 몫). ' +
          '등급 라벨은 이 컴포넌트가 표를 들고 있지 않고 RarityBadge.jsx의 getRarityLabel()을 ' +
          '재사용한다(MODULAR 단일 소스, 20260905_0027). stops[].rarity가 비어 있으면 ' +
          '등급 라벨을 그리지 않는다 — 등급 없는 배지(무한레벨형)에 Common이 찍히지 않게 한 가드다.',
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
        frontierProgress={null}
        regretLine={null}
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
        frontierProgress={null}
        regretLine={null}
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
        frontierProgress={null}
        regretLine={null}
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
        frontierProgress={null}
        regretLine={null}
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
          frontierProgress={null}
          regretLine={null}
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
        frontierProgress={null}
        regretLine={null}
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
        frontierProgress={null}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

// ── 2c(20260904_0921) — 프런티어 진행 수치 표시 ──────────────────────────────

export const FrontierProgressCumulative: Story = {
  name: '프런티어 진행 — 누적형 (연결선 비례 채움)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="동네 산책러"
        nextRarityLabel="Epic"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
          { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
          { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
        ]}
        frontierProgress={{ text: '87.3/100km', fraction: 0.82 }}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const FrontierProgressRecord: Story = {
  name: '프런티어 진행 — 기록형 + 아쉬움 줄',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="밤의 보행자"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2' },
        ]}
        frontierProgress={{ text: '40/45분', fraction: 0.89 }}
        regretLine="지난 활동 기록은 40분. Rare까지 5분 모자랐어요."
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const FrontierProgressPeriodic: Story = {
  name: '프런티어 진행 — 주기형 (이번 주 · D일 남음)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="이달의 산책왕"
        nextRarityLabel="Common"
        stops={[{ id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/1' }]}
        frontierProgress={{ text: '이번 주 4/5회 · 3일 남음', fraction: 0.8 }}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const FrontierProgressUnsupported: Story = {
  name: '프런티어 진행 — 진행 미지원 고지 (§08 H)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="정체를 알 수 없는 계열"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2' },
        ]}
        frontierProgress={{ text: '진행 표시 준비 중', fraction: 0, muted: true }}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const FrontierProgressBehindGate: Story = {
  name: '프런티어 진행 — 게이트 잠김 + 조건 진행(게이트 연결선은 그대로 점선)',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="산책의 명상가"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2' },
        ]}
        frontierProgress={{ text: '18/20분', fraction: 0.9 }}
        regretLine={null}
        onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
      />
    </Frame>
  ),
};

export const FrontierProgressReadyComplete: Story = {
  name: '프런티어 진행 — 조건 완전 충족(fraction=1) + 게이트만 대기, 라임으로 표시',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="산책의 명상가"
        nextRarityLabel="Rare"
        stops={[
          { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
          { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'ready', href: '/badges/2' },
        ]}
        frontierProgress={{ text: '20/20분', fraction: 1 }}
        regretLine={null}
        onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
      />
    </Frame>
  ),
};

/**
 * 등급 없는 계열(무한레벨형, v5 — 티켓 20260905_0027).
 *
 * `stops[].rarity`가 비어 있으면 등급 라벨을 만들지 않는다. 예전에는 null 가드가 라벨
 * *생성*만 막고 문자열 *조립*은 막지 않아, aria-label과 img alt가
 * `"동네 산책러 null, 획득"`으로 나갔다 — 스크린리더가 "null"을 그대로 읽는다.
 * 조각을 `filter(Boolean)`으로 빼는 방식으로 접힌 레일·펼친 목록 양쪽을 고쳤고,
 * 여기서 회귀를 고정한다.
 */
export const NoRarityLeveled: Story = {
  name: '등급 없는 계열 — 라벨 조각을 빼고 조립한다',
  render: () => (
    <Frame>
      <BadgeStageRail
        familyName="동네 산책러"
        nextRarityLabel={null}
        expanded
        onToggleExpand={() => {}}
        stops={[
          {
            id: '1', rarity: null, imageUrl: WALK_ICON, status: 'earned', href: '/badges/1',
            description: '한 주(월~일)에 50km 이상 걸으면 받는 배지예요.',
          },
          {
            id: '2', rarity: null, imageUrl: WALK_ICON, status: 'ready', href: '/badges/2',
            description: '한 주(월~일)에 100km 이상 걸으면 받는 배지예요.',
          },
        ]}
        frontierProgress={{ text: '38/50km', fraction: 0.76 }}
        regretLine={null}
        onLockClick={(id: string) => alert(`잠금 해제 조건 시트: ${id}`)}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    // aria-label·alt 어디에도 "null"이 문자열로 새지 않는다.
    const labelled = canvasElement.querySelectorAll('[aria-label]');
    labelled.forEach((el) => expect(el.getAttribute('aria-label') ?? '').not.toContain('null'));
    canvasElement.querySelectorAll('img').forEach((img) => expect(img.getAttribute('alt') ?? '').not.toContain('null'));
    // 등급 칩도 그려지지 않는다.
    expect(canvasElement.textContent).not.toContain('COMMON');
  },
};

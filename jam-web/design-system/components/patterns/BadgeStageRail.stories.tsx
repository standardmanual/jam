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
          'not-reached 4종만 지원한다(20260903_2329). ready/locked를 가르는 조건 판정은 호출부가 ' +
          '계산해 stops[].status로 넘긴다. 프런티어(다음 목표) 진행 캡션·연결선 비례 채움·기록형 ' +
          '아쉬움 줄은 2c(20260904_0921)에서 `frontierProgress`/`regretLine` prop으로 추가됐다 — ' +
          '누적/기록/주기 3종만 다룬다(2축형·다중카운터형 전용 게이지는 2d 몫). ' +
          '등급 라벨은 이 컴포넌트가 표를 들고 있지 않고 RarityBadge.jsx의 getRarityLabel()을 ' +
          '재사용한다(MODULAR 단일 소스, 20260905_0027). stops[].rarity가 비어 있으면 ' +
          '등급 라벨을 그리지 않는다 — 등급 없는 배지(무한레벨형)에 Common이 찍히지 않게 한 가드다. ' +
          '20260906_1323: 헤더 우측 라벨이 상태값(「다음 Epic」)에서 **어포던스**(「자세히」)로 바뀌었고, ' +
          '아직 도달하지 않은 눈금의 캡션은 `stop.conditionText`(「4km」)를 그린다 — 없으면 기존 「—」. ' +
          '진행 캡션을 어느 눈금에 그릴지는 `progressStopId`가 정한다(호출부가 「첫 미충족」으로 계산). ' +
          '20260906_1436: 눈금 아래 3px 등급색 바를 걷어내고 접힌 레일은 `RarityBadge` 등급칩으로 ' +
          '바꿨다(펼친 목록은 이미 옆에 칩이 있어 그대로 없음). 펼친 목록의 not-reached 상태 줄도 ' +
          '조건값을 보여준다(접힌 레일과 동일 규칙). 게이트 자리 연결선도 다른 연결선과 같은 ' +
          'flex-grow를 갖도록 맞춰 레일 전체가 한쪽으로 쏠려 보이던 것을 고쳤다. 진행 중(조건 ' +
          '미충족)인 캡션 색은 옐로우(--status-short-solid)에서 화이트(--color-text)로 바뀌었다 — ' +
          '채움색(막대·연결선)은 그대로다. ' +
          '20260906_2140(v5): 헤더를 직접 그리지 않고 공유 부품 `BadgeFamilyCardHeader`를 쓴다 — ' +
          '계열명 시작 x가 패턴마다 32/88/16px로 갈라져 있었다. 눈금은 `repeat(n, 1fr)` **균등 ' +
          '그리드**이고 연결선은 그 위에 **절대 배치**된 별도 레이어라, 캡션 글자 수가 기하를 ' +
          '움직이지 못한다(예전에는 캡션 폭이 열 폭을 정해 한 화면에서 연결선이 37/25/21/14px로 ' +
          '벌어졌다). 캡션 자리는 2줄 높이를 상시 예약한다. 썸네일 44→52px, 연결선 6→8px, ' +
          '캡션 --text-micro→--text-caption(진행 앵커만 --text-small/700), 등급칩 size="md", ' +
          '배지 이미지는 여백 없이 프레임을 꽉 채운다(objectFit: cover). 캡션 색은 상태 램프 ' +
          '(idle / active / near / done)를 따른다.',
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
  name: '게이트 앞 — 조건을 다 채웠어요 (라임)',
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
        progressStopId={null}
        regretLine={null}
        onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
      />
    </Frame>
  ),
};

export const GateAheadLocked: Story = {
  name: '게이트 앞 — 아직 (잠김)',
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
        progressStopId={null}
        regretLine={null}
        onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
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
        progressStopId={null}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

export const NotStarted: Story = {
  name: '아직 시작 전 (전부 아직)',
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
        progressStopId={null}
        regretLine={null}
        onLockClick={() => {}}
      />
    </Frame>
  ),
};

/**
 * 20260906_1323 §7 — 아직 도달하지 않은 눈금의 캡션은 「—」가 아니라 **그 등급의 조건값**이다.
 * 4눈금 중 3개가 「—」면 「다음에 뭘 얼마나 해야 하나」가 화면에서 사라진다.
 * 조건 해석은 이 컴포넌트가 하지 않는다 — 완성 문자열(`conditionText`)만 받는다.
 */
export const NotReachedShowsCondition: Story = {
  name: '아직 도달 못한 눈금 — 「—」 대신 조건값',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="계절의 트레일러"
          nextRarityLabel="Common"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/1', conditionText: '4km' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2', conditionText: '10km' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3', conditionText: '100일 · 10회' },
            // 조건값이 없는 눈금(미션 보상·수동 발급)은 기존 「—」로 남는다 — 폴백을 지우지 않는다.
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    expect(rail.textContent).toContain('4km');
    expect(rail.textContent).toContain('100일 · 10회');
    // 조건값이 없는 눈금은 그대로 「—」
    expect(rail.textContent).toContain('—');
    // aria는 상태를 말로 남기고 조건값을 덧붙인다 — 「—」를 읽지 않는다.
    const first = rail.querySelectorAll('a')[0];
    expect(first.getAttribute('aria-label')).toBe('계절의 트레일러 Common, 아직. 조건 4km');
    // 티켓 20260906_1424 ② — 조건값 캡션은 opacity 0.7 감쇠를 걸지 않는다(대비 확보,
    // 실측값은 완료 기록 참고). 정보가 없는 「—」 폴백만 계속 0.7로 감쇠한다.
    const captionSpans = Array.from(rail.querySelectorAll('span')).filter(
      (el) => el.children.length === 0
    );
    const conditionCaption = captionSpans.find((el) => el.textContent === '4km') as HTMLElement;
    const fallbackCaption = captionSpans.find((el) => el.textContent === '—') as HTMLElement;
    expect(getComputedStyle(conditionCaption).opacity).toBe('1');
    expect(getComputedStyle(fallbackCaption).opacity).toBe('0.7');
  },
};

/**
 * 20260906_1323 §8 — 진행 캡션이 붙는 자리는 호출부가 정한다(`progressStopId`).
 * 예전에는 이 컴포넌트가 «첫 미획득 눈금»을 스스로 골라서, 조건은 이미 채웠지만 아직 발급되지
 * 않은 눈금에 「22/1일」처럼 이미 넘긴 조건의 카운트가 떴다.
 */
export const ProgressAnchorSkipsFulfilledStop: Story = {
  name: '진행 앵커 — 이미 채운 눈금을 건너뛴다',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="오늘의 한 발"
          nextRarityLabel="Common"
          stops={[
            // Common(1일)은 조건을 이미 넘겼지만 아직 발급 전이라 not-reached로 남아 있다.
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/1', conditionText: '누적 1일' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2', conditionText: '누적 30일' },
          ]}
          frontierProgress={{ text: '22/30일', fraction: 22 / 30 }}
          progressStopId="2"
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    const stops = Array.from(rail.querySelectorAll('a'));
    // 진행 수치는 Rare 눈금에 붙고, Common 눈금은 조건값만 말한다.
    expect(stops[0].textContent).toContain('누적 1일');
    expect(stops[0].textContent).not.toContain('22');
    expect(stops[1].textContent).toContain('22/30일');
  },
};

/**
 * 20260906_1436 §2-1 — **펼친 목록**의 not-reached 상태 줄도 「—」 대신 조건값을 보여준다.
 * `NotReachedShowsCondition`(접힌 레일)이 이미 고정한 규칙을 펼친 목록에도 그대로 적용한
 * 회귀 테스트다 — 예전엔 펼친 목록만 `STATUS_LABEL`을 그대로 써서 조건값이 없었다.
 */
export const ExpandedNotReachedShowsCondition: Story = {
  name: '펼친 목록 — 아직인 줄도 「—」 대신 조건값',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="계절의 트레일러"
          nextRarityLabel="Rare"
          expanded
          onToggleExpand={() => {}}
          stops={[
            {
              id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1',
              description: '4km 걸으면 받는 배지예요.',
            },
            {
              id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2',
              conditionText: '10km', description: '10km 걸으면 받는 배지예요.',
            },
            // 조건값이 없는 눈금은 펼친 목록에서도 기존 「—」로 남는다.
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3', description: '조건 미정' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    expect(rail.textContent).toContain('10km');
    expect(rail.textContent).toContain('—');
    // 등급칩도 함께 보인다(RARE) — 바를 없앤 자리를 대체하지 않고 그대로 유지.
    expect(rail.textContent).toContain('RARE');
  },
};

/**
 * 20260906_2140 A — 진행 캡션 색은 **상태 램프**를 따른다.
 * `0 < f < 0.8`이면 화이트(`--status-progress-active`, 「지금 내 차례」), `0.8 <= f < 1`이면
 * 앰버(`--status-progress-near`, 「거의 다」), `f >= 1`이면 라임(`--status-progress-done`)이다.
 *
 * 20260906_1436 §3의 「진행 중 캡션은 화이트」는 **유지된다** — 그 티켓이 문제 삼은 구간
 * (조건을 한참 못 채운 상태)이 곧 `active`이기 때문이다. 앰버는 80%를 넘긴 뒤에만 나온다.
 */
export const FrontierProgressCaptionRamp: Story = {
  name: '20260906_2140 — 진행 캡션 상태 램프(진행 중 화이트 / 거의 다 앰버)',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="동네 산책러"
          nextRarityLabel="Epic"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={{ text: '42.0/100km', fraction: 0.42 }}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
      <div data-testid="rail-near" style={{ marginTop: 12 }}>
        <BadgeStageRail
          familyName="거의 다 온 산책러"
          nextRarityLabel="Epic"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={{ text: '87.3/100km', fraction: 0.873 }}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    const active = Array.from(rail.querySelectorAll('span')).find((el) => el.textContent === '42.0/100km') as HTMLElement;
    expect(active).toBeTruthy();
    // 진행 중(<80%)은 화이트 — 20260906_1436 §3의 결정이 이 구간에서 그대로 유지된다.
    expect(getComputedStyle(active).color).toBe('rgb(255, 255, 255)');

    const nearRail = canvasElement.querySelector('[data-testid="rail-near"]')!;
    const near = Array.from(nearRail.querySelectorAll('span')).find((el) => el.textContent === '87.3/100km') as HTMLElement;
    expect(near).toBeTruthy();
    // 거의 다(>=80%)는 앰버(#f2cb00) — 화이트와 갈라야 「한 발 남았다」가 읽힌다.
    expect(getComputedStyle(near).color).toBe('rgb(242, 203, 0)');
  },
};

/**
 * 20260906_2140 §C — **연결선 폭이 캡션 글자 수와 무관하게 고정**이다.
 *
 * 예전에는 눈금 열이 `flex:none; minWidth:48`인데 캡션이 `maxWidth:92`까지 번져 **열 폭을
 * 캡션 글자 수가 정했다** — staging 실측에서 한 화면 네 카드의 연결선이 37/25/21/14px로
 * 벌어졌다. 이제 눈금은 `repeat(n, 1fr)` 균등 그리드이고 연결선은 그 위에 절대 배치된
 * 별도 레이어라, 캡션이 한 글자든 두 줄이든 모든 연결선 폭이 같다.
 */
export const ConnectorGeometryIsFixed: Story = {
  name: '20260906_2140 — 연결선 폭은 캡션 길이와 무관하게 같다',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="산책의 명상가"
          nextRarityLabel="Rare"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3', conditionText: '10km' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    // 연결선 레이어 — 절대 배치된 span들. 게이트 자리도 같은 레이어에 있다.
    const connectors = Array.from(rail.querySelectorAll('span')).filter(
      (el) => getComputedStyle(el as HTMLElement).position === 'absolute' && (el as HTMLElement).offsetHeight === 8
    ) as HTMLElement[];
    expect(connectors.length).toBe(2);
    const widths = connectors.map((el) => Math.round(el.getBoundingClientRect().width));
    // 캡션이 「10km」(짧음)과 「—」(더 짧음)로 서로 다른데도 연결선 폭은 하나다.
    expect(new Set(widths).size).toBe(1);
    // 게이트 자리도 같은 폭 — 예전엔 여기만 고정 44px이라 레일이 한쪽으로 쏠려 보였다.
    const gate = rail.querySelector('.ds-rail-gate-link') as HTMLElement;
    expect(gate).toBeTruthy();
    expect(Math.round(gate.getBoundingClientRect().width)).toBe(widths[0]);
  },
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
          progressStopId={null}
          regretLine={null}
          onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
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
        progressStopId={null}
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
        progressStopId={null}
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
        progressStopId={null}
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
        progressStopId={null}
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
        progressStopId={null}
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
        frontierProgress={{ text: '진행 표시 준비 중', fraction: 0, muted: true, pending: true }}
        progressStopId={null}
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
        progressStopId={null}
        regretLine={null}
        onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
      />
    </Frame>
  ),
};

export const FrontierProgressReadyComplete: Story = {
  name: '프런티어 진행 — 조건을 다 채움(fraction=1) + 게이트만 대기, 라임으로 표시',
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
        progressStopId={null}
        regretLine={null}
        onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
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
        progressStopId={null}
        regretLine={null}
        onLockClick={(id: string) => alert(`받는 방법 시트: ${id}`)}
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

// ────────────────────────────────────────────────────────────────────────────
// v2 (티켓 20260905_0036)
// ────────────────────────────────────────────────────────────────────────────

/**
 * v2 — 미획득 눈금은 **원본 이미지를 로드하지 않는다.**
 *
 * 회귀 고정 — **미획득 눈금도 원본 이미지를 `grayscale(1)`로 그린다**(2026-09-06 확정).
 * 20260905_0036이 한때 실루엣(공통 SVG)으로 바꿨다가 되돌렸다: 원본 URL이 네트워크에
 * 나가 「외형 비공개」가 성립하지 않는다는 이유였는데, **외형을 감추는 것보다 어떤 배지인지
 * 알아볼 수 있는 쪽**을 택했다. 아래 play가 "눈금 4개 = `<img>` 4개, 미획득 3개는
 * grayscale"을 실측한다.
 */
export const GrayscaleForUnearned: Story = {
  name: 'v2 — 미획득은 원본 이미지를 그레이로',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="동네 산책러"
          nextRarityLabel="Rare"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    // 눈금 4개 전부 원본 이미지를 쓴다 — 미획득도 감추지 않는다.
    const imgs = Array.from(rail.querySelectorAll('img'));
    expect(imgs.length).toBe(4);
    // 획득 1개는 필터 없음, 미획득 3개는 grayscale.
    const gray = imgs.filter((i) => getComputedStyle(i).filter.includes('grayscale'));
    expect(gray.length).toBe(3);
  },
};

/**
 * v4(티켓 20260906_1436) — 눈금 아래 **등급칩**. 예전엔 3px 등급색 바 하나로만 등급을
 * 표시해 등급명이 `aria-label`에만 있고 화면에는 안 보였다 — 압축된 `RarityBadge` 칩으로
 * 바꿔 시각적으로도 바로 읽히게 했다. `common`은 기존 관례대로 칩을 그리지 않는다
 * (노이즈 축소, 20260827_024) — 등급명은 여전히 `aria-label`이 함께 전달한다.
 */
export const RarityChips: Story = {
  name: 'v4 — 눈금 아래 등급칩',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="계절의 보행자"
          nextRarityLabel="Epic"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    // 등급칩이 화면 텍스트로도 보인다(색에만 기대지 않는다).
    expect(rail.textContent).toContain('RARE');
    expect(rail.textContent).toContain('EPIC');
    expect(rail.textContent).toContain('MYSTIC');
    // common은 칩을 그리지 않는다(기존 관례).
    expect(rail.textContent).not.toContain('COMMON');
    const labels = Array.from(canvasElement.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => l.includes('Mystic'))).toBe(true);
    expect(labels.some((l) => l.includes('Epic'))).toBe(true);
  },
};

/**
 * 인터랙션 리뷰(티켓 20260906_1436) — common 눈금은 `RarityBadge`가 칩을 그리지 않는데,
 * 예전엔 그 자리 자체를 안 만들어 Common 눈금만 44px, 나머지는 칩만큼(+16px) 더 커져
 * 같은 레일 안에서 캡션 시작 위치가 어긋났다. 등급칩 자리를 항상 예약해 모든 눈금의
 * 썸네일 블록 높이가 같아졌는지(=탭 타깃·캡션 정렬이 어긋나지 않는지) 확인한다.
 */
export const RarityChipSlotAligned: Story = {
  name: '20260906_1436 — Common 눈금도 칩 자리 예약(탭 타깃 정렬)',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="계절의 보행자"
          nextRarityLabel="Epic"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    const stops = Array.from(rail.querySelectorAll('.ds-rail-stop')) as HTMLElement[];
    expect(stops.length).toBe(4);
    const thumbnailHeights = stops.map((stop) => (stop.firstElementChild as HTMLElement).offsetHeight);
    // common(칩 없음)과 rare/epic/mystic(칩 있음) 모두 같은 높이여야 정렬이 맞는다.
    expect(new Set(thumbnailHeights).size).toBe(1);
  },
};

/**
 * v2 — `earnCount`: 반복형 계열의 누적 횟수를 **`×N` 칩 하나로만** 헤더 행 오른쪽 끝에 붙인다.
 * 점 그리드를 쓰지 않는 이유는 `BadgeStampRow` 문서 참고.
 */
export const EarnCountChip: Story = {
  name: 'v2 — earnCount (×N 칩)',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="이번 주의 약속"
          nextRarityLabel="Epic"
          earnCount={12}
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]');
    expect(rail?.textContent).toContain('×12');
    // 20260906_2140 — 헤더가 `BadgeFamilyCardHeader`로 바뀌면서 `×N` 칩은 헤더 2행(메타 줄)
    // 앞으로 옮겼다. 칩 자체의 aria-label("누적 12회")은 그대로 남아야 스크린리더가 숫자를
    // 「곱하기 12」가 아니라 「누적 12회」로 읽는다.
    const countChip = rail?.querySelector('[aria-label^="누적"]');
    expect(countChip).toBeTruthy();
    expect(countChip?.getAttribute('aria-label')).toBe('누적 12회');
  },
};

/**
 * v2 — `stop.gates`: 게이트 종류를 배열로 받아 **한 자리에 최대 2개**(자물쇠+별) 그린다.
 * 그래서 게이트 자리 폭이 36px → **44px**이다.
 * 미션 게이트만 `--color-primary`(4.18:1 — 텍스트 기준엔 못 미치나 아이콘이라 비텍스트
 * 기준 3:1은 통과)이고, 교차(선행 배지) 게이트와는 **형태로도** 갈라 둔다(자물쇠 vs 별).
 * `gates`를 넘기지 않으면 v1과 동일하게 종류 없는 자물쇠 하나만 그린다.
 */
export const GateKinds: Story = {
  name: 'v2 — 게이트 종류 (미션 자물쇠 + 교차 별)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div data-testid="rail-two">
          <BadgeStageRail
            familyName="누적의 증명"
            nextRarityLabel="Epic"
            stops={[
              { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
              { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
              {
                id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/3',
                gates: [{ kind: 'mission' as const }, { kind: 'cross' as const }],
              },
              { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/4' },
            ]}
            frontierProgress={null}
            progressStopId={null}
            regretLine={null}
            onLockClick={() => {}}
          />
        </div>
        {/* gates 미지정 — v1과 동일 */}
        <BadgeStageRail
          familyName="동네 산책러"
          nextRarityLabel="Rare"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'locked', href: '/badges/2' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const labels = Array.from(canvasElement.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') ?? '');
    // 게이트 종류는 색·형태뿐 아니라 aria-label로도 읽힌다.
    expect(labels.some((l) => l.includes('미션') && l.includes('선행 배지'))).toBe(true);
  },
};

/**
 * v2 — **4눈금 상한을 코드로 강제한다.**
 *
 * 레일은 등급 4단계 전용 구조다(컨테이너에 `overflow`도 `flexWrap`도 없다). v5 무한레벨형은
 * 지금 Lv.1~8까지 시딩돼 있고 상한이 없어서, 실수로 이 레일에 밀어 넣으면 눈금이 가로로
 * 밀려나 화면이 **조용히** 망가진다. 그래서 개발 빌드에서는 즉시 던진다 — 레벨형은
 * `BadgeLevelGauge`를 쓴다.
 */
export const MaxFourStopsEnforced: Story = {
  name: 'v2 — 눈금 5개면 개발 빌드에서 에러',
  render: function MaxStops() {
    // 상한 검사는 «개발 빌드 전용»이다. 번들러가 정적 치환하는 `process.env.NODE_ENV`를
    // 여기서 한 번만 읽어 data 속성으로 넘긴다 — play 함수 안에서 `typeof process`로
    // 다시 판별하려 하면 브라우저 번들에서 process 식별자 자체가 없어 항상 실패한다.
    const devBuild = process.env.NODE_ENV !== 'production';
    // 컴포넌트를 함수로 직접 호출해 던지는 것을 잡는다(BadgeStageRail은 훅을 쓰지 않는다).
    let message = '(개발 빌드가 아니라 검사를 건너뛰었거나, 상한 검사가 사라졌다)';
    try {
      BadgeStageRail({
        familyName: '걸어온 거리',
        nextRarityLabel: null,
        stops: [1, 2, 3, 4, 5].map((n) => ({
          id: String(n), rarity: null, imageUrl: WALK_ICON, status: 'locked' as const, href: `/badges/${n}`,
        })),
        frontierProgress: null,
        progressStopId: null,
        regretLine: null,
        onLockClick: () => {},
      });
    } catch (e) {
      message = (e as Error).message;
    }
    return (
      <Frame>
        <p data-testid="thrown" data-dev-build={String(devBuild)} style={{ margin: 0, color: 'var(--color-text)', fontSize: 12, lineHeight: 1.5 }}>
          {message}
        </p>
      </Frame>
    );
  },
  play: async ({ canvasElement }) => {
    const node = canvasElement.querySelector('[data-testid="thrown"]');
    // 프로덕션 번들로 구운 Storybook에서는 던지지 않는 것이 «정상»이다 — 검사하지 않는다.
    if (node?.getAttribute('data-dev-build') !== 'true') return;
    const text = node.textContent ?? '';
    expect(text).toContain('눈금은 최대 4개');
    expect(text).toContain('BadgeLevelGauge');
  },
};

/**
 * v3 — 게이트가 둘인데 **하나는 이미 통과**했다 (티켓 20260905_0037).
 *
 * `stop.gates`에 충족 여부가 없던 동안에는 미션을 이미 깬 상태에서도 자물쇠 2개가 똑같이
 * 그려져 「무엇이 남았나」가 안 읽혔다. 통과한 문은 체크+라임으로 그려 색만이 아니라
 * **형태로도** 가른다.
 */
export const GatePartiallyMet: Story = {
  name: 'v3 — 게이트 2개 중 1개 통과',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="한파의 순례자"
          nextRarityLabel="Mystic"
          stops={[
            { id: 'c', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/c' },
            { id: 'r', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/r' },
            { id: 'e', rarity: 'epic', imageUrl: WALK_ICON, status: 'earned', href: '/badges/e' },
            {
              id: 'm', rarity: 'mystic', imageUrl: WALK_ICON, status: 'locked', href: '/badges/m',
              gates: [{ kind: 'mission', met: true }, { kind: 'cross', met: false }],
            },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const labels = Array.from(canvasElement.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') ?? '');
    // 통과/대기가 aria-label로도 갈린다 — 색·형태에만 기대지 않는다.
    expect(labels.some((l) => l.includes('미션 통과') && l.includes('선행 배지 대기'))).toBe(true);
  },
};

/**
 * 20260906_2140 §B·F-4 — **헤더는 공유 부품(`BadgeFamilyCardHeader`)이 그린다.**
 *
 * `87%`와 등급 라벨(`EPIC`)이 **한 줄에 나란히** 있고 카드 우측 패딩 엣지에 붙는다.
 * 「자세히 ⌄」는 그 오른쪽이 아니라 **2행(메타 줄) 오른쪽 끝**으로 내려가, 1행 진행률과
 * 2행 자세히가 같은 우측 엣지를 쓴다 — 그래야 카드를 세로로 훑는 스캔 컬럼이 성립한다.
 */
export const HeaderInlinePercentAndRarity: Story = {
  name: '20260906_2140 — 87% EPIC 한 줄 · 우측 엣지 공유',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="자정의 정복자"
          nextRarityLabel="Epic"
          headerFraction={0.87}
          headerLabel="Epic"
          headerMeta="다음 Epic · 두 조건을 한 번의 활동에서"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'earned', href: '/badges/1' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'earned', href: '/badges/2' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3', conditionText: '30km' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4', conditionText: '100km' },
          ]}
          frontierProgress={{ text: '26.1/30km', fraction: 0.87 }}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]') as HTMLElement;
    expect(rail.textContent).toContain('87%');
    expect(rail.textContent).toContain('Epic');

    const spans = Array.from(rail.querySelectorAll('span')) as HTMLElement[];
    const pct = spans.find((el) => el.textContent === '87%')!;
    const label = spans.find((el) => el.textContent === 'Epic')!;
    // 한 줄인지 — 세로로 쌓였다면 bottom이 한 줄 높이만큼 벌어진다.
    expect(Math.abs(pct.getBoundingClientRect().bottom - label.getBoundingClientRect().bottom)).toBeLessThan(4);
    expect(label.getBoundingClientRect().left).toBeGreaterThan(pct.getBoundingClientRect().right - 1);

    // 진행률 블록과 「자세히」가 같은 우측 엣지를 쓴다.
    const toggle = rail.querySelector('.ds-family-header-toggle') as HTMLElement;
    expect(toggle).toBeTruthy();
    const railRect = rail.getBoundingClientRect();
    const pctBlock = label.parentElement as HTMLElement;
    expect(Math.round(railRect.right - pctBlock.getBoundingClientRect().right)).toBe(
      Math.round(railRect.right - toggle.getBoundingClientRect().right)
    );
  },
};

/**
 * 20260906_2140 §C — 캡션 자리는 **2줄 높이를 상시 예약**한다.
 * 예전에는 한 레일 안에서도 캡션 높이가 14/29/43px로 갈려 눈금 열 높이가 86/101/115px로
 * 어긋났다(staging 실측). 이제 캡션이 한 줄이든 두 줄이든 열 높이가 같다.
 */
export const CaptionSlotReserved: Story = {
  name: '20260906_2140 — 캡션 2줄 높이 상시 예약',
  render: () => (
    <Frame>
      <div data-testid="rail">
        <BadgeStageRail
          familyName="계절의 트레일러"
          nextRarityLabel="Rare"
          headerFraction={0.2}
          headerLabel="Rare"
          headerMeta="다음 Rare · 6일 연속 · 5회"
          stops={[
            { id: '1', rarity: 'common', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/1', conditionText: '4km' },
            { id: '2', rarity: 'rare', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/2', conditionText: '6일 연속 · 5회' },
            { id: '3', rarity: 'epic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/3' },
            { id: '4', rarity: 'mystic', imageUrl: WALK_ICON, status: 'not-reached', href: '/badges/4', conditionText: '100일 · 10회' },
          ]}
          frontierProgress={null}
          progressStopId={null}
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rail = canvasElement.querySelector('[data-testid="rail"]')!;
    const stops = Array.from(rail.querySelectorAll('.ds-rail-stop')) as HTMLElement[];
    expect(stops.length).toBe(4);
    // 캡션 글자 수가 「4km」~「6일 연속 · 5회」로 크게 다른데도 눈금 열 높이가 하나다.
    expect(new Set(stops.map((el) => el.offsetHeight)).size).toBe(1);
  },
};

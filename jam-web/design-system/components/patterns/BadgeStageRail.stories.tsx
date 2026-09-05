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
 * v2 — 눈금 아래 **3px 등급색 바**. 44px 폭에 "Mystic" 칩은 들어가지 않아서 등급을 색으로만
 * 표시하고, 등급명은 눈금의 `aria-label`이 읽는다(시각·비시각 어느 쪽도 정보를 잃지 않는다).
 * 등급 색 `--color-rarity-*`는 **값을 바꾸지 않고 그대로 참조**한다 — 이 토큰들은
 * `--color-tag-3/4/5`와 폼 입력 에러 색이 함께 물고 있다.
 */
export const RarityBars: Story = {
  name: 'v2 — 눈금 아래 3px 등급색 바',
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
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const labels = Array.from(canvasElement.querySelectorAll('[aria-label]')).map((el) => el.getAttribute('aria-label') ?? '');
    // 등급명은 색이 아니라 aria-label이 전달한다.
    expect(labels.some((l) => l.includes('Mystic'))).toBe(true);
    expect(labels.some((l) => l.includes('Epic'))).toBe(true);
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
          regretLine={null}
          onLockClick={() => {}}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('[data-testid="rail"]')?.textContent).toContain('×12');
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

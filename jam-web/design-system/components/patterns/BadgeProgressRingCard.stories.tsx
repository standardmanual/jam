import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeProgressRingCard } from './BadgeProgressRingCard';

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

const meta: Meta<typeof BadgeProgressRingCard> = {
  title: 'MODULAR/Patterns/BadgeProgressRingCard',
  component: BadgeProgressRingCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '눈금 1개 계열 전용 그리드 셀 — 티켓 20260906_1425. v5 활동 배지 194계열 중 63계열이 ' +
          '눈금 1개인데, 연결선을 그리는 `BadgeStageRail`을 쓰면 연결선 없이 카드 한 장을 통째로 ' +
          '쓰는 낭비가 생긴다. 이 카드는 63계열을 그리드로 촘촘히 묶기 위한 압축 셀이고, 진행은 ' +
          '선형 막대 대신 **배지 이미지 보더를 따라 도는 링**으로 보여준다. **링은 상태색 ' +
          '하나로만 채운다**(앰버=채우는 중 / 라임=다 채움) — 등급색은 절대 링에 올리지 않고 ' +
          '이름 아래 `RarityBadge` 칩에 남긴다. 원형 진행은 작은 값과 0%가 구분되지 않아 ' +
          '**수치 캡션을 항상 함께 그린다.**',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeProgressRingCard>;

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 343, background: '#1a1a1a', padding: 16, borderRadius: 16,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export const Progress0Percent: Story = {
  name: '진행 0%',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="100km 클럽"
        imageUrl={WALK_ICON}
        rarity="rare"
        status="not-reached"
        fraction={0}
        captionText="0.0/100.0km"
        ariaLabel="100km 클럽 Rare, 미도달. 0.0/100.0km"
        href="/badges/b1"
      />
    </Grid>
  ),
};

export const ProgressMid: Story = {
  name: '진행 중간 (42%)',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="100km 클럽"
        imageUrl={WALK_ICON}
        rarity="rare"
        status="not-reached"
        fraction={0.42}
        captionText="42.0/100.0km"
        ariaLabel="100km 클럽 Rare, 미도달. 42.0/100.0km"
        href="/badges/b1"
      />
    </Grid>
  ),
};

/** 조건은 이미 채웠지만(fraction>=1) 아직 획득 전 — 링이 라임으로 다 채워진다(§08 progressComplete와 같은 기준). */
export const Progress100Percent: Story = {
  name: '진행 100% (조건 충족, 획득 전)',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="500km 클럽"
        imageUrl={WALK_ICON}
        rarity="epic"
        status="ready"
        fraction={1}
        captionText="500.0/500.0km"
        ariaLabel="500km 클럽 Epic, 조건 충족. 500.0/500.0km"
        onClick={() => {}}
      />
    </Grid>
  ),
  play: async ({ canvasElement }) => {
    // 링 그라데이션 레이어(aria-hidden)가 마커(역시 aria-hidden)보다 먼저 그려진다(DOM 순서).
    const ring = canvasElement.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(ring).toBeTruthy();
    expect(getComputedStyle(ring).backgroundImage).toContain('conic-gradient');
    // 다 채운 링은 앰버 트랙 구간 없이 전체가 라임(--status-done-solid) 하나여야 한다.
    expect(getComputedStyle(ring).backgroundImage).not.toContain('242, 203, 0');
  },
};

export const Earned: Story = {
  name: '획득 완료 — 체크 마커, 링 바깥',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="1000km 클럽"
        imageUrl={WALK_ICON}
        rarity="mystic"
        status="earned"
        fraction={1}
        captionText="1000.0/1000.0km"
        ariaLabel="1000km 클럽 Mystic, 획득. 1000.0/1000.0km"
        href="/badges/b3"
      />
    </Grid>
  ),
};

export const GateLocked: Story = {
  name: '게이트 잠김 — 자물쇠 마커, 링 바깥',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="100km 클럽"
        imageUrl={WALK_ICON}
        rarity="rare"
        status="locked"
        fraction={0.1}
        captionText="10.0/100.0km"
        ariaLabel="100km 클럽 Rare, 잠김. 10.0/100.0km"
        onClick={() => {}}
      />
    </Grid>
  ),
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-label')).toContain('10.0/100.0km');
  },
};

/**
 * 진행을 계산할 수 없는 경우(§08 H) — 링은 중립색(회색)으로만 그리고, 캡션 자리에는
 * "값 없음"이 아니라 **획득 조건**(「100km」)을 사실 표기(기울이지 않음)로 보여준다.
 */
export const UnsupportedShowsCondition: Story = {
  name: '진행 계산 불가 — 조건값 표시, 링은 중립색',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="100km 클럽"
        imageUrl={WALK_ICON}
        rarity="rare"
        status="not-reached"
        fraction={0}
        muted
        captionText="100km"
        pending={false}
        ariaLabel="100km 클럽 Rare, 미도달. 조건 100km"
        href="/badges/b1"
      />
    </Grid>
  ),
  play: async ({ canvasElement }) => {
    const caption = Array.from(canvasElement.querySelectorAll('span')).find((el) => el.textContent === '100km') as HTMLElement;
    expect(caption).toBeTruthy();
    // 조건값은 사실 표기라 기울이지 않는다.
    expect(getComputedStyle(caption).fontStyle).toBe('normal');
  },
};

export const LongName: Story = {
  name: '긴 이름 — 말줄임 없이 줄바꿈',
  render: () => (
    <Grid>
      <BadgeProgressRingCard
        name="아주 길고 긴 클럽 이름도 끝까지 보여준다"
        imageUrl={WALK_ICON}
        rarity="common"
        status="not-reached"
        fraction={0.2}
        captionText="20.0/100.0km"
        ariaLabel="아주 길고 긴 클럽 이름도 끝까지 보여준다, 미도달. 20.0/100.0km"
        href="/badges/b1"
      />
    </Grid>
  ),
  play: async ({ canvasElement }) => {
    const name = Array.from(canvasElement.querySelectorAll('span')).find(
      (el) => el.textContent === '아주 길고 긴 클럽 이름도 끝까지 보여준다'
    ) as HTMLElement;
    expect(name).toBeTruthy();
    // 말줄임이면 scrollWidth가 clientWidth를 넘는다 — 줄바꿈이면 넘지 않는다.
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
  },
};

/** 63계열이 그리드로 묶이면 어떻게 보이는지 — 3열, 375px 기준. */
export const GridOf3Columns: Story = {
  name: '그리드 3열 (375px 기준) — 63계열이 묶이는 실제 형태',
  render: () => (
    <Grid>
      <BadgeProgressRingCard name="100km 클럽" imageUrl={WALK_ICON} rarity="rare" status="not-reached" fraction={0.42} captionText="42.0/100.0km" ariaLabel="100km 클럽 Rare, 미도달. 42.0/100.0km" href="/badges/b1" />
      <BadgeProgressRingCard name="500km 클럽" imageUrl={WALK_ICON} rarity="epic" status="not-reached" fraction={0.1} captionText="50.0/500.0km" ariaLabel="500km 클럽 Epic, 미도달. 50.0/500.0km" href="/badges/b2" />
      <BadgeProgressRingCard name="1000km 클럽" imageUrl={WALK_ICON} rarity="mystic" status="locked" fraction={0.02} captionText="20.0/1000.0km" ariaLabel="1000km 클럽 Mystic, 잠김. 20.0/1000.0km" onClick={() => {}} />
      <BadgeProgressRingCard name="동네 한 바퀴" imageUrl={WALK_ICON} rarity="common" status="earned" fraction={1} captionText="5.0/5.0km" ariaLabel="동네 한 바퀴 Common, 획득. 5.0/5.0km" href="/badges/b4" />
      <BadgeProgressRingCard name="새벽의 발걸음" imageUrl={WALK_ICON} rarity="rare" status="ready" fraction={1} captionText="30.0/30.0km" ariaLabel="새벽의 발걸음 Rare, 조건 충족. 30.0/30.0km" onClick={() => {}} />
      <BadgeProgressRingCard name="마라톤 완주자" imageUrl={WALK_ICON} rarity="epic" status="not-reached" fraction={0} captionText="0.0/42.2km" ariaLabel="마라톤 완주자 Epic, 미도달. 0.0/42.2km" href="/badges/b6" />
    </Grid>
  ),
};

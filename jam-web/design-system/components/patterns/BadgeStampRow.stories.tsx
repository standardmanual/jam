import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeStampRow } from './BadgeStampRow';

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

const meta: Meta<typeof BadgeStampRow> = {
  title: 'MODULAR/Patterns/BadgeStampRow',
  component: BadgeStampRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '반복형 계열 한 줄 — 티켓 20260905_0036. 반복형(v5 139종)은 같은 조건을 몇 번 다시 ' +
          '채웠는지가 전부다("한 주에 3회"를 1·8·26·52회 반복). **누적 횟수는 `×N` 칩 하나로만 ' +
          '그린다 — 점 그리드를 쓰지 않는다.** 47회를 점 47개로 그리면 100회를 넘는 순간 의미를 ' +
          '잃고, 축약하면(한 점 = 5회 같은 식) 임의로 정한 기준이 화면에 그대로 드러난다. ' +
          '그리드는 `BadgeLevelGauge`와 같다 — 칩 자리 폭이 52px로 고정이라 **칩이 있는 행끼리는** ' +
          '이름 시작 x가 같다. 칩을 그리지 않는 행(미획득·등급 없음)은 **칩 칸 자체를 만들지 않는다** ' +
          '(20260906_1323 §2 — 빈 칸을 남기면 52px + columnGap 8px이 여백으로 남아 이름만 안쪽으로 ' +
          '밀린다). 이름은 말줄임하지 않고 줄바꿈한다(§5 — 계열 이름이 곧 지표다). ' +
          '미획득이면 이름·칩·카운터에서 색을 거두고 썸네일은 ' +
          '**grayscale(1) 원본**으로 둔다(2026-09-06 확정 — 실루엣이 아니다).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeStampRow>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

// v5 실데이터 — walking "이번 주의 약속"(한 주에 3회 / 1·8·26·52회), "스물넷의 산책"
export const Default: Story = {
  name: '기본 — 이번 주의 약속 Rare, 누적 12회',
  render: () => (
    <Frame>
      <BadgeStampRow name="이번 주의 약속" rarity="rare" count={12} caption="한 주(월~일)에 3회" />
    </Frame>
  ),
};

/**
 * 횟수가 아무리 커져도 칩 하나뿐이라 줄 높이가 변하지 않는다 — 점 그리드였다면 여기서
 * 무너진다.
 */
export const CountScale: Story = {
  name: '1회 → 999회 — 칩 하나라 줄이 변하지 않는다',
  render: () => (
    <Frame>
      <div data-testid="rows" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={1} caption="한 주(월~일)에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="epic" count={47} caption="한 주(월~일)에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="mystic" count={999} caption="한 주(월~일)에 3회" />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="rows"] > div')) as HTMLElement[];
    const heights = rows.map((r) => r.getBoundingClientRect().height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    // 누적은 칩 «하나»로만 — 점 그리드로 회귀하면 여기서 걸린다.
    expect(rows[1].textContent).toContain('×47');
  },
};

export const Unearned: Story = {
  name: '미획득 — 이름·칩·카운터에서 색을 거둔다',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="리듬 브레이커" rarity="rare" count={3} caption="3일 연속 서로 다른 시간대" />
        <BadgeStampRow name="리듬 브레이커" rarity="epic" count={null} caption="3회 반복하면 받아요" earned={false} />
      </div>
    </Frame>
  ),
};

/**
 * 회귀 고정(20260906_1323 §2) — 칩이 없는 행은 이름이 **카드 왼쪽 끝**에서 시작한다.
 * 예전에는 빈 52px 칸이 남아 이름만 안쪽으로 밀리고 바로 아래 캡션과 시작 x가 어긋났다
 * (스크린샷 「완전한 하루」).
 */
export const NoChipNoGap: Story = {
  name: '칩 없는 행 — 이름이 캡션과 같은 x에서 시작한다',
  render: () => (
    <Frame>
      <div data-testid="row">
        <BadgeStampRow
          name="완전한 하루"
          rarity="epic"
          count={null}
          caption="6일 연속 · 연속 후 휴식 1일 · 5회 충족"
          earned={false}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-testid="row"]')!;
    const name = Array.from(row.querySelectorAll('span')).find(
      (el) => el.textContent === '완전한 하루'
    ) as HTMLElement;
    const caption = row.querySelector('p') as HTMLElement;
    expect(name.textContent).toBe('완전한 하루');
    // 이름과 캡션의 시작 x가 같아야 한다 — 칩 칸이 남아 있으면 60px 어긋난다.
    expect(Math.abs(name.getBoundingClientRect().left - caption.getBoundingClientRect().left)).toBeLessThanOrEqual(1);
  },
};

/**
 * 긴 계열 이름은 **말줄임하지 않고 줄바꿈한다**(§5). 이름이 이 화면의 지표 그 자체라
 * 끝이 잘리면 무엇의 배지인지 사라진다.
 */
export const LongNameWraps: Story = {
  name: '긴 이름 — 말줄임 없이 줄바꿈',
  render: () => (
    <Frame>
      <div data-testid="row">
        <BadgeStampRow
          name="아주 길고 긴 계열 이름도 끝까지 보여준다"
          rarity="mystic"
          count={7}
          caption="24시간 안에 3회"
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-testid="row"]')!;
    const name = Array.from(row.querySelectorAll('span')).find(
      (el) => el.textContent === '아주 길고 긴 계열 이름도 끝까지 보여준다'
    ) as HTMLElement;
    expect(name).toBeTruthy();
    // 말줄임이면 scrollWidth가 clientWidth를 넘는다 — 줄바꿈이면 넘지 않는다.
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
  },
};

export const AlignsWithLevelGauge: Story = {
  name: '칩이 있는 행끼리는 이름 시작 x가 같다 (칩 자리 52px 고정)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="스물넷의 산책" rarity="mystic" count={12} caption="24시간 안에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={1} caption="한 주(월~일)에 3회" />
      </div>
    </Frame>
  ),
};

/**
 * 썸네일 규칙 — 획득은 원본 컬러, **미획득은 원본 + `grayscale(1)`**(2026-09-06 확정).
 * `imageUrl`을 넘기지 않으면 중성 자리 표시만 그린다.
 */
export const ThumbnailGrayscale: Story = {
  name: '썸네일 — 획득은 컬러, 미획득은 그레이',
  render: () => (
    <Frame>
      <div data-testid="rows" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="작심삼일의 파괴자" rarity="rare" count={5} caption="3일 연속" imageUrl={WALK_ICON} />
        <BadgeStampRow
          name="열흘의 리듬"
          rarity="epic"
          count={0}
          caption="10일 연속"
          earned={false}
          imageUrl={WALK_ICON}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const imgs = Array.from(canvasElement.querySelector('[data-testid="rows"]')!.querySelectorAll('img'));
    expect(imgs.length).toBe(2);
    const gray = imgs.filter((i) => getComputedStyle(i).filter.includes('grayscale'));
    expect(gray.length).toBe(1);
  },
};

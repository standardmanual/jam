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
          '구조는 `BadgeLevelGauge`와 같다 — 20260906_2140에서 헤더를 공유 부품 ' +
          '`BadgeFamilyCardHeader`로 올렸다. 예전에는 이름이 썸네일(44)+갭(12)+칩(52) 뒤 ' +
          '**88px**에서 시작해 레일 카드(32px)와 어긋나 있었다. 이제 이름은 **카드 왼쪽 패딩 ' +
          '엣지**에서 시작하고, 등급은 헤더 우측 진행률 옆 `Epic` **텍스트**가 된다(칩이 아니다 — ' +
          '레일 안의 등급칩과 경쟁하지 않게). 본문은 `[52px 썸네일][×N 칩 + 캡션 + 10px 바]`. ' +
          '이름은 말줄임하지 않고 줄바꿈한다(§5 — 계열 이름이 곧 지표다). ' +
          '미획득이면 카운터에서 색을 거두고 썸네일은 ' +
          '**grayscale(1) 원본**으로 둔다(2026-09-06 확정 — 실루엣이 아니다). 이미지는 여백 없이 ' +
          '프레임을 꽉 채운다(objectFit: cover).',
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
      <BadgeStampRow
        name="이번 주의 약속"
        rarity="rare"
        count={12}
        caption="12/26회 · 14회 남음"
        fraction={12 / 26}
        metaText="다음 Epic"
      />
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
 * 20260906_2140 — 등급·횟수 유무와 무관하게 **이름은 카드 왼쪽 패딩 엣지**에서 시작한다.
 * 20260906_1323 §2가 고친 문제(빈 52px 칩 칸이 남아 이름만 안쪽으로 밀림)는 이제 구조적으로
 * 사라졌다 — 이름 왼쪽에 아무것도 없기 때문이다.
 */
export const NameStartsAtCardEdge: Story = {
  name: '20260906_2140 — 이름이 카드 왼쪽 패딩 엣지에서 시작',
  render: () => (
    <Frame>
      <div data-testid="rows" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow
          name="완전한 하루"
          rarity="epic"
          count={null}
          caption="6일 연속 · 연속 후 휴식 1일 · 5회"
          earned={false}
        />
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={8} caption="8/26회" fraction={8 / 26} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="rows"] > div')) as HTMLElement[];
    const leftOf = (row: HTMLElement, text: string) => {
      const el = Array.from(row.querySelectorAll('span')).find((s2) => s2.textContent === text) as HTMLElement;
      return Math.round(el.getBoundingClientRect().left - row.getBoundingClientRect().left);
    };
    expect(leftOf(rows[0], '완전한 하루')).toBe(16);
    expect(leftOf(rows[1], '이번 주의 약속')).toBe(16);
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

/**
 * 티켓 20260906_1424 ③ — 말줄임 제거 후 `wordBreak: 'keep-all'`만 남으면 **공백 없는**
 * 긴 이름(한글 어절 하나가 컬럼보다 긴 경우)은 줄바꿈이 막혀 컬럼을 뚫고 넘칠 수 있다.
 * `overflowWrap: 'anywhere'`를 함께 둬 그런 토큰만 강제로 분리되는지 확인한다.
 */
export const LongNameNoSpaceDoesNotOverflow: Story = {
  name: '공백 없는 긴 이름 — 컬럼을 뚫지 않는다',
  render: () => (
    <Frame>
      <div data-testid="row">
        <BadgeStampRow
          name="가나다라마바사아자차카타파하몹시길고공백이전혀없는이름"
          rarity="mystic"
          count={3}
          caption="24시간 안에 3회"
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector('[data-testid="row"]')!;
    const name = Array.from(row.querySelectorAll('span')).find((el) =>
      (el.textContent ?? '').startsWith('가나다라마바사아자차카타파하')
    ) as HTMLElement;
    expect(name).toBeTruthy();
    // overflowWrap:'anywhere'가 없으면 강제로 분리되지 않아 scrollWidth가 clientWidth를 넘는다.
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
    // 카드 폭(375 - 32 padding - 44 썸네일 - 12 gap) 안에 들어와야 한다 — 컬럼을 뚫지 않는다.
    const card = row.firstElementChild as HTMLElement;
    expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(card.getBoundingClientRect().right + 1);
  },
};

export const AlignsWithLevelGauge: Story = {
  name: '모든 행의 이름 시작 x가 같다 (공유 헤더)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="스물넷의 산책" rarity="mystic" count={12} caption="12/26회" fraction={0.46} metaText="다음 Mystic" />
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={1} caption="1/8회" fraction={0.125} metaText="다음 Rare" />
      </div>
    </Frame>
  ),
};

/**
 * 20260906_2140 — 진행을 계산할 수 없으면 **진행 바를 그리지 않는다**.
 * 0%짜리 빈 막대는 「아직 아무것도 안 했다」는 틀린 사실이 된다.
 */
export const NoBarWhenProgressUnknown: Story = {
  name: '20260906_2140 — 진행을 모르면 막대를 그리지 않는다',
  render: () => (
    <Frame>
      <div data-testid="rows" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="진행 아는 계열" rarity="rare" count={8} caption="8/26회" fraction={8 / 26} />
        <BadgeStampRow name="진행 모르는 계열" rarity="rare" count={null} caption="진행 표시 준비 중" fraction={null} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="rows"] > div')) as HTMLElement[];
    // 막대는 ProgressBar의 트랙 div — 높이 10px로 고정이다.
    const barCount = (row: HTMLElement) =>
      Array.from(row.querySelectorAll('div')).filter((el) => (el as HTMLElement).offsetHeight === 10).length;
    expect(barCount(rows[0])).toBeGreaterThan(0);
    expect(barCount(rows[1])).toBe(0);
    // 퍼센트도 지어내지 않는다.
    expect(rows[1].textContent).not.toContain('%');
  },
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

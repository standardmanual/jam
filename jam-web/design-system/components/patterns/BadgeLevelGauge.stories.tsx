import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeLevelGauge } from './BadgeLevelGauge';

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

const meta: Meta<typeof BadgeLevelGauge> = {
  title: 'MODULAR/Patterns/BadgeLevelGauge',
  component: BadgeLevelGauge,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '무한레벨형 계열 한 줄 — 티켓 20260905_0036. v5는 194계열 630종이고 그중 무한레벨형이 ' +
          '193종이다. 레벨을 눈금으로 늘어놓으면 계열 하나가 Lv.1~8(현재 시딩 범위)만으로도 ' +
          '화면 한 페이지를 먹고, 레벨 상한이 없으니 앞으로 더 늘어난다. **그래서 이 ' +
          '컴포넌트는 레벨 수와 무관하게 높이가 고정이다** — 지나온 레벨을 하나도 그리지 않고 ' +
          '「지금 레벨 · 다음 목표 · 남은 양」만 말한다. 다만 **이름 줄은 말줄임이 아니다**' +
          '(20260906_1323 §5) — 이름이 곧 지표라 끝이 잘리면 안 되므로 긴 이름은 줄바꿈하고, ' +
          '그때만 카드 높이가 한 줄 늘어난다. `condition`·`metric`을 받지 않는다: ' +
          '배지 이름이 지표를 말하고(“걸어온 거리”) 값 행이 조건을 말한다. 값 행 그리드 ' +
          '`[5ch][auto][1fr][auto]`의 요점은 **현재값 5ch 우측 정렬** — 자릿수가 달라도 `/` ' +
          '구분자가 세로로 정렬된다. 진행 바는 `ProgressBar fillMode="track-gradient"`. ' +
          '20260906_1436: 진행 중(미완료) 현재값 색이 옐로우(--status-short-solid)에서 ' +
          '화이트(--color-text)로 바뀌었다 — 진행 바 채움색은 그대로 옐로우다. ' +
          '20260906_2140(v2): 헤더를 공유 부품 `BadgeFamilyCardHeader`로 올렸다 — 예전에는 ' +
          '이름이 썸네일(44)+갭(12)+칩(52) 뒤 **88px**에서 시작해 레일 카드(32px)와 어긋나 ' +
          '있었다. 이제 이름은 **카드 왼쪽 패딩 엣지**에서 시작하고, 레벨은 헤더 우측 진행률 ' +
          '옆 `Lv.8` **텍스트**가 된다(`BadgeLevelChip`을 여기서 더 쓰지 않는다). 본문은 ' +
          '`[52px 썸네일][값 행 + 10px 바]`, 현재값 --text-body-l, 이미지는 여백 없이 프레임을 ' +
          '꽉 채운다(objectFit: cover).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeLevelGauge>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

// v5 실데이터 — walking:L1 "걸어온 거리"(누적 거리 5/15/40/75…km), walking:L2 "걸은 날들"
export const Default: Story = {
  name: '기본 — 걸어온 거리 Lv.3 → Lv.4',
  render: () => (
    <Frame>
      <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={52.4 / 75} />
    </Frame>
  ),
};

/**
 * **높이 고정**이 이 컴포넌트의 존재 이유다. Lv.1과 Lv.128이 같은 높이여야 194계열이 한
 * 화면에 스캔된다 — 지나온 레벨을 렌더하지 않으므로 **레벨 수는 높이에 전혀 영향을 주지 않는다**.
 *
 * 이름 길이는 이제 예외다(20260906_1323 §5) — 말줄임을 걷어냈으므로 아주 긴 이름은 줄바꿈되고
 * 그만큼 카드가 높아진다. 아래 `LongNameWraps` 참고.
 */
export const FixedHeightAcrossLevels: Story = {
  name: '레벨 수와 무관하게 높이 고정 (Lv.1 · Lv.8 · Lv.128)',
  render: () => (
    <Frame>
      <div data-testid="gauges" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="걸어온 거리" level={1} current="3.2" next="5km" left="1.8km 남음" fraction={3.2 / 5} />
        <BadgeLevelGauge name="달려온 거리" level={8} current="1840" next="2400km" left="560km 남음" fraction={1840 / 2400} />
        <BadgeLevelGauge name="달려온 거리" level={128} current="98120" next="100000km" left="1880km 남음" fraction={0.98} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="gauges"] > div')) as HTMLElement[];
    expect(rows.length).toBe(3);
    const heights = rows.map((r) => r.getBoundingClientRect().height);
    // 레벨 1 · 8 · 128 — 자릿수가 늘어도 높이가 같아야 한다.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  },
};

/**
 * 회귀 고정(20260906_1323 §5) — 긴 계열 이름은 **말줄임하지 않고 줄바꿈한다**.
 * 이름이 이 화면의 지표 그 자체라(「걸어온 거리」) 끝이 잘리면 무엇의 배지인지 사라진다.
 */
export const LongNameWraps: Story = {
  name: '긴 이름 — 말줄임 없이 줄바꿈 (높이는 그만큼 늘어난다)',
  render: () => (
    <Frame>
      <div data-testid="gauges" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={0.7} />
        <BadgeLevelGauge
          name="아주 길고 긴 계열 이름이 들어와도 끝까지 다 보여준다"
          level={128}
          current="98120"
          next="100000km"
          left="1880km 남음"
          fraction={0.98}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="gauges"] > div')) as HTMLElement[];
    const longName = Array.from(rows[1].querySelectorAll('span')).find(
      (el) => el.textContent === '아주 길고 긴 계열 이름이 들어와도 끝까지 다 보여준다'
    ) as HTMLElement;
    expect(longName).toBeTruthy();
    // 말줄임이면 scrollWidth가 clientWidth를 넘는다 — 줄바꿈이면 넘지 않는다.
    expect(longName.scrollWidth).toBeLessThanOrEqual(longName.clientWidth + 1);
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
      <div data-testid="gauge">
        <BadgeLevelGauge
          name="가나다라마바사아자차카타파하몹시길고공백이전혀없는이름"
          level={3}
          current="52.4"
          next="75km"
          left="22.6km 남음"
          fraction={0.7}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const gauge = canvasElement.querySelector('[data-testid="gauge"]')!;
    const name = Array.from(gauge.querySelectorAll('span')).find((el) =>
      (el.textContent ?? '').startsWith('가나다라마바사아자차카타파하')
    ) as HTMLElement;
    expect(name).toBeTruthy();
    // overflowWrap:'anywhere'가 없으면 강제로 분리되지 않아 scrollWidth가 clientWidth를 넘는다.
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth + 1);
    const card = gauge.firstElementChild as HTMLElement;
    expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(card.getBoundingClientRect().right + 1);
  },
};

/**
 * 값 행의 요점 — 현재값을 5ch 우측 정렬해 자릿수가 달라도 `/`가 세로로 정렬된다.
 * (레일·게이지가 세로로 쌓이는 트리에서 이 정렬 하나가 스캔 비용을 크게 줄인다)
 */
export const SlashAlignment: Story = {
  name: '값 행 — `/` 세로 정렬 (자릿수 1~5)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="걸은 날들" level={1} current="2" next="3일" left="1일 남음" fraction={2 / 3} />
        <BadgeLevelGauge name="걸어온 거리" level={2} current="38.5" next="40km" left="1.5km 남음" fraction={38.5 / 40} />
        <BadgeLevelGauge name="달려온 거리" level={7} current="12840" next="15000km" left="2160km 남음" fraction={12840 / 15000} />
      </div>
    </Frame>
  ),
};

/**
 * 회귀 고정(20260906_1436 §3) — 진행 중(미완료)인 현재값은 화이트(--color-text)다.
 * 예전엔 옐로우(--status-short-solid)였는데 눈에 거슬린다는 지적으로 텍스트 색만 바꿨다.
 * 진행 바 채움색(ProgressBar의 --status-short-solid → --status-done-solid 그라데이션)은
 * 그대로다 — 이 스토리에서는 값 텍스트 색만 검증한다.
 */
export const InProgressValueIsWhite: Story = {
  name: '20260906_1436 — 진행 중 값은 화이트(막대는 옐로우 유지)',
  render: () => (
    <Frame>
      <div data-testid="gauge">
        <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={52.4 / 75} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const gauge = canvasElement.querySelector('[data-testid="gauge"]')!;
    const current = Array.from(gauge.querySelectorAll('span')).find((el) => el.textContent === '52.4') as HTMLElement;
    expect(current).toBeTruthy();
    // --color-text(#ffffff) → rgb(255, 255, 255). 옐로우(#f2cb00)가 아니어야 한다.
    expect(getComputedStyle(current).color).toBe('rgb(255, 255, 255)');
  },
};

export const Complete: Story = {
  name: '다 채움 — 현재값이 라임(--status-done-solid)으로 바뀐다',
  render: () => (
    <Frame>
      <BadgeLevelGauge name="걸은 날들" level={4} current="40" next="40일" left="달성" fraction={1} />
    </Frame>
  ),
};

/**
 * 20260906_2140 — 레벨이 있든 없든 **이름 시작 x는 카드 왼쪽 패딩 엣지 하나**다.
 *
 * 20260906_1323 §2가 고친 문제(빈 52px 칩 칸이 남아 이름만 안쪽으로 밀림)는 이제 구조적으로
 * 사라졌다 — 레벨은 헤더 오른쪽 진행률 옆 텍스트로 갔고, 이름 왼쪽에는 아무것도 없다.
 * 레벨이 없으면 `Lv.N` 라벨만 안 그린다.
 */
export const NoLevelYet: Story = {
  name: '20260906_2140 — 레벨 유무와 무관하게 이름 시작 x가 같다',
  render: () => (
    <Frame>
      <div data-testid="gauges" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="달려온 거리" level={null} current="6.4" next="20km" left="13.6km 남음" fraction={6.4 / 20} />
        <BadgeLevelGauge name="걸어온 거리" level={1} current="8.0" next="15km" left="7km 남음" fraction={8 / 15} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="gauges"] > div')) as HTMLElement[];
    const nameOf = (row: HTMLElement, text: string) =>
      Array.from(row.querySelectorAll('span')).find((el) => el.textContent === text) as HTMLElement;
    const noLevel = nameOf(rows[0], '달려온 거리');
    const withLevel = nameOf(rows[1], '걸어온 거리');
    // 이름 시작 x가 하나여야 세로로 훑을 축이 생긴다(이번 티켓의 핵심).
    const leftOf = (name: HTMLElement, row: HTMLElement) =>
      Math.round(name.getBoundingClientRect().left - row.getBoundingClientRect().left);
    expect(leftOf(noLevel, rows[0])).toBe(leftOf(withLevel, rows[1]));
    // 카드 안쪽 패딩(--spacing-16)과 같은 값이다.
    expect(leftOf(noLevel, rows[0])).toBe(16);
    // 레벨이 없으면 Lv. 라벨을 그리지 않는다.
    expect(rows[0].textContent).not.toContain('Lv.');
    expect(rows[1].textContent).toContain('Lv.1');
  },
};

/**
 * 20260906_2140 F-3 — 배지 이미지는 **여백 없이 프레임을 꽉 채운다**.
 * `padding: 0` + `objectFit: cover`이고, 모서리는 **프레임의 `overflow: hidden`으로만** 자른다
 * (이미지에 따로 radius를 걸면 두 radius가 어긋나 모서리가 삐져나온다).
 */
export const ImageFillsFrame: Story = {
  name: '20260906_2140 — 이미지가 여백 없이 프레임을 채운다',
  render: () => (
    <Frame>
      <div data-testid="gauge">
        <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={0.7} imageUrl={WALK_ICON} />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const img = canvasElement.querySelector('[data-testid="gauge"] img') as HTMLImageElement;
    expect(img).toBeTruthy();
    const cs = getComputedStyle(img);
    expect(cs.objectFit).toBe('cover');
    expect(cs.paddingTop).toBe('0px');
    // 자르는 일은 프레임이 전담한다 — 이미지에 radius를 걸지 않는다.
    expect(cs.borderTopLeftRadius).toBe('0px');
    const frame = img.parentElement as HTMLElement;
    expect(getComputedStyle(frame).overflow).toBe('hidden');
    // 52px 프레임을 남김없이 채운다.
    expect(Math.round(img.getBoundingClientRect().width)).toBe(52);
  },
};

/**
 * 회귀 고정 — 다음 레벨 배지는 정의상 미획득이라 **원본 이미지를 `grayscale(1)`로** 그린다
 * (2026-09-06 확정). `imageUrl`을 넘기지 않으면 중성 자리 표시만 나온다.
 */
export const GrayscaleNextLevel: Story = {
  name: '회귀 — 다음 레벨 배지는 그레이 원본',
  render: () => (
    <Frame>
      <div data-testid="gauge">
        <BadgeLevelGauge
          name="걸어온 거리"
          level={3}
          current="52.4"
          next="75km"
          left="22.6km 남음"
          fraction={0.7}
          imageUrl={WALK_ICON}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const gauge = canvasElement.querySelector('[data-testid="gauge"]')!;
    const img = gauge.querySelector('img');
    expect(img).not.toBeNull();
    expect(getComputedStyle(img!).filter).toContain('grayscale');
  },
};

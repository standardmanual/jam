import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { LabelChip } from './LabelChip';
import { Card } from './Card';

/**
 * 기본 색조(`default`) Story는 **흰 Card(tone="inverse") 위**에서 보여준다. 검정 캔버스(#000)에 #1a1a1a 칩만
 * 두면 경계가 거의 안 보여 실제 모습이 아니다 — 실제 호출부(현황 줄·온보딩 퀘스트 카드)가 모두
 * 흰 inverse 카드 안이다. 반전 색조(`tone="inverse"`) Story는 반대로 **검정 바탕 위**에서 보여준다(기사 화면 칩).
 */
const meta: Meta<typeof LabelChip> = {
  title: 'MODULAR/Cards/LabelChip',
  component: LabelChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '카드 좌상단 «라벨 필» — 티켓 20261001_1204(상위 20260930_1453 b0). 홈 화면 세 곳에 같은 ' +
          'Tailwind 클래스 문자열로 복제돼 있던 칩을 합쳤고, 인라인 style은 그 클래스의 **계산값 그대로**다 ' +
          '(12px bold 대문자 · 안쪽 여백 6px 10px · `--radius-full` · `--background` 채움 · ' +
          '`--foreground` 글자). 변형은 `tone`(`default` | `inverse`) 하나뿐이다 — `inverse`는 검정 바탕 위(기사 화면)용으로 ' +
          '`--background-inverse` 채움 + `--snow` 글자이고 나머지 모양은 같다(티켓 20261001_1737, 1248). ' +
          '`size` 변형은 없고 `self-start` 같은 배치는 호출부 `className`으로 넘긴다. `children`이 비어 있으면 아무것도 그리지 않는다. ' +
          '`ShapeTag`(minHeight 44px·padding 10/16·태그 팔레트)·`RarityBadge`(등급 전용)·' +
          '`BadgeLevelChip`(Lv.N 전용)으로는 같은 픽셀이 나오지 않아 따로 뒀다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LabelChip>;

const CARD_WIDTH = 280;

export const Default: Story = {
  name: '기본 — 흰 카드 위 한글 라벨',
  render: () => (
    <Card tone="inverse" style={{ width: CARD_WIDTH }}>
      <LabelChip>내 진행도</LabelChip>
    </Card>
  ),
};

/** 영문 소문자 입력은 `textTransform: uppercase`로 SYNC처럼 보인다. 한글은 영향이 없다. */
export const LowercaseInput: Story = {
  name: '영문 소문자 입력 — 화면은 대문자',
  render: () => (
    <Card tone="inverse" style={{ width: CARD_WIDTH }}>
      <span data-testid="lowercase">
        <LabelChip>sync</LabelChip>
      </span>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('[data-testid="lowercase"] span') as HTMLElement;
    expect(getComputedStyle(chip).textTransform).toBe('uppercase');
  },
};

/** 온보딩 퀘스트 카드의 칩 줄 재현 — 칩은 좌측, 진행도 n/7은 같은 줄 우측. */
export const ChipRow: Story = {
  name: '칩 줄 — [LabelChip] ····· 1/7 (퀘스트 카드)',
  render: () => (
    <Card tone="inverse" style={{ width: CARD_WIDTH }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <LabelChip>퀘스트</LabelChip>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--link)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          1/7
        </span>
      </div>
    </Card>
  ),
};

/**
 * flex-col 카드의 기본 `align-items: stretch`는 `inline-flex` 칩도 카드 폭으로 늘린다.
 * 그래서 호출부가 `className="self-start"`를 넘긴다(컴포넌트에 굳히지 않는다).
 * 아래 두 카드에서 위는 `self-start` 없음(칩이 카드 폭으로 늘어남), 아래는 있음(글자 폭).
 */
export const SelfStartCompare: Story = {
  name: 'flex-col 카드 — self-start 없음 / 있음',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        tone="inverse"
        className="flex flex-col gap-2"
        style={{ width: CARD_WIDTH }}
        data-testid="without-self-start"
      >
        <LabelChip>self-start 없음</LabelChip>
      </Card>
      <Card
        tone="inverse"
        className="flex flex-col gap-2"
        style={{ width: CARD_WIDTH }}
        data-testid="with-self-start"
      >
        <LabelChip className="self-start">self-start 있음</LabelChip>
      </Card>
    </div>
  ),
};

/** `children`이 비면 빈 필이 남지 않는다 — 아래 카드 안에는 아무것도 그려지지 않는다. */
export const EmptyChildren: Story = {
  name: 'children 비어 있음 — 아무것도 그리지 않는다',
  render: () => (
    <Card tone="inverse" style={{ width: CARD_WIDTH, minHeight: 40 }}>
      <div data-testid="empty">
        <LabelChip>{''}</LabelChip>
        <LabelChip>{null}</LabelChip>
      </div>
    </Card>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('[data-testid="empty"]')?.children.length).toBe(0);
  },
};

/**
 * 반전 색조 — 검정 바탕 위 흰 칩(기사 화면 `ArticleView`의 라벨 칩). 티켓 20261001_1737(1248).
 * 위는 기본 색조(흰 카드 위 짙은 회색 칩), 아래는 `tone="inverse"`(검정 바탕 위 흰 칩)다. 모양(높이·여백·글자 크기)은 같다.
 */
export const ToneInverse: Story = {
  name: '반전 색조 — 검정 바탕 위 흰 칩 (tone="inverse")',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card tone="inverse" style={{ width: CARD_WIDTH }}>
        <span data-testid="tone-default">
          <LabelChip>기본 · 흰 카드 위</LabelChip>
        </span>
      </Card>
      <div style={{ width: CARD_WIDTH }}>
        <span data-testid="tone-inverse">
          <LabelChip tone="inverse">반전 · 검정 바탕 위</LabelChip>
        </span>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const base = canvasElement.querySelector('[data-testid="tone-default"] span') as HTMLElement;
    const inverse = canvasElement.querySelector('[data-testid="tone-inverse"] span') as HTMLElement;
    // 색조만 다르고 높이·여백·글자 크기는 같다
    expect(inverse.getBoundingClientRect().height).toBe(base.getBoundingClientRect().height);
    expect(getComputedStyle(inverse).padding).toBe(getComputedStyle(base).padding);
    expect(getComputedStyle(inverse).fontSize).toBe(getComputedStyle(base).fontSize);
    expect(getComputedStyle(inverse).backgroundColor).not.toBe(getComputedStyle(base).backgroundColor);
  },
};

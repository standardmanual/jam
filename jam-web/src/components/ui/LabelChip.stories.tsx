import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { d } from '@/lib/i18n';
import { LabelChip } from './LabelChip';
import { Card } from './Card';

/**
 * 기본 색조(`default`) Story는 **기본 Card(흰 면) 위**에서 보여준다. 크림 캔버스에 칩만 두면 칩 면(`--background-secondary`)과의
 * 대비가 약해 실제 모습이 아니다 — 실제 호출부(현황 줄·온보딩 퀘스트 카드)가 모두 흰 카드 안이다.
 * 반전 색조(`tone="inverse"`) Story는 반대로 **크림 바탕 위**에서 보여준다(기사 화면 칩, 어두운 알약).
 */
const meta: Meta<typeof LabelChip> = {
  title: 'UI/Cards/LabelChip',
  component: LabelChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '카드 좌상단 «라벨 필» — 티켓 20261001_1204(상위 20260930_1453 b0). 홈 화면 세 곳에 같은 ' +
          'Tailwind 클래스 문자열로 복제돼 있던 칩을 합쳤고, 인라인 style은 그 클래스의 **계산값 그대로**다 ' +
          '(12px bold 대문자 · 안쪽 여백 6px 10px · `--radius-full` · `--background-secondary` 채움 · ' +
          '`--foreground` 글자). 변형은 `tone`(`default` | `inverse`) 하나뿐이다 — `inverse`는 크림 바탕 위(기사 화면)용으로 ' +
          '`--background-inverse` 채움 + `--snow` 글자이고 나머지 모양은 같다(티켓 20261001_1737, 1248). ' +
          '`size` 변형은 없고 `self-start` 같은 배치는 호출부 `className`으로 넘긴다. `children`이 비어 있으면 아무것도 그리지 않는다. ' +
          '`RarityBadge`(등급 전용)·' +
          '`BadgeLevelChip`(Lv.N 전용)으로는 같은 픽셀이 나오지 않아 따로 뒀다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LabelChip>;

const CARD_WIDTH = 280;

/** 아이템 배지 상세 등에서 흰 카드 위에 놓이는 기본 칩(예: 획득 이력의 «처음 받은 날») */
export const Default: Story = {
  name: '기본 — 흰 카드 위',
  render: () => (
    <Card style={{ width: CARD_WIDTH }}>
      <LabelChip>{d.badges.firstEarnedChip}</LabelChip>
    </Card>
  ),
};

/**
 * 오늘 현황 줄·정지 안내·Strava 안내 카드처럼 flex-col 카드 안에서 쓰는 칩.
 * 카드의 `align-items: stretch`가 칩을 카드 폭으로 늘리지 않도록 호출부가 `className="self-start"`를 넘긴다.
 */
export const SelfStart: Story = {
  name: '카드 안 — 글자 폭(self-start)',
  render: () => (
    <Card className="flex flex-col gap-2" style={{ width: CARD_WIDTH }}>
      <LabelChip className="self-start">{d.badges.firstEarnedChip}</LabelChip>
    </Card>
  ),
};

/** 기사 화면(`ArticleView`)의 라벨 칩 — 크림 바탕 위 어두운 칩. 모양(높이·여백·글자 크기)은 기본 색조와 같다. */
export const ToneInverse: Story = {
  name: '반전 색조 — 크림 바탕 위',
  render: () => (
    <div style={{ width: CARD_WIDTH }}>
      <span data-testid="tone-inverse">
        <LabelChip tone="inverse">기사</LabelChip>
      </span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const inverse = canvasElement.querySelector('[data-testid="tone-inverse"] span') as HTMLElement;
    expect(getComputedStyle(inverse).textTransform).toBe('uppercase');
    expect(getComputedStyle(inverse).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  },
};

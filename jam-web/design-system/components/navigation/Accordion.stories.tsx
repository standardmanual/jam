import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Accordion } from './Accordion';

/**
 * 20260907 (티켓 20260907_0934): 토글 버튼이 평문 셰브런 → 원형 배지 버튼(pill)으로
 * 바뀌었다. props 형태(items/style/className)는 그대로라 기존 스토리는 그대로 유효하다.
 * `Default`(2번째 항목 defaultOpen)에서 열림/닫힘 배지 대비(닫힘: --color-bg-tint,
 * 열림: --color-primary)를 함께 확인할 수 있다.
 *
 * 20260907 인터랙션 리뷰 반영: 헤더/배지/패널 트랜지션이 인라인 style → CSS 클래스로
 * 이동했고 prefers-reduced-motion 킬스위치·헤더 :active 피드백이 추가됐다. props 형태는
 * 그대로라 아래 스토리는 수정 없이 그대로 유효하다.
 */

const FAQ_ITEMS = [
  {
    title: '배지는 어떻게 획득하나요?',
    content: (
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-body)' }}>
        Strava 활동을 동기화하면 미션을 달성할 때 배지를 획득해요.
      </p>
    ),
  },
  {
    title: '드랍 확률이란 무엇인가요?',
    content: (
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-body)' }}>
        드랍은 미션 완료 시 확률로 떨어지는 아이템 배지예요. 활동 강도에 따라 드랍률이 달라져요.
      </p>
    ),
    defaultOpen: true,
  },
  {
    title: '배지를 믹스할 수 있나요?',
    content: (
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-body)' }}>
        아이템 배지를 믹스하면 새로운 희귀 배지를 만들 수 있어요. 인벤토리에서 믹스해 보세요.
      </p>
    ),
  },
];

const meta: Meta<typeof Accordion> = {
  title: 'MODULAR/Navigation/Accordion',
  component: Accordion,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Accordion>;

export const Default: Story = {
  name: 'FAQ 예시',
  args: { items: FAQ_ITEMS },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const AllClosed: Story = {
  name: '전체 닫힘',
  args: {
    items: [
      { title: '항목 1', content: <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>항목 1 내용입니다.</p> },
      { title: '항목 2', content: <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>항목 2 내용입니다.</p> },
      { title: '항목 3', content: <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>항목 3 내용입니다.</p> },
    ],
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const SingleItem: Story = {
  name: '단일 항목',
  args: {
    items: [{ title: '단일 항목', content: <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>단일 항목입니다.</p>, defaultOpen: true }],
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const ManyItems: Story = {
  name: '많은 항목 (5개)',
  args: {
    items: Array.from({ length: 5 }, (_, i) => ({
      title: `항목 ${i + 1} — 질문 제목이 들어갑니다`,
      content: <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>항목 {i + 1}의 상세 내용입니다.</p>,
    })),
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

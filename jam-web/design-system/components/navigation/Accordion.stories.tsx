import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Accordion } from './Accordion';

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

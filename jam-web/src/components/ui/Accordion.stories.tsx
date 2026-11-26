import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Accordion } from './Accordion';

const ANSWER_CLASS = 'text-base leading-[var(--leading-reading)] text-muted [word-break:keep-all] break-words';

const FAQ_ITEMS = [
  {
    title: '배지는 어떻게 얻나요?',
    content: (
      <p className={ANSWER_CLASS}>
        운동을 마치고 Strava 동기화를 하면 자동으로 조건을 확인해서 배지를 드려요. 따로
        신청할 필요는 없어요. Common부터 Mystic까지 등급이 있는 배지도 있고, 계속 올라가는
        레벨형 배지도 있어요.
      </p>
    ),
  },
  {
    title: '운동을 마쳤는데 왜 배지가 바로 안 나오나요?',
    content: (
      <p className={ANSWER_CLASS}>
        JAM은 활동을 자동으로 가져오지 않아요. Strava에 기록이 올라온 뒤, 홈 화면의
        동기화 버튼을 직접 눌러야 최신 활동을 불러오고 배지 조건을 확인해요. 배지가
        안 보인다면 동기화 버튼부터 눌러 보세요.
      </p>
    ),
  },
  {
    title: '직접 입력한 기록도 인정되나요?',
    content: (
      <p className={ANSWER_CLASS}>
        아니요. JAM은 운동을 직접 재지 않아요. 손목시계나 자전거 속도계 같은 기기가 측정해
        Strava에 올라온 기록만 가져와요. 손으로 적어 넣은 숫자는 배지로 인정하지 않아요.
      </p>
    ),
  },
];

const meta: Meta<typeof Accordion> = {
  title: 'UI/Navigation/Accordion',
  component: Accordion,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Accordion>;

/** 철학 화면(`philosophy/page.tsx`)의 자주 묻는 질문 — 모두 닫힌 채로 시작한다. */
export const Default: Story = {
  name: '자주 묻는 질문',
  args: { items: FAQ_ITEMS },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

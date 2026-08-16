import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'MODULAR/Feedback/EmptyState',
  component: EmptyState,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  name: '기본 (기본 아이콘)',
  args: {
    title: '아직 배지가 없어요',
    description: '활동을 동기화하면 배지를 획득할 수 있어요.',
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithAction: Story = {
  name: '액션 버튼 포함',
  args: {
    title: '아직 배지가 없어요',
    description: 'Strava를 동기화하고 첫 활동을 불러와 보세요.',
    action: { label: 'Strava 동기화', onClick: () => {} },
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const NoIcon: Story = {
  name: '아이콘 없음 (icon=null)',
  args: {
    icon: null,
    title: '검색 결과가 없어요',
    description: '다른 검색어를 사용해 보세요.',
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const TitleOnly: Story = {
  name: '제목만',
  args: { title: '미션이 없어요' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithCustomIcon: Story = {
  name: '커스텀 아이콘',
  args: {
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48} aria-hidden="true">
        <circle cx="24" cy="24" r="16" />
        <path d="M24 16v8l5 3" />
      </svg>
    ),
    title: '아직 기록이 없어요',
    description: '첫 번째 활동을 완료하면 기록이 표시돼요.',
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const SearchEmpty: Story = {
  name: '검색 결과 없음 (서비스 패턴)',
  args: {
    icon: null,
    title: '"마라톤" 검색 결과가 없어요',
    description: '다른 키워드로 검색하거나 필터를 변경해 보세요.',
    action: { label: '필터 초기화', onClick: () => {} },
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

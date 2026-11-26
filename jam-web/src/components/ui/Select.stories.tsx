import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Select } from './Select';
import { d } from '@/lib/i18n';
import { BADGE_ACTIVITY_FILTER_LABELS } from '@/lib/utils';

const ACTIVITY_OPTIONS = [
  { value: 'all', label: d.badges.filterActivityAll },
  ...Object.entries(BADGE_ACTIVITY_FILTER_LABELS).map(([value, label]) => ({ value, label })),
];

const meta: Meta<typeof Select> = {
  title: 'UI/Forms/Select',
  component: Select,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

/** 배지 목록(`BadgesClient`)의 활동 필터 — 항상 값이 선택된 채로 보이고 처음은 «전체»다. */
export const WithValue: Story = {
  name: '선택된 상태',
  args: { options: ACTIVITY_OPTIONS, value: 'all', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 160 }}><Story /></div>],
};

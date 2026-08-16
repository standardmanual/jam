import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Select } from './Select';

const ACTIVITY_OPTIONS = [
  { value: 'running', label: '러닝' },
  { value: 'cycling', label: '사이클링' },
  { value: 'swimming', label: '수영' },
  { value: 'hiking', label: '하이킹' },
  { value: 'trail', label: '트레일 러닝' },
];

const meta: Meta<typeof Select> = {
  title: 'MODULAR/Forms/Select',
  component: Select,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
  },
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {
  args: { options: ACTIVITY_OPTIONS, placeholder: '활동 유형 선택', 'aria-label': '활동 유형' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithValue: Story = {
  name: '선택된 상태',
  args: { options: ACTIVITY_OPTIONS, value: 'running', 'aria-label': '활동 유형', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const ErrorState: Story = {
  name: '오류 상태',
  args: { options: ACTIVITY_OPTIONS, state: 'error', placeholder: '활동 유형 선택', 'aria-label': '활동 유형' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const SuccessState: Story = {
  name: '성공 상태',
  args: { options: ACTIVITY_OPTIONS, value: 'cycling', state: 'success', 'aria-label': '활동 유형', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Disabled: Story = {
  name: '비활성화',
  args: { options: ACTIVITY_OPTIONS, value: 'running', disabled: true, 'aria-label': '활동 유형', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Interactive: Story = {
  name: '인터랙티브 (선택 반응)',
  render: () => {
    const [value, setValue] = useState('');
    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Select
          options={ACTIVITY_OPTIONS}
          value={value}
          onChange={(e) => setValue((e.target as HTMLSelectElement).value)}
          placeholder="활동 유형을 선택하세요"
          aria-label="활동 유형"
          state={value ? 'success' : 'default'}
        />
        {value && (
          <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
            선택된 활동: <strong style={{ color: 'var(--color-primary)' }}>
              {ACTIVITY_OPTIONS.find(o => o.value === value)?.label}
            </strong>
          </p>
        )}
      </div>
    );
  },
};

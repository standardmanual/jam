import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'MODULAR/Forms/Textarea',
  component: Textarea,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
    rows: { control: 'number', min: 2, max: 10 },
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: { placeholder: '내용을 입력하세요', 'aria-label': '내용' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithValue: Story = {
  name: '값 입력된 상태',
  args: { value: '오늘 한강 공원에서 10km 달렸어요. 날씨가 좋아서 기분도 좋네요!', 'aria-label': '활동 기록', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const ErrorState: Story = {
  name: '오류 상태',
  args: { value: '', state: 'error', placeholder: '내용을 입력하세요', 'aria-label': '내용' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const SuccessState: Story = {
  name: '성공 상태',
  args: { value: '저장됐어요.', state: 'success', 'aria-label': '내용', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Disabled: Story = {
  name: '비활성화',
  args: { value: '수정할 수 없는 내용이에요.', disabled: true, 'aria-label': '비활성 텍스트', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Tall: Story = {
  name: '높은 텍스트에어리어 (rows=8)',
  args: { rows: 8, placeholder: '긴 내용을 입력하세요', 'aria-label': '내용' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithLabel: Story = {
  name: 'label 연결 패턴 (htmlFor + id)',
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="activity-memo" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
        활동 소감
      </label>
      <Textarea id="activity-memo" placeholder="오늘의 활동을 기록해 보세요" aria-label="활동 소감" />
    </div>
  ),
};

export const Interactive: Story = {
  name: '인터랙티브 (글자 수 표시)',
  render: () => {
    const [value, setValue] = useState('');
    const MAX = 200;
    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Textarea
          value={value}
          onChange={(e) => setValue((e.target as HTMLTextAreaElement).value)}
          placeholder="활동 소감을 입력하세요"
          state={value.length > MAX ? 'error' : 'default'}
          aria-label="활동 소감"
        />
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: value.length > MAX ? 'var(--color-rarity-mystic)' : 'var(--color-text-secondary)', textAlign: 'right' }}>
          {value.length} / {MAX}
        </p>
      </div>
    );
  },
};

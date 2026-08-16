import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'MODULAR/Forms/Input',
  component: Input,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
    type: { control: 'radio', options: ['text', 'password', 'email', 'number', 'search'] },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: '닉네임을 입력하세요', 'aria-label': '닉네임' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithValue: Story = {
  name: '값 입력된 상태',
  args: { value: 'runner42', 'aria-label': '닉네임', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const ErrorState: Story = {
  name: '오류 상태',
  args: { value: 'invalid@', state: 'error', 'aria-label': '이메일', placeholder: '이메일을 입력하세요', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const SuccessState: Story = {
  name: '성공 상태',
  args: { value: 'runner42@jam.run', state: 'success', 'aria-label': '이메일', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Disabled: Story = {
  name: '비활성화',
  args: { value: '비활성 입력', disabled: true, 'aria-label': '비활성 입력', onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Password: Story = {
  name: '비밀번호',
  args: { type: 'password', placeholder: '비밀번호를 입력하세요', 'aria-label': '비밀번호' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithLabel: Story = {
  name: 'label 연결 패턴 (htmlFor + id)',
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="nickname-input" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
        닉네임
      </label>
      <Input id="nickname-input" placeholder="닉네임을 입력하세요" />
    </div>
  ),
};

export const WithLabelAndError: Story = {
  name: 'label + 오류 메시지 연결 (aria-describedby)',
  render: () => (
    <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label htmlFor="email-input" style={{ fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
        이메일
      </label>
      <Input
        id="email-input"
        value="invalid@"
        state="error"
        aria-describedby="email-error"
        onChange={() => {}}
      />
      <p id="email-error" role="alert" style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-rarity-mythic)' }}>
        올바른 이메일 형식이 아니에요.
      </p>
    </div>
  ),
};

export const InverseSurface: Story = {
  name: 'inverse surface (검색바)',
  render: () => (
    <div style={{ padding: 20, background: 'var(--color-bg)', borderRadius: 'var(--radius-card)' }}>
      <div style={{ width: 320 }}>
        <Input
          surface="inverse"
          placeholder="사용자 이름 검색"
          aria-label="사용자 검색"
          type="search"
        />
      </div>
    </div>
  ),
};

export const Interactive: Story = {
  name: '인터랙티브 (입력 가능)',
  render: () => {
    const [value, setValue] = useState('');
    const [state, setState] = useState<'default' | 'error' | 'success'>('default');
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      setState(e.target.value.length > 3 ? 'success' : e.target.value.length > 0 ? 'error' : 'default');
    };
    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Input
          id="interactive-input"
          value={value}
          onChange={handleChange}
          placeholder="4자 이상 입력"
          state={state}
          aria-label="인터랙티브 입력"
        />
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
          state: <strong style={{ color: state === 'error' ? 'var(--color-rarity-mythic)' : state === 'success' ? 'var(--color-rarity-rare)' : 'var(--color-text)' }}>{state}</strong>
        </p>
      </div>
    );
  },
};

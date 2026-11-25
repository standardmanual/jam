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
      <label htmlFor="nickname-input" style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
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
      <label htmlFor="email-input" style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
        이메일
      </label>
      <Input
        id="email-input"
        value="invalid@"
        state="error"
        aria-describedby="email-error"
        onChange={() => {}}
      />
      {/* 오류 문구는 --foreground다. --danger 글자는 흰 면 위 3.57:1이라 4.5:1에 못 미친다. 오류는 테두리가 맡는다. */}
      <p id="email-error" role="alert" style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--foreground)' }}>
        올바른 이메일 형식이 아니에요.
      </p>
    </div>
  ),
};

export const SearchBar: Story = {
  name: '검색바 (서비스 UserSearchBar와 같은 면)',
  render: () => (
    <div style={{ padding: 20, background: 'var(--background)', borderRadius: 'var(--radius-2xl)' }}>
      <div style={{ width: 320 }}>
        <Input
          placeholder="사용자 이름 검색"
          aria-label="사용자 검색"
          type="search"
        />
      </div>
    </div>
  ),
};

const GRID_STATES: Array<{ label: string; props: Partial<React.ComponentProps<typeof Input>> }> = [
  { label: '기본 (placeholder)', props: { placeholder: '닉네임을 입력하세요' } },
  { label: '값 입력됨', props: { value: 'runner42', onChange: () => {} } },
  { label: '오류 (--danger)', props: { value: 'invalid@', state: 'error', onChange: () => {} } },
  { label: '성공 (--success)', props: { value: 'runner42', state: 'success', onChange: () => {} } },
  { label: '비활성', props: { value: '비활성 입력', disabled: true, onChange: () => {} } },
];

export const StateGrid: Story = {
  name: '상태 격자 (크림 바탕 | 흰 Card 위)',
  parameters: { layout: 'padded' },
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {[
        { title: '크림 바탕 (--background)', background: 'var(--background)', card: false },
        { title: '흰 Card (--surface + 1px --border)', background: 'var(--surface)', card: true },
      ].map(({ title, background, card }) => (
        <div
          key={title}
          style={{
            width: 360, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
            background, borderRadius: 'var(--radius-2xl)',
            border: card ? '1px solid var(--border)' : 'none',
          }}
        >
          <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--foreground)' }}>{title}</strong>
          {GRID_STATES.map(({ label, props }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{label}</span>
              <Input aria-label={label} {...props} />
            </div>
          ))}
        </div>
      ))}
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
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          state: <strong style={{ color: 'var(--foreground)' }}>{state}</strong>
        </p>
      </div>
    );
  },
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'MODULAR/Forms/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
  },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Unchecked: Story = {
  name: '미선택',
  args: { label: '동의합니다', checked: false, id: 'cb-unchecked', onChange: () => {} },
};

export const Checked: Story = {
  name: '선택됨',
  args: { label: '동의합니다', checked: true, id: 'cb-checked', onChange: () => {} },
};

export const ErrorState: Story = {
  name: '오류 상태',
  args: { label: '필수 항목에 동의해 주세요', checked: false, state: 'error', id: 'cb-error', onChange: () => {} },
};

export const SuccessState: Story = {
  name: '성공 상태 (체크됨)',
  args: { label: '인증됐어요', checked: true, state: 'success', id: 'cb-success', onChange: () => {} },
};

export const Disabled: Story = {
  name: '비활성화 (미선택)',
  args: { label: '선택 불가', checked: false, disabled: true, id: 'cb-disabled', onChange: () => {} },
};

export const DisabledChecked: Story = {
  name: '비활성화 (선택됨)',
  args: { label: '변경 불가', checked: true, disabled: true, id: 'cb-disabled-checked', onChange: () => {} },
};

export const NoLabel: Story = {
  name: '라벨 없음',
  args: { checked: false, id: 'cb-nolabel', onChange: () => {}, 'aria-label': '체크박스' },
};

export const Interactive: Story = {
  name: '인터랙티브 (토글)',
  render: () => {
    const [checked, setChecked] = useState(false);
    return (
      <Checkbox
        id="cb-interactive"
        label={checked ? '선택됨' : '선택하세요'}
        checked={checked}
        onChange={(e) => setChecked((e.target as HTMLInputElement).checked)}
      />
    );
  },
};

export const Group: Story = {
  name: '그룹 (약관 동의)',
  render: () => {
    const [checks, setChecks] = useState({ all: false, service: false, privacy: false, marketing: false });
    const toggle = (key: keyof typeof checks) => {
      if (key === 'all') {
        const next = !checks.all;
        setChecks({ all: next, service: next, privacy: next, marketing: next });
      } else {
        setChecks(prev => {
          const next = { ...prev, [key]: !prev[key] };
          return { ...next, all: next.service && next.privacy && next.marketing };
        });
      }
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 280 }}>
        <Checkbox
          id="cb-all"
          label="전체 동의"
          checked={checks.all}
          onChange={() => toggle('all')}
          style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8, marginBottom: 4 }}
        />
        <Checkbox id="cb-service" label="서비스 이용약관 (필수)" checked={checks.service} onChange={() => toggle('service')} />
        <Checkbox id="cb-privacy" label="개인정보 처리방침 (필수)" checked={checks.privacy} onChange={() => toggle('privacy')} />
        <Checkbox id="cb-marketing" label="마케팅 수신 동의 (선택)" checked={checks.marketing} onChange={() => toggle('marketing')} />
      </div>
    );
  },
};

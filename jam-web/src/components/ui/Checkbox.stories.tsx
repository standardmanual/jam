import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Checkbox } from './Checkbox';
import { d } from '@/lib/i18n';

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Forms/Checkbox',
  component: Checkbox,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

/** 온보딩(`onboarding/page.tsx`)의 «만 14세 이상입니다» 확인 — 처음에는 선택하지 않은 상태다. */
export const Unchecked: Story = {
  name: '미선택',
  args: { label: d.onboarding.ageConfirmLabel, checked: false, onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 280 }}><Story /></div>],
};

/** 온보딩의 만 14세 이상 확인 — 선택한 뒤. */
export const Checked: Story = {
  name: '선택됨',
  args: { label: d.onboarding.ageConfirmLabel, checked: true, onChange: () => {} },
  decorators: [(Story) => <div style={{ width: 280 }}><Story /></div>],
};

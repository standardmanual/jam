import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { Input } from './Input';
import { SearchIcon } from './icons';
import { d } from '@/lib/i18n';

const meta: Meta<typeof Input> = {
  title: 'UI/Forms/Input',
  component: Input,
  parameters: { layout: 'centered' },
  argTypes: {
    state: { control: 'radio', options: ['default', 'error', 'success'] },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

const WIDTH = [(Story: React.ComponentType) => <div style={{ width: 320 }}><Story /></div>];

/** 온보딩(`onboarding/page.tsx`)·프로필 편집의 아이디 입력 — 비어 있을 때 안내 문구가 보인다. */
export const Default: Story = {
  name: '비어 있음',
  args: { placeholder: d.onboarding.usernamePlaceholder, 'aria-label': d.onboarding.usernamePlaceholder },
  decorators: WIDTH,
};

/** 프로필 편집의 아이디·이름 입력 — 값이 채워진 상태. */
export const WithValue: Story = {
  name: '값 입력된 상태',
  args: { value: 'runner42', 'aria-label': d.onboarding.usernamePlaceholder, onChange: () => {} },
  decorators: WIDTH,
};

/** 아이디 입력에서 쓸 수 없는 값을 넣었을 때, 탈퇴 시트에서 확인 문구가 다를 때 — 오류 테두리. */
export const ErrorState: Story = {
  name: '오류 상태',
  args: { value: 'runner42!', state: 'error', 'aria-label': d.onboarding.usernamePlaceholder, onChange: () => {} },
  decorators: WIDTH,
};

/** 온보딩·프로필 편집에서 아이디를 쓸 수 있을 때 — 성공 테두리. */
export const SuccessState: Story = {
  name: '성공 상태',
  args: { value: 'runner42', state: 'success', 'aria-label': d.onboarding.usernamePlaceholder, onChange: () => {} },
  decorators: WIDTH,
};

/** 탈퇴 시트(`WithdrawSheet`)에서 처리 중일 때 입력을 막는다. */
export const Disabled: Story = {
  name: '비활성화',
  args: { value: 'runner42', disabled: true, 'aria-label': d.onboarding.usernamePlaceholder, onChange: () => {} },
  decorators: WIDTH,
};

/** 사용자 검색(`UserSearchBar`)·합성 화면의 검색칸 — 앞에 돋보기 아이콘을 둔다. */
export const SearchBar: Story = {
  name: '검색칸',
  args: {
    type: 'text',
    placeholder: d.today.searchPlaceholder,
    'aria-label': d.today.searchAriaLabel,
    leading: <SearchIcon className="w-5 h-5 shrink-0 text-muted" />,
  },
  decorators: WIDTH,
};

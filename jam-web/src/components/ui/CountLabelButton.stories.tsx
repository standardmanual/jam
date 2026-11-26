import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import CountLabelButton from './CountLabelButton'

const meta: Meta<typeof CountLabelButton> = {
  title: 'UI/Buttons/CountLabelButton',
  component: CountLabelButton,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 96 }}><Story /></div>],
}

export default meta
type Story = StoryObj<typeof CountLabelButton>

/** 프로필의 팔로워 칸 — 선택되지 않은 상태(이름이 흐린 글자색) */
export const Default: Story = {
  name: '기본',
  args: { label: '팔로워', value: '1.2천', onClick: () => {} },
}

/** 해당 목록 탭이 열려 있을 때 — 이름이 진한 글자색 */
export const Selected: Story = {
  name: '선택됨',
  args: { label: '팔로잉', value: '48', selected: true, onClick: () => {} },
}

/** 포인트가 아직 불러와지지 않았을 때의 대시 */
export const Empty: Story = {
  name: '값 없음',
  args: { label: '포인트', value: '–', onClick: () => {} },
}

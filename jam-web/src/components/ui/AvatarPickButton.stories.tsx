import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import AvatarPickButton from './AvatarPickButton'
import { d } from '@/lib/i18n'

const meta: Meta<typeof AvatarPickButton> = {
  title: 'UI/Buttons/AvatarPickButton',
  component: AvatarPickButton,
  parameters: { layout: 'centered' },
  args: { alt: d.onboarding.avatarAlt, label: d.profileEdit.changePhotoAlt, onClick: () => {} },
}

export default meta
type Story = StoryObj<typeof AvatarPickButton>

/** 사진이 아직 없을 때 — 아바타의 기본 아이콘 */
export const Empty: Story = {
  name: '사진 없음',
  args: { src: null },
}

/** 사진을 올리는 동안 — 덮개와 스피너가 얹히고 버튼은 비활성 */
export const Uploading: Story = {
  name: '올리는 중',
  args: { src: null, uploading: true },
}

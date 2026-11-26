import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import React from 'react'
import IconLabelButton from './IconLabelButton'
import { CopyIcon, DownloadIcon, MoreIcon } from './icons'
import { d } from '@/lib/i18n'

const meta: Meta<typeof IconLabelButton> = {
  title: 'UI/Buttons/IconLabelButton',
  component: IconLabelButton,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: 120 }}><Story /></div>],
  argTypes: { tone: { control: 'radio', options: ['default', 'primary'] } },
}

export default meta
type Story = StoryObj<typeof IconLabelButton>

/** 배지 공유 시트의 저장하기·더보기 — 회색 서클 */
export const Default: Story = {
  name: '기본',
  args: { label: d.badges.shareActionDownload, icon: <DownloadIcon />, onClick: () => {} },
}

/** 배지 공유 시트의 복사하기 — 가장 흔한 행동 하나만 검은 서클 */
export const Primary: Story = {
  name: '강조 (primary)',
  args: { label: d.badges.shareActionCopy, icon: <CopyIcon />, tone: 'primary', onClick: () => {} },
}

/** 복사하는 동안 — aria-busy가 붙는다(중복 탭 차단은 호출부) */
export const Busy: Story = {
  name: '진행 중 (busy)',
  args: { label: d.badges.shareActionCopy, icon: <CopyIcon />, tone: 'primary', busy: true, onClick: () => {} },
}

/** 긴 글자 — 한 줄을 유지하고 칸 폭 안에서 잘린다 */
export const LongLabel: Story = {
  name: '긴 글자',
  args: { label: '다른 앱으로 보내기', icon: <MoreIcon />, onClick: () => {} },
}

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import BottomSheet from './BottomSheet';
import Button from './Button';
import { SHEET_BUTTON_CLASS, SHEET_TEXT_LEADING } from './sheetClasses';
import { d } from '@/lib/i18n';

const meta: Meta<typeof BottomSheet> = {
  title: 'UI/Feedback/BottomSheet',
  component: BottomSheet,
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: () => {} },
};

export default meta;
type Story = StoryObj<typeof BottomSheet>;

const bodyClass = `text-base ${SHEET_TEXT_LEADING} text-foreground break-keep wrap-break-word text-balance`;

/** 프로필 설정의 «동기화 끊기» 확인 시트(제목·본문·하단 버튼 두 개) */
export const TitleBodyFooter: Story = {
  name: '제목 · 본문 · 하단 버튼',
  args: {
    detent: 'compact',
    title: d.stravaConnection.disconnectSheet.title,
    footer: (
      <div className="flex gap-4">
        <Button fullWidth variant="secondary" className={`px-3! whitespace-nowrap ${SHEET_BUTTON_CLASS}`}>
          {d.stravaConnection.disconnectSheet.cancel}
        </Button>
        <Button fullWidth variant="danger" className={`px-3! whitespace-nowrap ${SHEET_BUTTON_CLASS}`}>
          {d.stravaConnection.disconnectSheet.confirm}
        </Button>
      </div>
    ),
    children: (
      <div className="flex flex-col gap-1 px-6 py-6 text-left">
        {d.stravaConnection.disconnectSheet.body.map((line) => (
          <p key={line} className={bodyClass}>
            {line}
          </p>
        ))}
      </div>
    ),
  },
};

/** 믹스 화면의 «내 배지» 목록 시트처럼 제목과 본문만 있는 시트 */
export const TitleBody: Story = {
  name: '제목 · 본문 (하단 버튼 없음)',
  args: {
    detent: 'compact',
    title: d.combine.bagTitle,
    children: (
      <div className="flex flex-col gap-1 px-6 py-6 text-left">
        <p className={bodyClass}>{d.itembooks.unslotAll.bodyReturn}</p>
      </div>
    ),
  },
};

/** 배지 공유 미리보기 시트처럼 제목 없이 내용만 있고 스크롤하지 않는 시트 */
export const BodyOnlyFixed: Story = {
  name: '제목 없음 · 스크롤 없음',
  args: {
    detent: 'compact',
    contentScrollable: false,
    children: (
      <div className="px-6 pt-4 pb-4">
        <p className={bodyClass}>{d.badges.shareImageLoading}</p>
      </div>
    ),
  },
};

/** 드랍 지도의 배지 상세 시트(큰 디텐트, 페이지 바탕색 면, 제목 없음) */
export const FullBackgroundTone: Story = {
  name: '큰 디텐트 · 바탕색 면',
  args: {
    detent: 'full',
    panelTone: 'background',
    children: (
      <div className="px-6 py-6">
        <p className={bodyClass}>{d.badges.shareImageLoading}</p>
      </div>
    ),
  },
};

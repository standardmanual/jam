import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from '../buttons/Button';

// 면(티켓 20261015_2133): 스크림 --backdrop(검정 50%) / 패널 --background(크림) / 푸터 --surface(흰) /
// 핸들 --border. 서비스 BottomSheet.tsx와 같은 값이다. 본문 카드는 흰 면 + 1px --border다.
// 20260901_1926: props API를 서비스 기준(onClose/detent/footer/topGapPx/footerBottomInset/
// contentScrollable)으로 재정렬. 드래그투클로즈는 서비스 전용 기능이라 여전히 미구현.
const meta: Meta<typeof BottomSheet> = {
  title: 'MODULAR/Navigation/BottomSheet',
  component: BottomSheet,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof BottomSheet>;

export const Open: Story = {
  name: '열린 상태 (제목 있음)',
  args: {
    open: true,
    title: '바텀 시트 제목',
    children: (
      <div>
        <p style={{ color: 'var(--muted)', margin: '0 0 16px', lineHeight: 'var(--text-base--line-height)' }}>
          바텀 시트 본문 내용입니다.
        </p>
        <Button variant="primary">닫기</Button>
      </div>
    ),
  },
};

export const NoTitle: Story = {
  name: '제목 없음',
  args: {
    open: true,
    children: (
      <p style={{ color: 'var(--foreground)', margin: 0 }}>제목 없는 바텀 시트입니다.</p>
    ),
  },
};

export const WithActions: Story = {
  name: '액션 버튼 포함',
  args: {
    open: true,
    title: '정말 삭제할까요?',
    children: (
      <div>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px', lineHeight: 'var(--text-base--line-height)' }}>
          이 작업은 되돌릴 수 없어요.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost">취소</Button>
          <Button variant="primary">삭제</Button>
        </div>
      </div>
    ),
  },
};

export const Interactive: Story = {
  name: '인터랙티브 (열기/닫기)',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div style={{
        padding: 24, background: 'var(--background)',
        minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Button variant="primary" onClick={() => setOpen(true)}>바텀 시트 열기</Button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="확인이 필요해요">
          <p style={{ color: 'var(--muted)', margin: '0 0 20px', lineHeight: 'var(--text-base--line-height)' }}>
            배경을 누르거나 Escape 키를 누르면 닫혀요.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>닫기</Button>
          </div>
        </BottomSheet>
      </div>
    );
  },
};

export const LongContent: Story = {
  name: '긴 컨텐츠',
  args: {
    open: true,
    title: '배지 상세 정보',
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} style={{ padding: 12, background: 'var(--background-secondary)', borderRadius: 'var(--radius-lg)' }}>
            <p style={{ margin: 0, color: 'var(--foreground)', fontSize: 'var(--text-base)' }}>항목 {i + 1}</p>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>상세 설명 텍스트입니다.</p>
          </div>
        ))}
      </div>
    ),
  },
};

export const WithFooter: Story = {
  name: '고정 footer (액션 버튼)',
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="긴 콘텐츠 + 고정 footer"
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><Button variant="secondary" fullWidth onClick={() => setOpen(false)}>취소</Button></div>
            <div style={{ flex: 1 }}><Button variant="primary" fullWidth onClick={() => setOpen(false)}>확인</Button></div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <p key={i} style={{ margin: 0, color: 'var(--muted)' }}>스크롤 콘텐츠 {i + 1}</p>
          ))}
        </div>
      </BottomSheet>
    );
  },
};

export const WithCardBody: Story = {
  name: '본문 Card(흰 면 + 1px 테두리) + 푸터(흰 면)',
  render: () => (
    <BottomSheet
      open
      onClose={() => {}}
      title="배지 공유"
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><Button variant="primary" fullWidth>공유</Button></div>
          <div style={{ flex: 1 }}><Button variant="secondary" fullWidth>저장</Button></div>
        </div>
      }
    >
      <div
        style={{
          padding: 16, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-2xl)', color: 'var(--foreground)',
        }}
      >
        <p style={{ margin: 0, fontSize: 'var(--text-base)' }}>크림 패널 위 흰 카드예요.</p>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          카드 경계는 그림자 없이 1px 테두리가 맡아요.
        </p>
      </div>
    </BottomSheet>
  ),
};

export const FullDetent: Story = {
  name: 'detent=full (화면 대부분 차지)',
  args: {
    open: true,
    title: '전체 디텐트',
    detent: 'full',
    children: (
      <p style={{ color: 'var(--muted)', margin: 0 }}>
        detent=&quot;full&quot;일 때 시트가 화면 대부분(92dvh)을 채웁니다.
      </p>
    ),
  },
};

export const NotScrollable: Story = {
  name: 'contentScrollable=false',
  args: {
    open: true,
    title: '스크롤 잠금',
    contentScrollable: false,
    children: (
      <p style={{ color: 'var(--muted)', margin: 0 }}>
        이미지 한 장짜리 미리보기처럼 스크롤할 내용이 없을 때 사용합니다.
      </p>
    ),
  },
};

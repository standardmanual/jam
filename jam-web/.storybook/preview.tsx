import type { Preview } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'

// 1. MODULAR 토큰 (colors / typography / spacing / radius / motion + base body styles)
import '../design-system/styles.css'

// 2. 서비스 globals (Noto Sans KR Google Fonts CDN + Tailwind v4 + 서비스 토큰 + 어드민 스코프)
//    design-system/styles.css 위에 덮어쓰므로 반드시 뒤에 import
import '../src/app/globals.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },

    a11y: {
      test: 'todo',
    },

    // JAM 2.0은 라이트 전용이다. 기본 배경은 크림 (#f1f0eb = --background). 라이트/다크 전환은 없다.
    backgrounds: {
      default: 'background',
      values: [
        { name: 'background', value: '#f1f0eb' },
      ],
    },

    // 기본 레이아웃: 중앙 정렬. 각 Story에서 'fullscreen' / 'padded'로 재정의 가능
    layout: 'centered',
  },

  decorators: [
    // MODULAR 컴포넌트 렌더 컨텍스트: 최소 너비 + 토큰 상속 보장
    (Story: () => ReactNode) => (
      <div style={{ minWidth: 320, fontFamily: 'var(--font-family-base)' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;

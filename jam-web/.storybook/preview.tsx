import type { Preview } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'

// 1. MODULAR 토큰 (colors / typography / spacing / radius / motion + base body styles)
import '../design-system/styles.css'

// 2. 서비스 globals (Pretendard CDN + Tailwind v4 + 서비스 토큰 + 서비스 radius/color 오버라이드)
//    design-system/styles.css 위에 덮어쓰므로 반드시 뒤에 import
import '../src/app/globals.css'

// JAM! 서비스는 항상 다크 테마.
// MODULAR colors.light.css(20260820_003로 colors.css에서 분리)에
// @media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --color-bg: white } }
// 규칙이 있어서, data-theme 미설정 + 시스템 라이트 모드 시 토큰이 반전됨.
// data-theme="dark"를 미리 설정해 이 미디어 쿼리를 무력화한다.
// 서비스(globals.css)는 colors.light.css를 아예 import하지 않으므로 이 무력화가 필요 없지만,
// 스토리북은 design-system/styles.css를 통해 colors.light.css를 계속 로드한다.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', 'dark');
}

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

    // JAM! 기본 배경은 검정 (#000000 = --color-bg)
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#000000' },
        { name: 'inverse', value: '#ffffff' },
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

import type { StorybookConfig } from '@storybook/nextjs-vite';
import { fileURLToPath } from 'url';
import path from 'path';

// ESM 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: StorybookConfig = {
  stories: [
    // 서비스 stories (기존)
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    // MODULAR design-system stories (파일 생성 후 자동 인식)
    '../design-system/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../design-system/**/*.mdx',
  ],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
  ],
  framework: '@storybook/nextjs-vite',
  staticDirs: [
    '../public',
    // MODULAR 로고·이미지 자산 → /ds-assets/* 경로로 접근
    { from: '../design-system/assets', to: '/ds-assets' },
  ],
  viteFinal: async (viteConfig) => {
    const { mergeConfig } = await import('vite');
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          // @ds/components/buttons/Button 형태로 import 가능
          '@ds': path.resolve(__dirname, '../design-system'),
        },
      },
    });
  },
};

export default config;
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';

function useTokenValue(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function WeightRow({ weight, label }: { weight: number; label: string }) {
  const fontFamily = useTokenValue('--font-family-base');
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ width: 40, flexShrink: 0, fontSize: 11, color: 'var(--color-text-secondary)', textAlign: 'right' }}>{weight}</div>
      <div style={{ fontSize: 24, fontWeight: weight, color: 'var(--color-text)', lineHeight: 1.3 }}>
        가나다라마바사아 ABCDEFabcdef 0123456789
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{label}</span>
    </div>
  );
}

function FontsPage() {
  const fontFamily = useTokenValue('--font-family-base');

  return (
    <div style={{ padding: 32, background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text)', fontFamily: 'var(--font-family-base)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, marginBottom: 8 }}>Fonts</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginBottom: 40 }}>
        폰트 스택과 굵기 팔레트.
      </p>

      {/* --font-family-base 정보 */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          Font Stack
        </h2>
        <div style={{ padding: 20, background: 'var(--color-surface)', borderRadius: 'var(--radius-card)', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>현재 적용 값</div>
          <code style={{ fontSize: 13, color: 'var(--color-primary)', wordBreak: 'break-all' }}>
            --font-family-base: {fontFamily || '—'}
          </code>
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--color-text)' }}>MODULAR 원본</strong>: <code>Noto Sans KR</code> (typography.css에서 정의)<br />
          <strong style={{ color: 'var(--color-text)' }}>서비스 override</strong>: <code>globals.css</code>에서 <code>Pretendard Variable</code>로 재정의<br />
          폰트 로드: globals.css의 CDN import (<code>orioncactus/pretendard@v1.3.9</code>)
        </div>
      </div>

      {/* 굵기 팔레트 */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          Weight Palette
        </h2>
        <WeightRow weight={300} label="Light — Display" />
        <WeightRow weight={400} label="Regular — Body, Small, Caption" />
        <WeightRow weight={500} label="Medium — H3, H4" />
        <WeightRow weight={600} label="SemiBold — H1, H2" />
        <WeightRow weight={700} label="Bold — 강조" />
        <WeightRow weight={900} label="Black — Bold Display, Bold LG" />
      </div>

      {/* 한국어 문자 테스트 */}
      <div style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          한국어 렌더링 테스트
        </h2>
        <div style={{ padding: 20, background: 'var(--color-surface)', borderRadius: 'var(--radius-card)', lineHeight: 1.6 }}>
          <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 12 }}>
            가나다라마바사아자차카타파하
          </div>
          <div style={{ fontSize: 16, fontWeight: 400, marginBottom: 8 }}>
            오늘 달성한 미션이 있어요. 배지를 획득했습니다.
          </div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            한글 한자 漢字 ひらがな カタカナ ABC 123 !@#
          </div>
        </div>
      </div>

      {/* 사용 가이드 */}
      <div>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 16 }}>
          사용 가이드
        </h2>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <p>• 폰트 패밀리는 항상 <code style={{ color: 'var(--color-primary)' }}>var(--font-family-base)</code>를 통해 참조한다.</p>
          <p>• 굵기는 <code style={{ color: 'var(--color-primary)' }}>var(--weight-*)</code> 토큰을 사용한다 (숫자 직접 입력 금지).</p>
          <p>• MODULAR 컴포넌트 내에서 <code style={{ color: 'var(--color-primary)' }}>font-family</code> 명시 불필요 — body에서 상속됨.</p>
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: 'MODULAR/Foundations/Fonts',
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    docs: { canvas: { sourceState: 'none' } },
  },
};

export default meta;

export const FontStack: StoryObj = {
  name: '폰트 스택 & 굵기',
  render: () => <FontsPage />,
};

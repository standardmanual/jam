import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { DualAxisGauge } from './DualAxisGauge';

const meta: Meta<typeof DualAxisGauge> = {
  title: 'MODULAR/Patterns/DualAxisGauge',
  component: DualAxisGauge,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '2축형(dual) 배지 전용 진행 게이지 — 티켓 20260904_1058(2d). `BadgeStageRail` 4등급 ' +
          '레일은 그대로 두고, 프런티어가 2축형일 때만 그 아래에 추가로 렌더한다(레일을 ' +
          '대체하지 않음). 배지 썸네일 + 축 2줄(라벨·ProgressBar·current/target·충족 체크) + ' +
          '규칙 문장("각각 다른 활동"/"한 번의 활동에서 동시에") + 병목 안내(met인 축이 정확히 ' +
          '하나일 때만)로 구성된 얇은 합성이다. kind를 모른다 — `src/lib/badgeProgressText.ts`의 ' +
          '`formatDualAxisGaugeProps()`가 만든 완성 문자열/숫자만 받는다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof DualAxisGauge>;

const CYCLE_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M200-120q-83 0-141.5-58.5T0-320q0-83 58.5-141.5T200-520q29 0 55 7t49 21l-52 87q-11-5-25-10t-27-5q-50 0-85 35t-35 85q0 50 35 85t85 35q50 0 85-35t35-85h100q0 92-64 156t-156 64Zm268-40-84-140H244l120-200h-64l-40-80h176l84 140h132l-72 120h100l60 100H468Z"/></svg>'
  );

const TRAIL_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

// ── sameActivity:false — "각각 다른 활동" (산악 라이더: 속도 × 고도, 이력 전반 독립 평가) ──

export const IndependentAxes: Story = {
  name: 'sameActivity:false — 각각 다른 활동 (산악 라이더, 속도는 이미 충족)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={CYCLE_ICON}
        alt="산악 라이더 Rare"
        rarity="rare"
        axes={[
          { key: 'min_speed_kmh', label: '속도', rangeText: '21.4/20.0km/h', fraction: 1, met: true },
          { key: 'elevation_gain_m', label: '고도', rangeText: '1180/1500m', fraction: 1180 / 1500, met: false },
        ]}
        ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
        bottleneckNote="속도 조건은 이미 채웠어요."
      />
    </Frame>
  ),
};

// ── sameActivity:true — "한 번의 활동에서 동시에" (야생의 첫발: 거리 × 고도) ──

export const SameActivity: Story = {
  name: 'sameActivity:true — 한 번의 활동에서 동시에 (야생의 첫발, 두 축 모두 미충족)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={TRAIL_ICON}
        alt="야생의 첫발 Rare"
        rarity="rare"
        axes={[
          { key: 'distance_km', label: '거리', rangeText: '12.4/15.0km', fraction: 12.4 / 15, met: false },
          { key: 'elevation_gain_m', label: '고도', rangeText: '260/300m', fraction: 260 / 300, met: false },
        ]}
        ruleText="한 번의 활동에서 두 조건을 동시에 채워야 해요."
        bottleneckNote={null}
      />
    </Frame>
  ),
};

// ── 한파(lower-is-better) 축 포함 — 혹한 장정: 최저기온 × 지속시간 ──

export const ColdAxisMet: Story = {
  name: '한파 축 포함 (혹한 장정, 기온은 이미 충족 — lower-is-better 진행 바 확인)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={null}
        alt="혹한 장정 Rare"
        rarity="rare"
        axes={[
          { key: 'temperature_max_c', label: '기온', rangeText: '3/5°C', fraction: 1, met: true },
          { key: 'duration_minutes', label: '지속 시간', rangeText: '95/120분', fraction: 95 / 120, met: false },
        ]}
        ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
        bottleneckNote="기온 조건은 이미 채웠어요."
      />
    </Frame>
  ),
};

// ── 두 축 모두 충족 — 게이트만 대기(병목 안내 없음) ──

export const BothAxesMet: Story = {
  name: '두 축 모두 충족 — 게이트만 대기 (병목 안내 없음)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={CYCLE_ICON}
        alt="산악 라이더 Epic"
        rarity="epic"
        axes={[
          { key: 'min_speed_kmh', label: '속도', rangeText: '26.0/25.0km/h', fraction: 1, met: true },
          { key: 'elevation_gain_m', label: '고도', rangeText: '4200/4000m', fraction: 1, met: true },
        ]}
        ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
        bottleneckNote={null}
      />
    </Frame>
  ),
};

// ── 페이스 축 포함 — 스피드 엔듀러: 페이스 × 지속시간 (formatAxisRange의 mm:ss 이중 슬래시 표기 확인) ──

export const PaceAxis: Story = {
  name: '페이스 축 포함 (스피드 엔듀러, "5:30/km / 5:00/km" 이중 슬래시 표기 확인)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={null}
        alt="스피드 엔듀러 Rare"
        rarity="rare"
        axes={[
          { key: 'max_pace_sec_per_km', label: '페이스', rangeText: '5:30/km / 5:00/km', fraction: 0.7, met: false },
          { key: 'duration_minutes', label: '지속 시간', rangeText: '58/60분', fraction: 58 / 60, met: false },
        ]}
        ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
        bottleneckNote={null}
      />
    </Frame>
  ),
};

export const NoImage: Story = {
  name: '이미지 없음 (플레이스홀더)',
  render: () => (
    <Frame>
      <DualAxisGauge
        imageUrl={null}
        alt="새 계열 Common"
        rarity="common"
        axes={[
          { key: 'a', label: '축A', rangeText: '0/10', fraction: 0, met: false },
          { key: 'b', label: '축B', rangeText: '0/10', fraction: 0, met: false },
        ]}
        ruleText="두 조건은 각각 다른 활동에서 채워도 돼요."
        bottleneckNote={null}
      />
    </Frame>
  ),
};

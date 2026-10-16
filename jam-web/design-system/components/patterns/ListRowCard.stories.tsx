import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { ListRowCard } from './ListRowCard';

// JAM 2.0 라이트(티켓 20261015_2133): 면 --surface + 1px --border. 카드 안 행은 tone="tint"
const meta: Meta<typeof ListRowCard> = {
  title: 'MODULAR/Patterns/ListRowCard',
  component: ListRowCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ListRowCard>;

const MedalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={24} height={24} aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 3" />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={16} height={16} aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const IconSlot = ({ color = 'var(--rarity-common)' }: { color?: string }) => (
  <div style={{
    width: 40,
    height: 40,
    borderRadius: 'var(--radius-lg)',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--snow)',
    flexShrink: 0,
  }}>
    <MedalIcon />
  </div>
);

export const Default: Story = {
  name: '기본 (아이콘 + 제목)',
  args: {
    icon: <IconSlot />,
    title: '5km 러닝 배지',
    subtitle: '오늘 오전 7:30',
    trailing: <ChevronIcon />,
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const Static: Story = {
  name: '정적 (클릭 없음)',
  args: {
    icon: <IconSlot color="var(--rarity-rare)" />,
    title: '한강 러너',
    subtitle: '2026-08-15 획득',
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const WithSubtitleNode: Story = {
  name: '부제 ReactNode',
  args: {
    icon: <IconSlot color="var(--rarity-epic)" />,
    title: '한강 마스터',
    subtitle: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', color: 'var(--rarity-epic)' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rarity-epic)', display: 'inline-block' }} />
        Epic
      </span>
    ),
    trailing: <ChevronIcon />,
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const NoIcon: Story = {
  name: '아이콘 없음',
  args: {
    title: '아이콘 없는 항목',
    subtitle: '부제 텍스트',
    trailing: <ChevronIcon />,
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const UserRow: Story = {
  name: '유저 목록 패턴',
  render: () => (
    <div style={{ width: 320 }}>
      <ListRowCard
        icon={
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            👟
          </div>
        }
        title="러너_유저"
        subtitle="배지 23개"
        trailing={
          <button style={{ padding: '4px 12px', fontSize: 'var(--text-sm)', background: 'var(--accent)', color: 'var(--accent-foreground)', border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer' }}>
            팔로우
          </button>
        }
        onClick={() => {}}
      />
    </div>
  ),
};

export const MissionRow: Story = {
  name: '미션 목록 패턴',
  render: () => (
    <div style={{ width: 320 }}>
      <ListRowCard
        icon={<IconSlot color="var(--link)" />}
        title="10km 달리기"
        subtitle="5km 완료 · 50% 달성"
        trailing={<ChevronIcon />}
        href="#"
      />
    </div>
  ),
};

/**
 * 카드 안 행 — 이중 테두리를 막으려고 tone="tint"(--background-secondary, 테두리 없음)를 쓴다.
 * 바깥 카드는 기본 면(--surface + 1px --border)이다.
 */
export const TintInCard: Story = {
  name: '카드 안 행 (tone="tint")',
  render: () => (
    <div style={{ width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2xl)', padding: 'var(--spacing-16)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      <ListRowCard tone="tint" icon={<IconSlot color="var(--rarity-rare)" />} title="한강 러너" subtitle="1위 · 42.1km" />
      <ListRowCard tone="tint" icon={<IconSlot color="var(--rarity-epic)" />} title="자전거_도시" subtitle="2위 · 38.4km" />
    </div>
  ),
};

export const CustomContent: Story = {
  name: 'children 커스텀 영역',
  args: {
    icon: <IconSlot color="var(--rarity-mystic)" />,
    trailing: <ChevronIcon />,
    children: (
      <div>
        <p style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--foreground)', fontWeight: 600 }}>Mystic 배지 발견!</p>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--text-sm)', color: 'var(--rarity-mystic)' }}>Mystic 등급 · 드랍 위치: 광화문</p>
      </div>
    ),
  },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
};

export const List: Story = {
  name: '리스트 (5개)',
  render: () => {
    const [following, setFollowing] = useState<Set<number>>(new Set());
    const toggle = (id: number) => setFollowing(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    const users = [
      { id: 1, name: '러너_한강', badges: 42, color: 'var(--rarity-mystic)' },
      { id: 2, name: '자전거_도시', badges: 28, color: 'var(--rarity-epic)' },
      { id: 3, name: '수영장_마스터', badges: 15, color: 'var(--rarity-rare)' },
      { id: 4, name: '하이커_산', badges: 9, color: 'var(--rarity-common)' },
      { id: 5, name: '트레일_러너', badges: 7, color: 'var(--link)' },
    ];
    return (
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
        {users.map(u => (
          <ListRowCard
            key={u.id}
            icon={
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--snow)', fontSize: 18, flexShrink: 0 }}>
                🏃
              </div>
            }
            title={u.name}
            subtitle={`배지 ${u.badges}개`}
            trailing={
              <button
                onClick={(e) => { e.stopPropagation(); toggle(u.id); }}
                style={{ padding: '4px 12px', fontSize: 'var(--text-sm)', background: following.has(u.id) ? 'transparent' : 'var(--accent)', color: following.has(u.id) ? 'var(--muted)' : 'var(--accent-foreground)', border: `1px solid ${following.has(u.id) ? 'var(--border)' : 'var(--link)'}`, borderRadius: 'var(--radius-full)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {following.has(u.id) ? '팔로잉' : '팔로우'}
              </button>
            }
          />
        ))}
      </div>
    );
  },
};

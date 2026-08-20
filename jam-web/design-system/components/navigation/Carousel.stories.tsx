import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { Carousel } from './Carousel';
import { Card } from '../cards/Card';
import { RarityBadge } from '../cards/RarityBadge';

const meta: Meta<typeof Carousel> = {
  title: 'MODULAR/Navigation/Carousel',
  component: Carousel,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Carousel>;

const DEMO_ITEMS = [
  { id: 'a', name: '스타벅스 강남점', badges: 1 },
  { id: 'b', name: '올리브영 역삼점', badges: 0 },
  { id: 'c', name: '한강공원 반포지구', badges: 3 },
  { id: 'd', name: 'GS25 서초점', badges: 0 },
  { id: 'e', name: '교보문고 강남점', badges: 5 },
];

function DemoCard({ name, badges, isActive }: { name: string; badges: number; isActive: boolean }) {
  return (
    <Card
      tone="default"
      style={{
        width: 280,
        margin: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: isActive ? 1 : 0.5,
        transform: isActive ? 'scale(1)' : 'scale(0.92)',
        transition: 'transform var(--duration-medium) var(--ease-smooth-out), opacity var(--duration-medium) var(--ease-smooth-out)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-text)' }}>{name}</p>
      {badges > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: badges }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-card)', background: 'var(--color-bg-tint)' }} />
              <RarityBadge rarity={i % 2 === 0 ? 'rare' : 'common'} />
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>드랍된 아이템이 없어요</p>
      )}
    </Card>
  );
}

export const CenterFocusInfiniteLoop: Story = {
  name: '센터 포커스 · 무한 루프',
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0);
    return (
      <div style={{ background: 'var(--color-bg)', padding: '48px 0', minHeight: 420 }}>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          선택: {DEMO_ITEMS[activeIndex].name} ({activeIndex + 1}/{DEMO_ITEMS.length})
        </p>
        <Carousel
          items={DEMO_ITEMS}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          getItemKey={(item) => item.id}
          ariaLabel="POI 캐러셀 데모"
          renderItem={(item, { isActive }) => (
            <DemoCard name={item.name} badges={item.badges} isActive={isActive} />
          )}
        />
      </div>
    );
  },
};

export const SingleItem: Story = {
  name: '단일 항목(루프 없음)',
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const items = [DEMO_ITEMS[0]];
    return (
      <div style={{ background: 'var(--color-bg)', padding: '48px 0', minHeight: 320 }}>
        <Carousel
          items={items}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          getItemKey={(item) => item.id}
          renderItem={(item, { isActive }) => (
            <DemoCard name={item.name} badges={item.badges} isActive={isActive} />
          )}
        />
      </div>
    );
  },
};

export const ProgressiveWindowing: Story = {
  name: '3개 단위 윈도잉',
  render: () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [visibleCount, setVisibleCount] = useState(3);
    const visibleItems = DEMO_ITEMS.slice(0, visibleCount);

    const handleIndexChange = (idx: number) => {
      setActiveIndex(idx);
      if (idx >= visibleCount - 1 && visibleCount < DEMO_ITEMS.length) {
        setVisibleCount((v) => Math.min(v + 3, DEMO_ITEMS.length));
      }
    };

    return (
      <div style={{ background: 'var(--color-bg)', padding: '48px 0', minHeight: 420 }}>
        <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
          공개된 카드 {visibleCount} / {DEMO_ITEMS.length}
        </p>
        <Carousel
          items={visibleItems}
          activeIndex={activeIndex}
          onActiveIndexChange={handleIndexChange}
          getItemKey={(item) => item.id}
          renderItem={(item, { isActive }) => (
            <DemoCard name={item.name} badges={item.badges} isActive={isActive} />
          )}
        />
      </div>
    );
  },
};

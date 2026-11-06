import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useState } from 'react';
import { ListRow, ListRowChip, ListRowEm, ListRowSkeleton } from './ListRow';
import { PointText } from './PointText';
import { RarityBadge } from '../cards/RarityBadge';
import { BadgeLevelChip } from '../cards/BadgeLevelChip';
import { BookIcon, CheckIcon, CoinIcon, MedalIcon, PackageIcon, TargetIcon, UserIcon } from '../icons/IconCatalog';

// 티켓 20261106_1759 2-2회차: 한 골격(ListRow)에서 A~E 계열·media 변형·상태·로딩을 만든다.
// 비교(lead 40/48, 전/후)·최악 사례·320/360 프레임·글자 확대는 2-3회차에서 같은 파일에 더한다.
const meta: Meta<typeof ListRow> = {
  title: 'MODULAR/Patterns/ListRow',
  component: ListRow,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ListRow>;

const textBreak = { wordBreak: 'keep-all', overflowWrap: 'break-word' } as const;

/** 크림 바탕 위 360px 세로 목록 */
const Stack = ({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) => (
  <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap }}>{children}</div>
);
const withStack = (Story: React.ComponentType) => (
  <Stack><Story /></Stack>
);

/** 상태 스토리의 섹션 이름표 */
const Caption = ({ children }: { children: React.ReactNode }) => (
  <p style={{ ...textBreak, margin: '8px 0 0', fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', color: 'var(--muted)' }}>{children}</p>
);

/** 카드 안(tint 전용 자리) */
const InCard = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2xl)', padding: 'var(--spacing-8)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>{children}</div>
);

/** 작은 팔로우 버튼: 높이 32 · 글자 12 · 좌우 여백 12. 터치 영역은 trail 규칙이 44px로 넓힌다. */
const FollowButton = ({ label = '팔로우' }: { label?: string }) => (
  <button
    type="button"
    style={{
      height: 32, padding: '0 12px', border: '1px solid var(--field-border)', borderRadius: 'var(--radius-full)',
      background: 'transparent', color: 'var(--foreground)', whiteSpace: 'nowrap', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 'var(--text-xs)', lineHeight: 1,
    }}
  >
    {label}
  </button>
);

const noop = () => {};

// ── 계열 A: 활동 ───────────────────────────────────────────────

export const A1Activity: Story = {
  name: 'A1 활동 — 배지 획득',
  decorators: [withStack],
  render: () => (
    <ListRow
      lead={<MedalIcon />}
      eyebrow="배지 획득"
      time="3분 전"
      title={<><ListRowEm>한강 러너</ListRowEm> 배지를 받았어요</>}
      titleVariant="sentence"
      meta="5km 러닝을 마쳤어요"
      chips={<RarityBadge rarity="rare" size="md" />}
      value={<PointText value="+50" />}
      onClick={noop}
    />
  ),
};

export const A2ActivityGroup: Story = {
  name: 'A2 활동 묶음 — 펼침(쉐브론 없음, aria-expanded)',
  decorators: [withStack],
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <ListRow
          lead={<MedalIcon />}
          leadBadge="×3"
          eyebrow="오늘의 활동"
          time="방금"
          title={<><ListRowEm>배지 3개</ListRowEm>를 받았어요</>}
          titleVariant="sentence"
          aria-expanded={open}
          aria-controls="list-row-a2-panel"
          onClick={() => setOpen((v) => !v)}
        />
        {open && (
          <div id="list-row-a2-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ListRow tone="tint" lead={<MedalIcon />} title="한강 러너" meta="5km 러닝" value={<PointText value="+50" />} />
            <ListRow tone="tint" lead={<MedalIcon />} title="아침 러너" meta="오전 7시 이전 러닝" value={<PointText value="+30" />} />
          </div>
        )}
      </>
    );
  },
};

// ── 계열 B: 대상 ───────────────────────────────────────────────

export const B1Target: Story = {
  name: 'B1 대상 — 배지',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow lead={<MedalIcon />} title="한강 러너" chips={<RarityBadge rarity="epic" size="md" />} meta="5km 러닝 3회" value="3/5" href="#badge" />
      <ListRow lead={<MedalIcon />} title="누적 거리왕" chips={<BadgeLevelChip level={12} size="md" />} meta="누적 120km" value="Lv.12" href="#badge" />
    </>
  ),
};

export const B2MissionList: Story = {
  name: 'B2 미션 목록 — media + flat, 상태 칩',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow
        variant="media"
        tone="flat"
        separator
        lead={<TargetIcon />}
        eyebrow={<ListRowChip tone="accent">진행 중</ListRowChip>}
        time="D-5"
        title="10km 러닝 챌린지"
        meta="이번 주 안에 10km를 달려요"
        metaLines={2}
        footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)' }}><RarityBadge rarity="rare" size="md" /> 한강 러너</span>}
        href="#mission"
        chevron
      />
      <ListRow
        variant="media"
        tone="flat"
        lead={<TargetIcon />}
        eyebrow={<ListRowChip>완료</ListRowChip>}
        title="첫 러닝 인증"
        meta="처음으로 러닝을 기록했어요"
        footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)' }}><RarityBadge rarity="common" size="md" /> 새싹 러너</span>}
        href="#mission"
        chevron
      />
    </>
  ),
};

export const MediaVariant: Story = {
  name: 'media 변형 — 칩 줄 오른쪽 끝 남은 시간 + footer',
  decorators: [withStack],
  render: () => (
    <ListRow
      variant="media"
      lead={<PackageIcon />}
      leadBadge="12"
      eyebrow={<><ListRowChip tone="warning">곧 끝나요</ListRowChip><ListRowChip>마지막 파편</ListRowChip></>}
      time="2시간 남음"
      title="여름 컬렉션"
      meta="파편을 모아 아이템 배지를 만들어요"
      metaLines={3}
      footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)' }}><RarityBadge rarity="mystic" size="md" /> 한여름 밤</span>}
      href="#collection"
    />
  ),
};

// ── 계열 C: 사람 ───────────────────────────────────────────────

export const C1Person: Story = {
  name: 'C1 사람 — round lead + trail 팔로우',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow lead={<UserIcon />} leadShape="round" title="runner_kim" meta="서울 · 러닝" href="#u/kim" trail={<FollowButton />} />
      <ListRow lead={<UserIcon />} leadShape="round" title="아주아주아주아주긴닉네임을가진러너입니다" href="#u/long" trail={<FollowButton label="팔로잉" />} />
    </>
  ),
};

export const C4Ranking: Story = {
  name: 'C4 순위 — indicator 숫자 + «나» 칩',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow tone="flat" separator indicator="1" lead={<UserIcon />} leadShape="round" title="runner_kim" value="42.3km" />
      <ListRow tone="flat" separator indicator="2" lead={<UserIcon />} leadShape="round" title="jam_lee" value="39.8km" />
      <ListRow tone="flat" indicator="3" lead={<UserIcon />} leadShape="round" title="나" chips={<ListRowChip tone="accent">나</ListRowChip>} value="31.0km" />
    </>
  ),
};

// ── 계열 D·E ───────────────────────────────────────────────────

export const DValue: Story = {
  name: 'D 값 — label + value, flat',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow tone="flat" separator titleVariant="label" title="이번 달 달린 거리" value="42.3km" />
      <ListRow tone="flat" separator titleVariant="label" title="가진 포인트" value={<PointText value={1200} unit="" />} />
      <ListRow tone="flat" titleVariant="label" title="획득 조건" value="5km 러닝을 3회 이상 마치면 받을 수 있어요" />
    </>
  ),
};

export const ECheckList: Story = {
  name: 'E 체크 목록 — indicator 체크 + label',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow tone="flat" indicator={<CheckIcon />} titleVariant="label" title="계정 연결" meta="Strava를 연결했어요" />
      <ListRow tone="flat" indicator={<CheckIcon />} title="첫 러닝 기록" meta="지금 단계예요" />
      <ListRow tone="flat" indicator={<span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', boxSizing: 'border-box' }} />} titleVariant="label" title="배지 받기" />
    </>
  ),
};

// ── 상태 ──────────────────────────────────────────────────────

export const Tones: Story = {
  name: '상태 — 면(default · tint · inverse · flat)',
  decorators: [withStack],
  render: () => (
    <>
      <Caption>default — 크림 바탕 위 단독 행</Caption>
      <ListRow lead={<BookIcon />} title="아이템북" meta="모은 아이템 배지" chevron href="#" />
      <Caption>tint — 카드 안 행 전용</Caption>
      <InCard>
        <ListRow tone="tint" lead={<BookIcon />} title="아이템북" meta="모은 아이템 배지" chevron href="#" />
        <ListRow tone="tint" lead={<CoinIcon />} leadShape="round" title="포인트" value={<PointText value="+120" />} />
      </InCard>
      <Caption>inverse — 경고 안내 행 전용</Caption>
      <ListRow tone="inverse" lead={<TargetIcon />} leadBadge="2" title="곧 끝나는 미션" meta="내일까지 완료해야 해요" chevron href="#" />
      <Caption>flat — 면 없음, 구분선은 선택</Caption>
      <ListRow tone="flat" separator titleVariant="label" title="구분선 있음" value="값" />
      <ListRow tone="flat" titleVariant="label" title="구분선 없음" value="값" />
    </>
  ),
};

export const Selected: Story = {
  name: '상태 — 선택됨(링 + 체크, 라디오)',
  decorators: [withStack],
  render: () => {
    const [picked, setPicked] = useState('a');
    return (
      <div role="radiogroup" aria-label="배지 선택" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[['a', '한강 러너'], ['b', '아침 러너'], ['c', '야간 러너']].map(([id, name]) => (
          <ListRow
            key={id}
            role="radio"
            aria-checked={picked === id}
            selected={picked === id}
            lead={<MedalIcon />}
            title={name}
            meta="5km 러닝"
            onClick={() => setPicked(id)}
          />
        ))}
      </div>
    );
  },
};

export const Disabled: Story = {
  name: '상태 — 비활성',
  decorators: [withStack],
  render: () => <ListRow disabled lead={<MedalIcon />} title="아직 열리지 않았어요" meta="조건을 채우면 열려요" chevron onClick={noop} />,
};

export const Pressed: Story = {
  name: '상태 — 눌림(--scale-press-card 고정 미리보기)',
  decorators: [withStack],
  render: () => (
    <>
      <Caption>실제로는 누르는 동안만 줄어든다. 아래는 같은 배율로 고정한 모습이다.</Caption>
      <ListRow lead={<MedalIcon />} title="눌린 행" meta="scale 0.98" chevron onClick={noop} style={{ transform: 'scale(var(--scale-press-card))' }} />
      <ListRow lead={<MedalIcon />} title="눌러 보세요" meta="누르는 동안 한 가지 눌림" chevron onClick={noop} />
    </>
  ),
};

export const Focused: Story = {
  name: '상태 — 포커스(바깥 2px --link)',
  decorators: [withStack],
  render: () => <ListRow lead={<MedalIcon />} title="키보드로 닿은 행" meta="Tab으로 이동하면 아웃라인이 보여요" chevron onClick={noop} />,
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLElement>('.ds-list-row-hit')?.focus();
  },
};

export const Expanded: Story = {
  name: '상태 — expanded(쉐브론 180도)',
  decorators: [withStack],
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <ListRow
        lead={<BookIcon />}
        title="자주 묻는 질문"
        meta={open ? '펼쳐져 있어요' : '접혀 있어요'}
        chevron
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      />
    );
  },
};

export const Loading: Story = {
  name: '로딩 — ListRowSkeleton',
  decorators: [withStack],
  render: () => (
    <>
      <ListRowSkeleton />
      <ListRowSkeleton />
    </>
  ),
};

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect, useRef, useState } from 'react';
import { ListRow, ListRowChip, ListRowEm, ListRowSkeleton } from './ListRow';
import { PointText } from './PointText';
import { RarityBadge } from '../cards/RarityBadge';
import { BadgeLevelChip } from '../cards/BadgeLevelChip';
import { ActivityIcon, BookIcon, CheckIcon, CoinIcon, LockIcon, MedalIcon, PackageIcon, TargetIcon, UserIcon } from '../icons/IconCatalog';

// 티켓 20261106_1759 2-2회차: 한 골격(ListRow)에서 A~E 계열·media 변형·상태·로딩을 만든다.
// 2-3회차: lead 40/48 비교, 전/후 비교 2건, 최악 사례(320·360·글자 확대), flat 선택됨을 같은 파일에 더했다.
const meta: Meta<typeof ListRow> = {
  title: 'MODULAR/Patterns/ListRow',
  component: ListRow,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof ListRow>;

const textBreak = { wordBreak: 'keep-all', overflowWrap: 'break-word' } as const;

/**
 * 크림 바탕 위 세로 목록 틀. 폭은 width 100% + maxWidth라 375px 화면에서도 오른쪽이 잘리지 않는다.
 * centered 레이아웃의 루트는 내용 폭에 맞춰 줄어들어 100%만으로는 틀이 좁아질 수 있어, minWidth로 최소 폭
 * (화면 폭 - 좌우 여백 2rem)을 함께 잡는다.
 */
const Frame = ({ children, width = 360, gap = 8 }: { children: React.ReactNode; width?: number; gap?: number }) => (
  <div style={{ width: '100%', maxWidth: width, minWidth: `min(${width}px, 100vw - 2rem)`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap }}>{children}</div>
);
const withStack = (Story: React.ComponentType) => (
  <Frame><Story /></Frame>
);

/** 상태 스토리의 섹션 이름표 */
const Caption = ({ children }: { children: React.ReactNode }) => (
  <p style={{ ...textBreak, margin: 'var(--spacing-8) 0 0', fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', color: 'var(--muted)' }}>{children}</p>
);

/** 카드 안(tint 전용 자리) */
const InCard = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: 'var(--card-bg)', borderRadius: 'var(--radius-2xl)', padding: 'var(--spacing-8)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>{children}</div>
);

/** 작은 팔로우 버튼: 높이 32 · 글자 12 · 좌우 여백 12. 터치 영역은 trail 규칙이 44px로 넓힌다. */
const FollowButton = ({ label = '팔로우' }: { label?: string }) => (
  <button
    type="button"
    style={{
      height: 32, padding: '0 var(--spacing-12)', border: '1px solid var(--field-border)', borderRadius: 'var(--radius-full)',
      background: 'transparent', color: 'var(--foreground)', whiteSpace: 'nowrap', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: 'var(--text-xs)', lineHeight: 1,
    }}
  >
    {label}
  </button>
);

/** 순위 숫자: 눈에는 숫자, 스크린리더에는 «N위»로 읽힌다. */
const Rank = ({ n }: { n: number }) => (
  <>
    <span aria-hidden="true">{n}</span>
    <span className="sr-only">{n}위</span>
  </>
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
          // tint는 카드 안 전용이라 펼침 패널을 흰 카드(면, 외곽선 없음)로 감싼다.
          <div id="list-row-a2-panel">
            <InCard>
              <ListRow tone="tint" lead={<MedalIcon />} title="한강 러너" meta="5km 러닝" value={<PointText value="+50" />} />
              <ListRow tone="tint" lead={<MedalIcon />} title="아침 러너" meta="오전 7시 이전 러닝" value={<PointText value="+30" />} />
            </InCard>
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
        footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-4)', fontSize: 'var(--text-sm)' }}><RarityBadge rarity="rare" size="md" /> 한강 러너</span>}
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
        footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-4)', fontSize: 'var(--text-sm)' }}><RarityBadge rarity="common" size="md" /> 새싹 러너</span>}
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
      footer={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-4)', fontSize: 'var(--text-sm)' }}><RarityBadge rarity="mystic" size="md" /> 한여름 밤</span>}
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

export const C2NotificationAvatar: Story = {
  name: 'C2 알림 아바타 — round lead + leadHref + leadLabel(2단 링크)',
  decorators: [withStack],
  render: () => (
    <ListRow
      lead={<UserIcon />}
      leadShape="round"
      leadHref="#u/kim"
      leadLabel="runner_kim 프로필"
      eyebrow="새 팔로워"
      time="방금"
      title={<><ListRowEm>runner_kim</ListRowEm> 님이 팔로우했어요</>}
      titleVariant="sentence"
      href="#notification"
    />
  ),
};

export const C4Ranking: Story = {
  name: 'C4 순위 — indicator 숫자 + 이름 옆 «나» 칩(titleSuffix)',
  decorators: [withStack],
  render: () => (
    <>
      <ListRow tone="flat" separator indicator={<Rank n={1} />} lead={<UserIcon />} leadShape="round" title="runner_kim" value="42.3km" />
      <ListRow tone="flat" separator indicator={<Rank n={2} />} lead={<UserIcon />} leadShape="round" title="jam_lee" value="39.8km" />
      <ListRow tone="flat" indicator={<Rank n={3} />} lead={<UserIcon />} leadShape="round" title="han_river" titleSuffix={<ListRowChip tone="accent">나</ListRowChip>} value="31.0km" />
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

export const DLongValue: Story = {
  name: 'D 값 — 긴 값 + 짧은 라벨(라벨은 한 줄 고정)',
  decorators: [(Story: React.ComponentType) => <Frame width={320}><Story /></Frame>],
  render: () => (
    <>
      <Caption>값 행은 titleLines={0}을 쓰면 본문 칸이 라벨 내용 폭으로 고정되고 행 폭의 50%까지만 늘어난다. 긴 값은 값 칸에서만 줄바꿈된다.</Caption>
      <ListRow tone="flat" separator titleVariant="label" titleLines={0} title="트리거 활동" value="2026 JTBC 서울 마라톤 Full" />
      <Caption>값이 짧아도 값은 행 오른쪽 끝에 붙는다. 본문 칸이 내용 폭이라 남는 폭을 채우지 않으므로 값 칸이 오른쪽으로 민다.</Caption>
      <ListRow tone="flat" separator titleVariant="label" titleLines={0} title="활동 거리" value="42.44 km" />
      <Caption>라벨이 행 폭의 50%를 넘으면 그때만 라벨이 줄바꿈되고, 겹치지 않는다.</Caption>
      <ListRow tone="flat" titleVariant="label" titleLines={0} title="이번 달 달린 총 거리와 누적 러닝 횟수" value="2026 JTBC 서울 마라톤 Full" />
    </>
  ),
};

export const DValueNoWrap: Story = {
  name: 'D 값 — 일시 값 한 줄 고정(valueNoWrap)',
  decorators: [(Story: React.ComponentType) => <Frame width={320}><Story /></Frame>],
  render: () => (
    <>
      <Caption>valueNoWrap은 값 칸의 60% 상한을 풀고 라벨과 값을 모두 한 줄로 둔다. 340px 이하 폭에서는 글자를 줄이지 않고, 값 안에 줄바꿈이 허용된 지점(아래 예는 날짜와 시간 사이)에서만 두 줄로 꺾는다.</Caption>
      <ListRow tone="flat" separator titleVariant="label" titleLines={0} title="획득 일시" value={<><span style={{ whiteSpace: 'nowrap' }}>2026-11-07</span> <span style={{ whiteSpace: 'nowrap' }}>PM 05:38:33</span></>} valueNoWrap />
      <Caption>valueNoWrap이 없으면 긴 값은 값 칸(최대 60%)에서 줄바꿈된다.</Caption>
      <ListRow tone="flat" titleVariant="label" titleLines={0} title="획득 일시" value="2026-11-07 PM 05:38:33" />
    </>
  ),
};

/** 체크 목록의 «아직 안 함·지금 할 차례» 표지: 빈 원, 선은 --muted. 완료만 체크 아이콘이다. */
const EmptyCircle = () => (
  <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--muted)', boxSizing: 'border-box' }} />
);

export const ECheckList: Story = {
  name: 'E 체크 목록 — 완료만 체크, 현재·아직은 빈 원',
  decorators: [withStack],
  render: () => (
    <>
      <Caption>완료만 체크 아이콘이다. 지금 할 차례는 빈 원 + 굵은 title + meta, 아직 안 한 단계는 빈 원 + label이다.</Caption>
      <ListRow tone="flat" indicator={<span aria-hidden="true"><CheckIcon /></span>} titleVariant="label" title={<><span className="sr-only">완료: </span>계정 연결</>} meta="Strava를 연결했어요" />
      <ListRow tone="flat" indicator={<EmptyCircle />} title={<><span className="sr-only">지금 할 차례: </span>첫 러닝 기록</>} meta="지금 단계예요" />
      <ListRow tone="flat" indicator={<EmptyCircle />} titleVariant="label" title={<><span className="sr-only">아직: </span>배지 받기</>} />
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
  name: '상태 — 선택됨(링 + 체크, 라디오 + 화살표 키 이동)',
  decorators: [withStack],
  render: () => {
    const options = [['a', '한강 러너'], ['b', '아침 러너'], ['c', '야간 러너']];
    const [picked, setPicked] = useState('a');
    const groupRef = useRef<HTMLDivElement>(null);
    // 라디오 그룹 키보드: 선택된 행만 tabIndex 0, 나머지 -1. 화살표 키는 다음·이전 행으로 옮기며 선택한다(끝에서 순환).
    const onKeyDown = (event: React.KeyboardEvent<HTMLElement>, index: number) => {
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + options.length) % options.length;
      setPicked(options[next][0]);
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    };
    return (
      <>
        <Caption>Tab으로 그룹에 들어가 화살표 키(위·아래·왼쪽·오른쪽)로 옮긴다. 선택된 행만 Tab 순서에 있다.</Caption>
        <div ref={groupRef} role="radiogroup" aria-label="배지 선택" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
          {options.map(([id, name], index) => (
            <ListRow
              key={id}
              role="radio"
              aria-checked={picked === id}
              tabIndex={picked === id ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, index)}
              selected={picked === id}
              lead={<MedalIcon />}
              title={name}
              meta="5km 러닝"
              onClick={() => setPicked(id)}
            />
          ))}
        </div>
      </>
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

// ── 회차 2-3: 비교·최악 사례 ───────────────────────────────────

/** 비교 스토리의 나란히 배치. 좁은 화면에서는 세로로 쌓인다. */
const Pair = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 'var(--spacing-24)' }}>{children}</div>
);
const Side = ({ label, children, width = 360 }: { label: string; children: React.ReactNode; width?: number }) => (
  <Frame width={width}>
    <p style={{ ...textBreak, margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--text-sm--line-height)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</p>
    {children}
  </Frame>
);
const widePage = { layout: 'padded' } as const;

/** footer 한 줄: 등급 칩 + 이름. 조건 라벨 텍스트는 두지 않는다(2단계 검토 1번). */
const RewardFooter = ({ rarity, name, more }: { rarity: 'common' | 'rare' | 'epic' | 'mystic'; name: string; more?: string }) => (
  // 좁은 폭에서 «등급 칩 + 이름»과 보상 문구가 각각 한 덩어리로 줄바꿈한다(덩어리 안에서 쪼개지지 않고, 문구는 다음 줄로 내려간다).
  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--spacing-8)', rowGap: 'var(--list-row-line-gap)', fontSize: 'var(--text-sm)', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--spacing-4)', whiteSpace: 'nowrap' }}>
      <RarityBadge rarity={rarity} size="md" /> {name}
    </span>
    {more ? <span style={{ color: 'var(--muted)', minWidth: 0 }}>{more}</span> : null}
  </span>
);

// 1. lead 40px 대 48px

/** 40px 비교는 행 바깥 면 style로 --list-row-lead-size를 덮어써서 만든다. */
const SizeCompareRows = ({ leadSize }: { leadSize?: string }) => {
  const style = leadSize ? ({ '--list-row-lead-size': leadSize } as React.CSSProperties) : undefined;
  return (
    <>
      <ListRow
        style={style}
        lead={<MedalIcon />}
        leadBadge="×3"
        eyebrow="배지 획득"
        time="3분 전"
        title="한강 러너"
        meta="5km 러닝을 마쳤어요"
        chips={<RarityBadge rarity="rare" size="md" />}
        onClick={noop}
      />
      <ListRow style={style} lead={<MedalIcon />} title="한강 러너" chips={<RarityBadge rarity="epic" size="md" />} meta="5km 러닝 3회" value="3/5" href="#badge" />
      <ListRow style={style} lead={<UserIcon />} leadShape="round" title="runner_kim" meta="서울 · 러닝" href="#u/kim" trail={<FollowButton />} />
    </>
  );
};

export const SizeCompare: Story = {
  name: '비교 — 썸네일 40px 대 48px(A1·B1·C1)',
  parameters: widePage,
  render: () => (
    <Pair>
      <Side label="40px (--list-row-lead-size 덮어쓰기)">
        <SizeCompareRows leadSize="40px" />
      </Side>
      <Side label="48px (기본)">
        <SizeCompareRows />
      </Side>
    </Pair>
  ),
};

// 2. 프로필 피드 전/후

type FeedCase = {
  icon: React.ReactNode;
  label: string;
  title: string;
  sub?: string;
  rarity: 'common' | 'rare' | 'epic' | 'mystic';
  level?: number;
  count?: number;
  lastPiece?: boolean;
  time: string;
};

// 사용자가 보낸 프로필 피드 화면(2026-11-06)의 행 6개를 그대로 옮겼다: 파우치 아이템 픽업 1건 + 배지 획득 5건(Lv 칩만 있고 등급 칩은 없다).
const FEED_CASES: FeedCase[] = [
  { icon: <PackageIcon />, label: '아이템 픽업', title: '파우치', sub: '이마트24 디저트랩서울숲점', rarity: 'common', time: '7시간 전' },
  { icon: <MedalIcon />, label: '배지 획득', title: '봉투 속 한 장', rarity: 'common', level: 1, time: '7시간 전' },
  { icon: <MedalIcon />, label: '배지 획득', title: '건너온 물건 칸', rarity: 'common', level: 1, time: '7시간 전' },
  { icon: <MedalIcon />, label: '배지 획득', title: '건너온 물건 칸', rarity: 'common', level: 3, time: '7시간 전' },
  { icon: <MedalIcon />, label: '배지 획득', title: '건너온 물건 칸', rarity: 'common', level: 2, time: '7시간 전' },
  { icon: <MedalIcon />, label: '배지 획득', title: '입양 칸에서 온 물건', rarity: 'common', level: 5, time: '7시간 전' },
];

/** 지금 모양(조사 A1): 40px 타일 + ×N 필, 줄마다 16px, 시간 16px muted, 등급·Lv 칩 8px. 인라인 마크업으로 재현한 비교용이다. */
const LegacyFeedRow = ({ c }: { c: FeedCase }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, boxSizing: 'border-box', width: '100%', background: 'var(--card-bg)', borderRadius: 'var(--radius-2xl)', fontFamily: 'var(--font-family-base)', ...textBreak }}>
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-2xl)', background: 'var(--background-secondary)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icon}</div>
      {c.count != null && (
        <span style={{ position: 'absolute', right: -4, bottom: -4, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-full)', background: 'var(--background-secondary)', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', lineHeight: 1 }}>×{c.count}</span>
      )}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', color: 'var(--muted)' }}>{c.label}</p>
      <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
      {c.sub && <p style={{ margin: 0, fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</p>}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <RarityBadge rarity={c.rarity} />
        {c.level != null && <BadgeLevelChip level={c.level} />}
        {c.lastPiece && <span style={{ fontSize: 'var(--text-xs)', lineHeight: 1, padding: '4px 8px', borderRadius: 'var(--radius-full)', background: 'var(--background)' }}>마지막 파편!</span>}
      </span>
    </div>
    <span style={{ flexShrink: 0, fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', color: 'var(--muted)' }}>{c.time}</span>
  </div>
);

export const BeforeAfterProfileFeed: Story = {
  name: '전/후 — 프로필 피드(지금 모양 대 ListRow)',
  parameters: widePage,
  render: () => (
    <Pair>
      <Side label="지금 (조사 A1)">
        {FEED_CASES.map((c, i) => <LegacyFeedRow key={i} c={c} />)}
      </Side>
      <Side label="ListRow">
        {FEED_CASES.map((c, i) => (
          <ListRow
            key={i}
            lead={c.icon}
            leadBadge={c.count != null ? `×${c.count}` : undefined}
            eyebrow={c.label}
            time={c.time}
            title={c.title}
            meta={c.sub}
            chips={
              <>
                <RarityBadge rarity={c.rarity} size="md" />
                {c.level != null && <BadgeLevelChip level={c.level} size="md" />}
                {c.lastPiece && <ListRowChip>마지막 파편</ListRowChip>}
              </>
            }
            onClick={noop}
          />
        ))}
      </Side>
    </Pair>
  ),
};

// 3. 미션 목록 전/후

type MissionCase = {
  state: 'normal' | 'joined' | 'locked';
  title: string;
  desc: string;
  condition?: string;
  reward: string;
  time: string;
  rarity: 'common' | 'rare' | 'epic' | 'mystic';
  badgeName: string;
  more?: string;
};

const MISSION_CASES: MissionCase[] = [
  { state: 'normal', title: '10km 러닝 챌린지', desc: '이번 주 안에 10km를 달려요', reward: '한강 러너 배지 · 50 포인트', time: 'D-5', rarity: 'rare', badgeName: '한강 러너', more: '+50 포인트' },
  { state: 'joined', title: '주 3회 러닝', desc: '한 주에 세 번 달리면 완료돼요', reward: '꾸준 러너 배지 · 30 포인트', time: 'D-2', rarity: 'common', badgeName: '꾸준 러너', more: '+30 포인트' },
  { state: 'locked', title: '하프 마라톤 도전', desc: '21km를 한 번에 달려요', condition: '10km 러닝 챌린지를 먼저 완료하면 열려요', reward: '한강 러너 배지 · 아이템 배지 2개 · 500 포인트', time: 'D-3', rarity: 'mystic', badgeName: '한강 러너', more: '아이템 배지 2개 · +500 포인트' },
];

const MISSION_STATE_LABEL = { normal: 'NEW', joined: '참가중', locked: '잠김' } as const;

/** 지금 모양(조사 B2): 90px 정사각 썸네일(모서리 12) + 10px 칩 + 제목 16 굵게 + 설명 12 2줄 + 조건 12(잠김만) + 보상 12 굵게 --link. */
const LegacyMissionRow = ({ c }: { c: MissionCase }) => (
  <div style={{ display: 'flex', gap: 12, padding: '12px 0', boxSizing: 'border-box', width: '100%', borderBottom: '1px solid var(--separator)', fontFamily: 'var(--font-family-base)', ...textBreak }}>
    <div style={{ width: 90, height: 90, flexShrink: 0, borderRadius: 12, background: 'var(--background-secondary)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {c.state === 'locked' ? <LockIcon /> : <TargetIcon />}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'inline-block', fontSize: 10, lineHeight: 1, padding: '4px 6px', borderRadius: 'var(--radius-full)', background: 'var(--default-soft)' }}>{MISSION_STATE_LABEL[c.state]}</span>
      <p style={{ margin: '4px 0 0', fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', color: 'var(--muted)', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>{c.desc}</p>
      {c.condition && <p style={{ margin: 0, fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)' }}>조건: {c.condition}</p>}
      <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', lineHeight: 'var(--text-xs--line-height)', fontWeight: 700, color: 'var(--link)' }}>{c.reward}</p>
    </div>
  </div>
);

export const BeforeAfterMissionList: Story = {
  name: '전/후 — 미션 목록(90px 썸네일 대 ListRow media: 일반·참가중·잠김)',
  parameters: widePage,
  render: () => (
    <Pair>
      <Side label="지금 (조사 B2, 썸네일 90px)">
        {MISSION_CASES.map((c) => <LegacyMissionRow key={c.state} c={c} />)}
      </Side>
      <Side label="ListRow media (썸네일 48px)">
        {MISSION_CASES.map((c) => (
          <ListRow
            key={c.state}
            variant="media"
            tone="flat"
            separator
            lead={c.state === 'locked' ? <LockIcon /> : <TargetIcon />}
            eyebrow={<ListRowChip tone={c.state === 'joined' ? 'accent' : 'neutral'}>{MISSION_STATE_LABEL[c.state]}</ListRowChip>}
            time={c.time}
            title={c.title}
            meta={c.condition ?? c.desc}
            metaLines={2}
            footer={<RewardFooter rarity={c.rarity} name={c.badgeName} more={c.more} />}
            href="#mission"
            chevron
          />
        ))}
      </Side>
    </Pair>
  ),
};

// 4. 최악 사례 (320·360 + 글자 확대)

const AvatarLink = { leadHref: '#u/kim_seoul', leadLabel: 'runner_kim_seoul_2026 프로필' } as const;

type WorstCase = { id: string; label: string; node: React.ReactNode };

const worstCases = (): WorstCase[] => [
  {
    id: 'A1',
    label: 'A1 피드 — 마지막 파편 + 반복 획득 + 날짜 + 칩 3개',
    node: (
      <ListRow
        lead={<MedalIcon />}
        leadBadge="×12"
        eyebrow="아이템 픽업"
        time="11월 6일"
        title="서울숲 새벽 러닝 클럽 여름 한정 아이템 배지"
        meta="서울숲 입구 · 마지막 파편으로 아이템 배지를 완성했어요"
        chips={<><RarityBadge rarity="mystic" size="md" /><BadgeLevelChip level={12} size="md" /><ListRowChip tone="warning">마지막 파편</ListRowChip></>}
        onClick={noop}
      />
    ),
  },
  {
    id: 'A2',
    label: 'A2 활동 묶음 — 긴 활동 이름, 쉐브론 없음. 아래는 쉐브론을 더한 대안',
    node: (
      <>
        <ListRow
          lead={<ActivityIcon />}
          leadBadge="×5"
          eyebrow="한강 새벽 러닝 10km 인터벌 훈련 후 모은 활동"
          time="방금"
          title={<><ListRowEm>배지 3개</ListRowEm>와 <ListRowEm>아이템 2개</ListRowEm>를 받았어요</>}
          titleVariant="sentence"
          aria-expanded={false}
          onClick={noop}
        />
        <Caption>대안: 눈에 보이는 펼침 단서가 필요하면 chevron을 켠다(aria-expanded와 함께 쓰면 펼침에서 180도 돈다). 필요한지는 사용자가 정한다.</Caption>
        <ListRow
          lead={<ActivityIcon />}
          leadBadge="×5"
          eyebrow="한강 새벽 러닝 10km 인터벌 훈련 후 모은 활동"
          time="방금"
          title={<><ListRowEm>배지 3개</ListRowEm>와 <ListRowEm>아이템 2개</ListRowEm>를 받았어요</>}
          titleVariant="sentence"
          chevron
          aria-expanded={false}
          onClick={noop}
        />
      </>
    ),
  },
  {
    id: 'A4',
    label: 'A4 알림 장문 — 아바타 2단 링크, sentence는 줄 제한 없이 전부 보인다',
    node: (
      <ListRow
        {...AvatarLink}
        lead={<UserIcon />}
        leadShape="round"
        eyebrow="새 코멘트"
        time="방금"
        title={<><ListRowEm>runner_kim_seoul_2026</ListRowEm> 님이 한강 러너 배지 획득을 축하하며 코멘트를 남겼어요: 오늘 페이스가 아주 좋았어요, 다음에는 같이 뛰어요</>}
        titleVariant="sentence"
        href="#notification"
      />
    ),
  },
  {
    id: 'A5',
    label: 'A5 포인트 내역 — 긴 사유 + 긴 절대 날짜. 깨짐 후보와 대안',
    node: (
      <>
        <Caption>깨짐 후보: 긴 절대 날짜를 time에 넣으면 time은 줄지 않아 eyebrow 칸이 거의 사라진다.</Caption>
        <ListRow
          lead={<CoinIcon />}
          leadShape="round"
          eyebrow="포인트 적립"
          time="2026년 11월 6일 오후 3시 30분"
          title="러닝 보너스"
          meta="5km 러닝 3회 연속 달성 보너스와 주간 챌린지 완주 보상이 함께 지급됐어요"
          metaLines={2}
          value={<PointText value="+120" />}
        />
        <Caption>대안(호출부 규칙): time에는 짧은 형식(«11월 6일»), 긴 날짜는 meta 줄로 내린다.</Caption>
        <ListRow
          lead={<CoinIcon />}
          leadShape="round"
          eyebrow="포인트 적립"
          time="11월 6일"
          title="러닝 보너스"
          meta="2026년 11월 6일 오후 3시 30분 · 5km 러닝 3회 연속 달성 보너스와 주간 챌린지 완주 보상이 함께 지급됐어요"
          metaLines={3}
          value={<PointText value="+120" />}
        />
      </>
    ),
  },
  {
    id: 'B1',
    label: 'B1 레시피 — 슬롯 수 칩(titleSuffix) + 잠김 + 긴 공개 예정 + stacked 포인트',
    node: (
      <ListRow
        lead={<PackageIcon />}
        title="한여름 밤의 레시피와 긴 이름"
        titleSuffix={<ListRowChip>슬롯 3</ListRowChip>}
        chips={<><RarityBadge rarity="epic" size="md" /><ListRowChip>잠김</ListRowChip></>}
        meta="공개 예정: 2026년 12월 1일 오전 10시에 열려요"
        metaLines={2}
        value={<PointText value={1200} layout="stacked" />}
        href="#recipe"
      />
    ),
  },
  {
    id: 'B2',
    label: 'B2 미션 목록 — NEW + 잠김 + 잠김 조건 + 여러 보상',
    node: (
      <ListRow
        variant="media"
        tone="flat"
        separator
        lead={<LockIcon />}
        eyebrow={<><ListRowChip tone="accent">NEW</ListRowChip><ListRowChip>잠김</ListRowChip></>}
        time="D-3"
        title="하프 마라톤 도전: 21km 완주"
        meta="10km 러닝 챌린지를 먼저 완료하면 열려요"
        metaLines={2}
        footer={<RewardFooter rarity="mystic" name="하프 완주" more="아이템 배지 2개 · +500 포인트" />}
        href="#mission"
        chevron
      />
    ),
  },
  {
    id: 'B7',
    label: 'B7 개체 후보 — 만료 임박 + 선택됨 + 처리 중',
    node: (
      <ListRow
        selected
        title="#0042 서울숲 여름 한정 아이템"
        chips={<><RarityBadge rarity="epic" size="md" /><ListRowChip tone="warning">내일 만료</ListRowChip></>}
        value="처리 중"
        onClick={noop}
      />
    ),
  },
  {
    id: 'C1',
    label: 'C1 사람 — 긴 닉네임 + 팔로우(이름이 먼저 잘린다)',
    node: (
      <>
        <ListRow lead={<UserIcon />} leadShape="round" title="아주아주아주아주긴닉네임을가진러너입니다" meta="서울 · 러닝 · 팔로워 1,204명" href="#u/long" trail={<FollowButton />} />
        <ListRow lead={<UserIcon />} leadShape="round" title="long_nickname_runner_seoul_2026" href="#u/long2" trail={<FollowButton label="팔로잉" />} />
      </>
    ),
  },
  {
    id: 'C4',
    label: 'C4 순위 — 내 행 + 긴 이름 + 이름 옆 «나» 칩 + 긴 값',
    node: (
      <>
        <ListRow tone="flat" separator indicator={<Rank n={12} />} lead={<UserIcon />} leadShape="round" title="runner_kim" value="42.3km" />
        <ListRow tone="flat" indicator={<Rank n={13} />} lead={<UserIcon />} leadShape="round" title="han_river_seoul_runner_2026" titleLines={1} titleSuffix={<ListRowChip tone="accent">나</ListRowChip>} value="1,042.3km" />
      </>
    ),
  },
  {
    id: 'C5',
    label: 'C5 달성 행 — 이름 옆 «나» 칩 + 달성·미달성 칩',
    node: (
      <>
        <ListRow tone="tint" lead={<UserIcon />} leadShape="round" title="runner_kim" value={<ListRowChip tone="done">달성</ListRowChip>} />
        <ListRow tone="tint" lead={<UserIcon />} leadShape="round" title="han_river_seoul_runner_2026" titleLines={1} titleSuffix={<ListRowChip tone="surface">나</ListRowChip>} value={<ListRowChip tone="surface-muted">미달성</ListRowChip>} />
      </>
    ),
  },
];

const WorstCaseRows = ({ only }: { only?: string[] }) => (
  <>
    {worstCases().filter((c) => !only || only.includes(c.id)).map((c) => (
      <React.Fragment key={c.id}>
        <Caption>{c.label}</Caption>
        {c.node}
      </React.Fragment>
    ))}
  </>
);

export const WorstCases320: Story = {
  name: '최악 사례 — 폭 320px(10건)',
  parameters: widePage,
  render: () => <Frame width={320}><WorstCaseRows /></Frame>,
};

export const WorstCases360: Story = {
  name: '최악 사례 — 폭 360px(10건)',
  parameters: widePage,
  render: () => <Frame width={360}><WorstCaseRows /></Frame>,
};

/** 글자 크게 보기: 루트(html) 글자 크기를 130%로 올린다. rem 기반 --text-* 토큰이 따라 커지고 lead 48px은 고정이다. 떠날 때 되돌린다. */
const LargeTextRoot = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = '130%';
    return () => { root.style.fontSize = previous; };
  }, []);
  return <>{children}</>;
};

export const WorstCasesLargeText: Story = {
  name: '최악 사례 — 글자 크게 보기 130%(대표 6건, 폭 360px)',
  parameters: { ...widePage, docs: { story: { inline: false } } },
  render: () => (
    <LargeTextRoot>
      <Frame width={360}><WorstCaseRows only={['A1', 'A4', 'A5', 'B1', 'B2', 'C4']} /></Frame>
    </LargeTextRoot>
  ),
};

// 5. flat + 선택됨

export const FlatSelected: Story = {
  name: '상태 — flat + 선택됨(여백 16 + 모서리 + 링 + 체크)',
  decorators: [withStack],
  render: () => {
    const [picked, setPicked] = useState('b');
    const options = [['a', '한강 러너'], ['b', '아침 러너'], ['c', '야간 러너']];
    return (
      <>
        <Caption>flat에 selected를 지정하면(true·false 모두) 좌우 16 + 모서리 --radius-2xl이 자동으로 붙는다. 선택·미선택 전환에 글자가 밀리지 않고, 구분선은 그리지 않는다.</Caption>
        <div role="radiogroup" aria-label="배지 선택(flat + selected)" style={{ display: 'flex', flexDirection: 'column' }}>
          {options.map(([id, name]) => (
            <ListRow key={id} tone="flat" separator role="radio" aria-checked={picked === id} selected={picked === id} lead={<MedalIcon />} title={name} meta="5km 러닝" onClick={() => setPicked(id)} />
          ))}
        </div>
        <Caption>비교 — selected가 없는 flat은 가로 0 · 모서리 0이고 separator 구분선이 그려진다</Caption>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {options.map(([id, name]) => (
            <ListRow key={id} tone="flat" separator lead={<MedalIcon />} title={name} meta="5km 러닝" onClick={noop} />
          ))}
        </div>
        <Caption>로딩 — ListRowSkeleton도 selected를 지정하면 같은 여백과 모서리를 받는다. 면이 없는 flat은 막대가 크림 바탕에 묻히지 않게 한 단계 어두운 색으로 채운다</Caption>
        <ListRowSkeleton tone="flat" selected={false} />
      </>
    );
  },
};

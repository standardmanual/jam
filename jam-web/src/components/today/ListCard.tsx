import { Card } from '@ds/components/cards/Card'
import RankingListRow from '@/components/ranking/RankingListRow'
import { d } from '@/lib/i18n'
import { formatRankingMetricValue } from '@/lib/ranking/format'
import type { RankingBoardResult } from '@/lib/ranking/rankingDataSource'
import type { ListCardView } from '@/lib/today/cardView'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from './CardBody'
import CardChipRow from './CardChipRow'
import { CardLink } from './CardFrame'
import CardThumb from './CardThumb'

/**
 * 목록(`list`) 모양 — 면(표면) 겹 (티켓 20261001_2104, 상위 20260930_1453 확정 설계 1·3·4절 조각 b5).
 *
 * 흰 카드에 왼쪽 정렬 본문(칩 줄 → 제목 → 요약 → 필수 정보 → 설명문)이 있고 그 아래가 두 갈래다. `resource`가 `ranking`이면 행형(`ranking`만 읽는다), 아니면
 * 타일형(`tiles`만 읽는다). 모양마다 다른 링크 범위는 `TodayCard`가 틀(`CardFrame`)에 알린다: 타일형은 카드 전체가 링크, 행형은 카드 전체 링크가 없다.
 * `titleInImage`는 읽지 않는다(이미지 칸이 없어 제목은 늘 보인다). 안쪽 여백은 `hero`·`square`와 같은 인라인 `style` 0이고 본문 24px은 `CardBody`가 가진다.
 *
 * - 타일형: 한 줄 가로 스크롤(줄바꿈 없음 — 줄바꿈은 타일 8개에서 카드 높이가 100px 안팎씩 늘어 「큰 카드 사이에 작은 카드」 편성을 깬다). 스크롤 칸이 카드 좌우 끝까지
 *   번지고(`-mx`·`px` 24px) 타일 간격이 8px라 360·430·320 기기 폭에서 다음 타일이 가장자리에서 잘려 보인다 — 더 있다는 단서는 이것뿐이다(화살표·점·「+N」·페이드·스냅 없음).
 *   희귀도는 타일에 그리지 않는다(`CardViewTile.rarity`는 표시 데이터에 두되 쓰지 않는다). 되돌리기는 이 파일 한 곳이다. 이름은 64px 칸 폭 그대로 가운데 2줄이다.
 *   그림이 없거나 실패하면 `CardThumb`이 같은 칸에 카드의 자원 아이콘을 그린다. 미보유(`earned === false`)만 그림이 흑백이고 `earned`가 없으면(미리보기) 컬러다.
 *   스크롤 칸에는 `tabIndex`를 주지 않는다(카드 전체가 링크라 안에 `tabindex`를 두면 마크업 규칙 위반이다).
 * - 행형: 제목 영역은 `live`(= `tracking` 있음)이고 미션 대상 랭킹(`mission_progress`)이며 `href`가 있을 때만 `CardLink`로 감싼다. 순위 행은 각자 프로필 링크다. 끝 줄은 없다
 *   (「이 카드 전체가 눌린다」는 신호인데 행형은 행마다 다른 곳으로 가서 거짓이 된다). 순위가 비면(`ranking`이 null이거나 0행) 행 자리에 빈 문구를 그린다.
 *   `live` 한 변수가 제목 링크·행 링크·내 순위 강조를 모두 정한다: 미리보기는 `username`을 비워 행 링크를 없애고 강조도 없다(어드민이 `currentUserId`를 실수로 넘겨도 마찬가지).
 *   `currentUserId`는 표시 데이터가 아니라 별도 prop이다 — 표시 데이터는 유저 정보 없이 그려져야 한다(확정 설계 8절).
 * - `RankingListRow`에 `formatValue` 함수를 넘긴다. 이 파일은 서버 컴포넌트라 `RankingListRow`가 `'use client'`면 렌더 때 실패한다 — 그래서 `RankingListRow`는 클라이언트 지시어가 없다.
 */

/** 칩 줄 → 제목 → 요약 → 필수 정보 → 설명문. 두 갈래가 같은 본문이다. 희귀도 칩은 JAM! 배지 1개 카드(표시 데이터의 `rarity`)에만 있다. */
function ListHead({ view }: { view: ListCardView }) {
  return (
    <>
      <CardChipRow view={{ resource: view.resource, label: view.label, regionLabel: view.regionLabel, rarity: view.rarity }} />
      <CardTitleGroup title={view.title} subtitle={view.subtitle} />
      <CardFacts facts={view.facts} />
      <CardDescription description={view.description} />
    </>
  )
}

function ListTiles({ view }: { view: ListCardView }) {
  return (
    <CardBody>
      <ListHead view={view} />

      {/* 타일 0개는 `toCardView`가 `brief`로 바꿔 여기까지 오지 않는다. 직접 만든 표시 데이터가 0개로 오면 타일 줄만 그리지 않는다 */}
      {view.tiles.length > 0 && (
        <div className="-mx-[var(--spacing-24)] overflow-x-auto px-[var(--spacing-24)]">
          <ul className="flex gap-[var(--spacing-8)]">
            {view.tiles.map((tile, index) => (
              <li key={index} className="w-16 shrink-0">
                <CardThumb view={view} src={tile.imageUrl} dimmed={tile.earned === false} />
                <p className="mt-[var(--spacing-4)] text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text-inverse/60 text-center line-clamp-2 break-keep break-words">
                  {tile.name}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 끝 줄 — 링크가 없는 카드(`href` 없음)는 말하지 않는다. 미리보기도 링크만 없을 뿐 `href`가 있으면 보인다 */}
      {view.href && <CardEndLine label={d.today.cardViewAll} />}
    </CardBody>
  )
}

function RankingRows({ ranking, live, currentUserId }: { ranking: RankingBoardResult; live: boolean; currentUserId?: string }) {
  const maxValue = ranking.entries[0]?.value ?? 0
  const formatValue = (value: number) =>
    formatRankingMetricValue(ranking.metricType, value, {
      missionType: ranking.missionType,
      conditionFieldKey: ranking.conditionFieldKey,
    })

  return (
    <div className="flex flex-col gap-[var(--spacing-8)]">
      {ranking.entries.map((entry) => (
        <RankingListRow
          key={entry.userId}
          entry={live ? entry : { ...entry, username: null }}
          maxValue={maxValue}
          isMe={live && currentUserId != null && entry.userId === currentUserId}
          formatValue={formatValue}
        />
      ))}
    </div>
  )
}

function ListRanking({ view, currentUserId }: { view: ListCardView; currentUserId?: string }) {
  const { ranking, href } = view
  const live = Boolean(view.tracking)
  const titleHref = live && ranking?.metricType === 'mission_progress' ? href : undefined
  // 제목 영역 안쪽도 그룹 간격(12px)이 이어져야 해서 링크 안에 같은 세로 flex 칸을 둔다
  const head = (
    <div className="flex flex-col gap-[var(--spacing-12)]">
      <ListHead view={view} />
    </div>
  )

  return (
    <CardBody>
      {titleHref ? <CardLink href={titleHref}>{head}</CardLink> : head}

      {ranking && ranking.entries.length > 0 ? (
        <RankingRows ranking={ranking} live={live} currentUserId={currentUserId} />
      ) : (
        // 순위를 못 읽은 경우와 아직 없는 경우를 구분하지 않는다. 그림·아이콘 없이 왼쪽 정렬 글자뿐이다
        <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse/60">{d.todayCard.rankingEmpty}</p>
      )}
    </CardBody>
  )
}

export default function ListCard({ view, currentUserId }: { view: ListCardView; currentUserId?: string }) {
  return (
    <Card tone="inverse" style={{ padding: 0 }}>
      {view.resource === 'ranking' ? <ListRanking view={view} currentUserId={currentUserId} /> : <ListTiles view={view} />}
    </Card>
  )
}

import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import FeedCollectionCard from './FeedCollectionCard'
import { CARD_WIDTH_320, COLLECTION_ART, CardBox, Cell, ITEM_BADGES, Row, feedView, type StoryCardOptions } from './feedStoryFixtures'

/**
 * 컬렉션 소개(`collection_intro`) 상태 행렬 (티켓 20261121_0115, 상위 20261120_2026 4회차-3). 서비스 전용(홈피드 한정).
 * 위 영역(높이 240) 가운데에 대표 그림 168×168, 그 뒤에서 아이템 배지 4개(68~84)가 둘레로 퍼지고, 아래에 제목(컬렉션 이름)과 설명. 샘플 카드 높이 416.
 * 칩은 카드 모서리에 걸쳐 계획(`look.chipPlan`)대로 놓이고 퍼진 배지 자리·대표 그림 가운데를 피한다. 모션은 «모인 모습»과 «퍼진 모습»을 따로 고정해 볼 수 있다(`previewPhase`, Story 전용 입력).
 * 「스크롤로 재생」은 실제 관찰자(55%·재생 반복)가 돌아가고, 동작 줄이기를 켠 기기에서는 퍼진 모습만 보인다(전환 없음).
 */
const meta: Meta<typeof FeedCollectionCard> = {
  title: '서비스/Today/Feed/컬렉션 소개(collection_intro)',
  component: FeedCollectionCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const DESCRIPTION = '활판 골목 끝 현상소의 안쪽 벽에는 찾아가지 않은 사진이 붙어 있습니다.'

const base: StoryCardOptions = {
  title: '골목길 필름 스냅',
  description: DESCRIPTION,
  imageUrl: COLLECTION_ART,
  collectionName: '골목길 필름 스냅',
  collectionBadges: ITEM_BADGES,
  valueSource: { resource: 'collection', itemCount: 12 },
  chips: [{ kind: 'label', slot: 'art-top-left' }],
  feed_seed: 11,
}

const view = (options: StoryCardOptions = {}) => feedView('collection_intro', { ...base, ...options })

export const Sample: Story = {
  name: '샘플 구성(퍼진 모습)',
  render: () => (
    <CardBox>
      <FeedCollectionCard view={view()} previewPhase="spread" />
    </CardBox>
  ),
}

export const CollectedAndSpread: Story = {
  name: '모인 모습 · 퍼진 모습',
  render: () => (
    <Row>
      <Cell label="모인 모습(배지 불투명도 0, 가운데에서 0.3배)">
        <CardBox>
          <FeedCollectionCard view={view()} previewPhase="collected" />
        </CardBox>
      </Cell>
      <Cell label="퍼진 모습(기본 HTML과 같다)">
        <CardBox>
          <FeedCollectionCard view={view()} previewPhase="spread" />
        </CardBox>
      </Cell>
    </Row>
  ),
}

/** 실제 관찰자가 돌아간다: 화면에 55% 넘게 들어오면 퍼지고 완전히 나가면 모이며 다시 들어오면 재생한다. 위 여백을 스크롤해 확인한다. */
export const ScrollToPlay: Story = {
  name: '스크롤로 재생(관찰자 55%)',
  render: () => (
    <div>
      {/* spacing-allow: Story 전용 스크롤 여백(화면 밖에서 시작하려는 빈 칸), 서비스 화면이 아님(티켓 20261121_0115) */}
      <div style={{ height: '120vh' }} />
      <CardBox>
        <FeedCollectionCard view={view()} />
      </CardBox>
      <div style={{ height: '120vh' }} />
    </div>
  ),
}

export const BadgeCounts: Story = {
  name: '배지 0~4개',
  render: () => (
    <Row>
      {[0, 1, 2, 3, 4].map((count) => (
        <Cell key={count} label={`배지 ${count}개${count === 0 ? '(모션 없이 대표 그림만)' : ''}`}>
          <CardBox>
            <FeedCollectionCard view={view({ collectionBadges: ITEM_BADGES.slice(0, count) })} previewPhase="spread" />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const StoredBurst: Story = {
  name: '저장된 배치(collection_burst)',
  render: () => (
    <CardBox>
      <FeedCollectionCard
        view={view({
          collection_burst: [
            { x: -0.69, y: -0.25, tilt: 8, size: 80, delay_ms: 70 },
            { x: -0.52, y: 0.65, tilt: -14, size: 68, delay_ms: 140 },
            { x: 0.64, y: -0.63, tilt: -9, size: 72, delay_ms: 100 },
            { x: 0.69, y: 0.4, tilt: 12, size: 84, delay_ms: 210 },
          ],
        })}
        previewPhase="spread"
      />
    </CardBox>
  ),
}

export const SeedBursts: Story = {
  name: '시드마다 다른 배치(카드 id 시드)',
  render: () => (
    <Row>
      {[1, 2, 3, 4].map((seed) => (
        <Cell key={seed} label={`feed_seed ${seed}`}>
          <CardBox>
            <FeedCollectionCard view={view({ feed_seed: seed })} previewPhase="spread" />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const ChipSlots: Story = {
  name: '어드민이 자리를 정한 칩(자리는 계획이 옮기지 않는다)',
  render: () => (
    <Row>
      {(['art-top-left', 'art-top-right', 'art-bottom-left', 'art-bottom-right'] as const).map((slot) => (
        <Cell key={slot} label={slot}>
          <CardBox>
            <FeedCollectionCard view={view({ chips: [{ kind: 'label', slot }] })} previewPhase="spread" />
          </CardBox>
        </Cell>
      ))}
      <Cell label="칩 2개(대각선)">
        <CardBox>
          <FeedCollectionCard
            view={view({
              chips: [
                { kind: 'phrase', text: '아이템 12개', slot: 'art-top-left' },
                { kind: 'label', slot: 'art-bottom-right' },
              ],
            })}
            previewPhase="spread"
          />
        </CardBox>
      </Cell>
    </Row>
  ),
}

export const WithStamp: Story = {
  name: '도장 있음',
  render: () => (
    <CardBox>
      <FeedCollectionCard view={view({ stamp_enabled: true })} previewPhase="spread" />
    </CardBox>
  ),
}

export const DescriptionHidden: Story = {
  name: '설명 숨김(show_description=false)',
  render: () => (
    <CardBox>
      <FeedCollectionCard view={view({ show_description: false })} previewPhase="spread" />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288) · 모인 모습과 퍼진 모습',
  render: () => (
    <Row>
      <CardBox width={CARD_WIDTH_320}>
        <FeedCollectionCard view={view({ chips: [{ kind: 'phrase', text: '아이템 12개', slot: 'art-top-right' }] })} previewPhase="collected" />
      </CardBox>
      <CardBox width={CARD_WIDTH_320}>
        <FeedCollectionCard view={view({ chips: [{ kind: 'phrase', text: '아이템 12개', slot: 'art-top-right' }] })} previewPhase="spread" />
      </CardBox>
    </Row>
  ),
}

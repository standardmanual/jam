import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import FeedGalleryListCard from './FeedGalleryListCard'
import { CARD_WIDTH_320, CardBox, Cell, ITEM_BADGES, Row, fakeImage, feedView, type StoryCardOptions } from './feedStoryFixtures'

/**
 * 목록형(`gallery_list`) 상태 행렬 (티켓 20261121_0115, 상위 20261120_2026 4회차-3). 서비스 전용(홈피드 한정).
 * 제목·설명 아래에 4칸 한 줄 갤러리(`grid-cols-4`, 칸 간격 8): 항목 최대 3개(정사각·모서리 12·면 색은 박스 색·아래에 이름 12px 굵게 두 줄까지)와 검정 바탕 «→» 화살표 칸. 샘플 카드 높이 260 이상.
 * 카드 전체에는 링크가 없고 항목·화살표 칸마다 링크가 있다. 「링크 있는 모습」은 계측 정보를 단 상태(홈과 같다: 눌림·포커스 윤곽선이 칸마다 보인다),
 * 나머지는 계측 정보가 없는 미리보기라 링크 없이 그려진다. 주소는 내부 경로('/'로 시작하고 '//'로 시작하지 않는 값) 또는 'https://'로 시작하는 값만 링크가 되고, 그 밖의 주소는 «안전하지 않은 주소» 상태처럼 링크 없이 그린다(항목) 또는 화살표 칸을 그리지 않는다(더 보기).
 */
const meta: Meta<typeof FeedGalleryListCard> = {
  title: '서비스/Today/Feed/목록형(gallery_list)',
  component: FeedGalleryListCard,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj<typeof meta>

const SPOT = (label: string, accent: string) => fakeImage(label, accent)

const ITEMS = [
  { name: '산', href: '/drops?place=mountain', imageUrl: SPOT('#7aa874', '#2f5d3a') },
  { name: '편의점', href: '/drops?place=cvs', imageUrl: null },
  { name: '마트', href: '/drops?place=mart', imageUrl: SPOT('#e0b26a', '#8a5a2b') },
]

const base: StoryCardOptions = {
  title: '요즘 드랍이 많은 곳',
  description: '산, 편의점, 마트, 관공서에 아이템 배지가 많이 드랍돼 있어요. 가까운 곳에서 픽업해 봐요.',
  imageUrl: null,
  listItems: ITEMS,
  listMoreHref: '/drops',
  valueSource: null,
  chips: [],
  box_color_key: 'yellow-soft',
  feed_seed: 3,
}

const view = (options: StoryCardOptions = {}) => feedView('gallery_list', { ...base, ...options })

export const Sample: Story = {
  name: '샘플 구성(항목 3개 + 화살표)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard view={view()} />
    </CardBox>
  ),
}

export const LinkedState: Story = {
  name: '링크 있는 모습(계측 정보 있음)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard view={view({ linked: true })} />
    </CardBox>
  ),
}

export const ItemCounts: Story = {
  name: '항목 1·2·3개(빈 칸 없이 화살표가 당겨진다)',
  render: () => (
    <Row>
      {[1, 2, 3].map((count) => (
        <Cell key={count} label={`항목 ${count}개`}>
          <CardBox>
            <FeedGalleryListCard view={view({ listItems: ITEMS.slice(0, count), linked: true })} />
          </CardBox>
        </Cell>
      ))}
    </Row>
  ),
}

export const WithoutArrow: Story = {
  name: '화살표 없음(list_more_href 없음)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard view={view({ listMoreHref: undefined, linked: true })} />
    </CardBox>
  ),
}

export const UnsafeHref: Story = {
  name: '안전하지 않은 주소(항목은 링크 없이, 화살표 칸은 없음)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard
        view={view({
          listItems: [
            { name: '산', href: 'javascript:void(0)', imageUrl: ITEMS[0].imageUrl },
            { name: '편의점', href: '//evil.example/x', imageUrl: null },
            { name: '마트', href: '/drops?place=mart', imageUrl: ITEMS[2].imageUrl },
          ],
          listMoreHref: 'http://example.com/all',
          linked: true,
        })}
      />
    </CardBox>
  ),
}

export const ItemsWithoutImage: Story = {
  name: '그림 없는 항목(이름 글자)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard view={view({ listItems: ITEMS.map((item) => ({ ...item, imageUrl: null })) })} />
    </CardBox>
  ),
}

export const LongNames: Story = {
  name: '긴 이름(두 줄까지, 넘치면 말줄임)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard
        view={view({
          listItems: [
            { name: '한강 노을 산책로 입구', href: '/drops?place=a', imageUrl: SPOT('#8fb7d9', '#2b4c6f') },
            { name: '아주 아주 긴 이름의 동네 편의점 앞', href: '/drops?place=b', imageUrl: null },
            { name: '마트', href: '/drops?place=c', imageUrl: SPOT('#e0b26a', '#8a5a2b') },
          ],
        })}
      />
    </CardBox>
  ),
}

export const WithChip: Story = {
  name: '칩(카드 오른쪽 위)',
  render: () => (
    <Row>
      <Cell label="문구 칩(큰 칩)">
        <CardBox>
          <FeedGalleryListCard view={view({ chips: [{ kind: 'phrase', text: '요즘 인기', slot: 'card-top-right' }], title: '요즘 드랍' })} />
        </CardBox>
      </Cell>
      <Cell label="구분 칩(검정)">
        <CardBox>
          <FeedGalleryListCard view={view({ chips: [{ kind: 'label', text: '아이템 배지', slot: 'card-top-right' }], title: '요즘 드랍', valueSource: { resource: 'drop_pickup' } })} />
        </CardBox>
      </Cell>
    </Row>
  ),
}

export const DescriptionHidden: Story = {
  name: '설명 숨김(show_description=false)',
  render: () => (
    <CardBox>
      <FeedGalleryListCard view={view({ show_description: false })} />
    </CardBox>
  ),
}

export const BadgeImages: Story = {
  name: '아이템 배지 그림 항목',
  render: () => (
    <CardBox>
      <FeedGalleryListCard
        view={view({ listItems: ITEM_BADGES.slice(0, 3).map((badge) => ({ name: badge.name, href: '/drops', imageUrl: badge.imageUrl })), linked: true })}
      />
    </CardBox>
  ),
}

export const Narrow320: Story = {
  name: '폭 320 화면(카드 288, 칸 폭 58)',
  render: () => (
    <CardBox width={CARD_WIDTH_320}>
      <FeedGalleryListCard view={view({ linked: true })} />
    </CardBox>
  ),
}

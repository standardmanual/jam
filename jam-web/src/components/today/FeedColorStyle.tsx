/**
 * 홈피드 카드 전용 색 변수(`--feed-color-<키>`)를 덮어쓴 키만 `:root`에 내리는 서버 컴포넌트 (티켓 20261121_2145).
 * 덮어쓴 키가 없거나 읽기가 실패하면 아무것도 그리지 않아 기본값(`feedColorVar`의 폴백 변수)으로 그려진다. `--jam-*`는 건드리지 않는다.
 */
import { feedColorOverrideCss } from '@/lib/today/feedColorOverrides'
import { getFeedColorOverrides } from '@/lib/today/feedColorOverridesServer'

export default async function FeedColorStyle() {
  const css = feedColorOverrideCss(await getFeedColorOverrides())
  if (!css) return null
  // css는 15개 키 이름과 `#rrggbb`만으로 만들어진다(feedColorOverrideCss) — 입력이 무엇이든 다른 문자가 들어올 수 없다.
  return <style data-feed-colors="" dangerouslySetInnerHTML={{ __html: css }} />
}

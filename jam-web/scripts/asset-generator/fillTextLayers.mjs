/**
 * JAM! 에셋 제너레이터 CLI — 텍스트 레이어 채우기 (티켓 20260926_1208, PRD §8)
 *
 * 프리셋 JSON에는 레이어 이름이 없어(`TextLayerConfig`에 `name` 없음) 텍스트 레이어를 구분할
 * 방법이 배열 순서뿐이다. 규칙: `layers`에서 `type: 'text'`인 것만 뽑은 순서로
 * 1번째 = 제목(`--text`), 2번째 = 설명(`--subtext`)이다. 프리셋을 어드민에서 다시 저장해
 * 레이어 순서를 바꾸면 값이 뒤바뀌므로 홈피드 프리셋은 「제목 → 설명」 순서를 유지해야 한다.
 *
 * 텍스트 레이어 수별 동작(조용히 같은 문구로 채우지 않는다):
 * - 0개: `--text`를 무시한다(기존 동작). `--subtext`가 있으면 오류 — 값이 버려지는 것을 막는다.
 * - 1개: `--text`만 쓴다. `--subtext`가 있으면 오류.
 * - 2개: `--text`·`--subtext` 둘 다 필요하다. `--subtext`가 없으면 오류.
 * - 3개 이상: 지원 범위 밖이라 오류.
 * 오류는 한국어 메시지의 Error로 던지고 호출부(render.mjs)가 종료 코드 1로 끝낸다.
 */

/** `layers`의 텍스트 레이어에 순서 규칙대로 문구를 채운 새 배열을 돌려준다(원본은 바꾸지 않는다). */
export function fillTextLayers(layers, { text, subtext }) {
  const textLayerCount = layers.filter((layer) => layer.type === 'text').length
  const hasSubtext = subtext !== undefined

  if (textLayerCount >= 3) {
    throw new Error(`이 프리셋은 텍스트 레이어가 ${textLayerCount}개예요. 지원하는 범위(최대 2개)를 넘어서 프리셋을 확인해 주세요.`)
  }
  if (textLayerCount === 2 && !hasSubtext) {
    throw new Error('이 프리셋은 텍스트 레이어가 2개예요. --subtext로 두 번째 문구도 넣어 주세요.')
  }
  if (textLayerCount < 2 && hasSubtext) {
    throw new Error(`이 프리셋은 텍스트 레이어가 ${textLayerCount}개예요. --subtext는 텍스트 레이어가 2개인 프리셋에서만 쓸 수 있어요.`)
  }

  const contents = [text, subtext]
  let textIndex = 0
  return layers.map((layer) => (layer.type === 'text' ? { ...layer, content: contents[textIndex++] } : layer))
}

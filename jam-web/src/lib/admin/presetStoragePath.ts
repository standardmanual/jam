/**
 * 에셋 제너레이터 프리셋이 스토리지 경로(`asset-generator/presets/{presetId}/{layerId}.{ext}`)에
 * 넣는 값의 형식 검증 (티켓 20260926_0201).
 *
 * 경로 조각에 `..`·`/`·공백 같은 문자가 들어가면 의도한 폴더 밖을 가리킬 수 있다. Storage가
 * 그런 경로를 어떻게 처리하는지는 확인하지 못했으므로, 값 자체를 `[A-Za-z0-9_-]`(UUID 포함)로
 * 제한해 두 라우트(저장·삭제)가 같은 기준으로 거절한다. 레이어 id는 화면이 `crypto.randomUUID()`
 * 또는 `image-layer-{숫자}-{영숫자}` 폴백으로 만든다(`assetGeneratorHelpers.ts`).
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]{1,100}$/

export function isSafePresetPathSegment(value: unknown): value is string {
  return typeof value === 'string' && SAFE_PATH_SEGMENT.test(value)
}

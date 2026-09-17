// [20260917_1303] BadgeHeroSection.tsx(20260917_1211)에서 추출한 공용 유틸 — 배지 상세와
// 컬렉션 상세(ItemBookHeroSection) 양쪽이 동일한 마침표 기준 줄바꿈 로직을 쓴다(코드 중복 방지).

// 마침표 뒤에 삽입해 문장 경계로 쓰는 표식. 설명에 실제로 등장할 가능성이 없는 임의
// 토큰이면 되므로 굳이 제어문자를 쓰지 않는다.
const SENTENCE_BREAK_MARK = '@@SENTENCE_BREAK@@'

/**
 * 설명을 마침표(문장 종결) 기준으로 줄바꿈한다.
 * 원본 문자열의 `\n`에만 반응하는 `whitespace-pre-line`으로는 "~했습니다." 같은 실제
 * 문장 종결 마침표에서 줄바꿈이 일어나지 않아, 마침표 뒤를 직접 분리선으로 쓴다.
 *
 * "42.195"처럼 숫자 사이 소수점은 문장 종결이 아니다(`seed_v5_activity_badges.rows.json`
 * 실제 사례: "42.195라는 숫자를 몸으로 통과했습니다."). 그래서 마침표 앞뒤에 숫자가 오면
 * 분리하지 않는다 — `(?<!\d)\.(?!\d)`로 숫자 사이 소수점만 제외하고 나머지 마침표에서 자른다.
 */
export function splitDescriptionSentences(description: string): string[] {
  return description
    .replace(/(?<!\d)\.(?!\d)/g, `.${SENTENCE_BREAK_MARK}`)
    .split(SENTENCE_BREAK_MARK)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

/**
 * 시험용 KST 시각 도우미 (티켓 20261018_1815 1회) — 배지 조건 판정이 활동 시작 시각(UTC `startDate`)을
 * 한국 시각으로 읽으므로, 시험은 「한국 시각 몇 시」를 UTC ISO 문자열로 바꿔 넣는다.
 */
export function kstIso(kst: string): string {
  // kst: 'YYYY-MM-DDTHH:MM' 또는 'YYYY-MM-DDTHH:MM:SS' (한국 시각)
  const full = kst.length === 16 ? `${kst}:00` : kst
  return new Date(Date.parse(`${full}Z`) - 9 * 60 * 60 * 1000).toISOString()
}

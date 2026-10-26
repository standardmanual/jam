import { d } from '@/lib/i18n'

/**
 * 가진 잼 한 줄 — «가진 잼 {balance}» (티켓 20261018_0054)
 *
 * 숫자는 포인트 숫자와 같은 문법이다(text-2xl bold --link tabular-nums). 가진 잼은 캡슐 시트, 잠긴 상세, 채우기 입력 단계,
 * 내 프로필의 포인트 행 아래(티켓 20261026_1030) 네 곳에만 보인다(캡슐 위젯과 카드, 투데이, 다른 유저의 프로필에는 두지 않는다).
 * 순수 표현이라 서버·클라이언트 어느 쪽에서도 쓴다.
 */
export default function JamBalance({ balance }: { balance: number }) {
  return (
    <p className="m-0 flex items-baseline gap-2 break-keep wrap-break-word">
      <span className="text-base text-foreground">{d.capsule.sheet.balanceLabel}</span>
      <span className="text-2xl font-bold tabular-nums text-[color:var(--link)]">{balance.toLocaleString('ko-KR')}</span>
    </p>
  )
}

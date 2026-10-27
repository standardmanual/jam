import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import {
  TRIBE_CHANGE_HISTORY_LIMIT,
  TRIBE_CHANGE_MEMO_MAX_LENGTH,
  TRIBE_CHANGE_MEMO_REQUIRED_REASON,
  TRIBE_CHANGE_REASONS,
  type TribeChangeHistoryItem,
} from '@/lib/admin/user-tribe'
import type { UserTribeView } from '@/lib/admin/user-tribe-view'
import { UserTribeChangeForm } from './UserTribeChangeForm'

interface Props {
  userId: string
  view: UserTribeView
}

const READ_FAILED_TEXT = '불러오지 못했어요. 화면을 새로 고쳐도 같으면 개발자에게 전달해 주세요.'
const UNKNOWN_TRIBE = '알 수 없는 트라이브'
const UNKNOWN_ADMIN = '알 수 없음'

/** `subject`는 조사까지 붙여 받는다(예: «변경 이력을»). 읽지 못한 것을 «기록 없음»과 구분해 보인다 */
function ReadFailed({ subject }: { subject: string }) {
  return <p className="text-red-600 text-sm break-keep wrap-break-word">{`${subject} ${READ_FAILED_TEXT}`}</p>
}

function HistoryTable({ rows }: { rows: TribeChangeHistoryItem[] }) {
  return (
    <div className="bg-white border border-border rounded-2xl p-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">바꾼 시각</TableHead>
            <TableHead className="whitespace-nowrap">바뀐 트라이브</TableHead>
            <TableHead className="whitespace-nowrap">사유</TableHead>
            <TableHead className="whitespace-nowrap">메모</TableHead>
            <TableHead className="whitespace-nowrap">처리자</TableHead>
            <TableHead className="whitespace-nowrap text-right">취소된 미션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatKstYmdHm(row.createdAt)}</TableCell>
              <TableCell className="break-keep wrap-break-word">
                {row.fromTribeName ?? UNKNOWN_TRIBE} → {row.toTribeName ?? UNKNOWN_TRIBE}
              </TableCell>
              <TableCell className="break-keep wrap-break-word">{row.reasonLabel}</TableCell>
              <TableCell className="break-keep wrap-break-word">{row.memo ?? '—'}</TableCell>
              <TableCell className="text-xs break-keep wrap-break-word">{row.changedByEmail ?? UNKNOWN_ADMIN}</TableCell>
              <TableCell className="text-right whitespace-nowrap">{row.cancelledMissionCount}개</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * 유저 상세의 «트라이브» 구역 (티켓 20261021_1247 3회, 운영 로직 2.4절). 챕터 구역(`UserChapterSection`)과 같은 방식으로 값을 읽어 둔 `view`를 그린다.
 * - 지금 트라이브의 이름. 트라이브를 아직 고르지 않은 유저는 안내 한 줄만 보이고 변경 양식이 없다(스스로 고르는 것이 설계다).
 * - 변경 양식(`UserTribeChangeForm`, 클라이언트): 사유 목록과 메모 상한은 `lib/admin/user-tribe.ts`의 상수를 여기서 넘긴다.
 * - 최근 변경 이력(`TRIBE_CHANGE_HISTORY_LIMIT`건까지, KST).
 * 읽지 못한 구역은 «없어요»와 다른 문구로 보인다.
 */
export function UserTribeSection({ userId, view }: Props) {
  const { current, options, history } = view

  return (
    <section className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold">트라이브</h2>
      </div>

      <div className="mb-6 w-full bg-white border border-border rounded-2xl p-5 space-y-4">
        <h3 className="font-bold">지금 트라이브</h3>
        {!current.ok ? (
          <ReadFailed subject="지금 트라이브를" />
        ) : current.value === null ? (
          <p className="text-muted-foreground text-sm break-keep wrap-break-word text-pretty">
            트라이브를 아직 고르지 않았어요. 유저가 직접 골라요.
          </p>
        ) : (
          <>
            <p className="text-2xl font-bold text-foreground break-keep wrap-break-word">{current.value.name}</p>
            {!options.ok ? (
              <ReadFailed subject="바꿀 수 있는 트라이브를" />
            ) : options.value.length === 0 ? (
              <p className="text-muted-foreground text-sm break-keep wrap-break-word text-pretty">
                바꿀 수 있는 다른 활성 트라이브가 없어요.
              </p>
            ) : (
              <UserTribeChangeForm
                userId={userId}
                currentTribeName={current.value.name}
                options={options.value}
                reasons={TRIBE_CHANGE_REASONS}
                memoRequiredReason={TRIBE_CHANGE_MEMO_REQUIRED_REASON}
                memoMaxLength={TRIBE_CHANGE_MEMO_MAX_LENGTH}
              />
            )}
          </>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">최근 변경 이력</h3>
          {history.ok && history.value.length > 0 && (
            <p className="text-muted-foreground text-sm break-keep wrap-break-word">
              {history.value.length >= TRIBE_CHANGE_HISTORY_LIMIT ? `최근 ${history.value.length}건` : `총 ${history.value.length}건`}
            </p>
          )}
        </div>
        {!history.ok ? (
          <ReadFailed subject="변경 이력을" />
        ) : history.value.length === 0 ? (
          <p className="text-muted-foreground text-sm break-keep wrap-break-word">아직 바꾼 적이 없어요.</p>
        ) : (
          <HistoryTable rows={history.value} />
        )}
      </div>
    </section>
  )
}

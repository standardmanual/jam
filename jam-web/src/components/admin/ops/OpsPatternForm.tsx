'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import {
  EditorShell,
  RAIL_ACTIONS_CLASS,
  RailCard,
  SectionCard,
  SectionNav,
  scrollToSection,
} from '@/components/admin/AdminEditorLayout'
import {
  RETRY_SAVE_LABEL,
  SAVED_LIVE_MESSAGE,
  SAVE_FAILED_TITLE,
  SAVE_LABEL,
  SAVING_LABEL,
} from '@/lib/admin/opsInbox/balance/settings'
import {
  changedFields,
  fieldErrorTarget,
  inputFromDraft,
  orderedErrorPaths,
  type PatternDraft,
  type PatternFormSectionId,
} from '@/lib/admin/opsPatterns/formDraft'
import { validateOpsPatternInput, type OpsPatternFieldErrors } from '@/lib/admin/opsPatterns/input'
import { patternDetailHref, patternListHref } from '@/lib/admin/opsPatterns/listView'
import { OpsConfirmDialog } from './OpsConfirmDialog'
import {
  CardShapeRows,
  KnobGroups,
  MenuChips,
  PATTERN_LONG_TEXT_MAX,
  PATTERN_NAME_MAX,
  SampleRows,
  TextField,
  usePatternLeaveGuard,
} from './OpsPatternFormParts'
import { SaveFailureAlerts, UnsavedChip } from './OpsRuleCardParts'
import { createdToastText, submitPatternForm, type PatternFormTarget } from './patternSubmit'

/**
 * 패턴 만들기·고치기 폼 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2, 채원 판정 「⑩a 만들기·고치기·상태」). `/admin/ops-patterns/new`와
 * `/admin/ops-patterns/[patternNo]/edit`가 같은 폼을 쓴다. 칸 부품은 `OpsPatternFormParts`, 요청과 응답 가르기는 `patternSubmit.ts`다.
 *
 * - 5구역(기본 / 메뉴와 카드 모양 / 손잡이 / 샘플 / 주의점) + 레일(목차 · 저장·바뀐 칸·안내·취소). 번호·출처·상태는 폼에 없다(머리 글자로만).
 * - 저장은 고친 칸이 있을 때만 켜진다. 확인창 없이 저장한다. 검사는 서버와 같은 `validateOpsPatternInput`이고, 한 번 저장을 눌러 본 뒤에는 고치는 대로 다시 검사한다.
 * - 고치기에서 409면 입력을 남기고 경고 + [최신 내용 불러오기]를 보인다. 누르면 「입력한 내용이 사라져요」 확인 뒤 `router.refresh()`로 다시 읽는다.
 *   페이지가 `key={updatedAt}`을 주므로 새 값이 오면 폼이 새로 시작한다. 만들기의 409는 불러올 값이 없어 경고만 보이고 다시 저장하면 된다.
 * - 고친 칸이 있으면 창 닫기·새로 고침에 브라우저 경고가 뜬다. 앱 안 링크 이동은 막지 않는다. [취소]는 고친 칸이 있으면 확인창을 먼저 연다.
 */

export const PATTERN_FORM_NAMESPACE = 'pattern-form'

export const PATTERN_FORM_SECTIONS: ReadonlyArray<{ id: PatternFormSectionId; label: string; description: string }> = [
  { id: 'basic', label: '기본', description: '패턴의 이름과 작동 원리, 유저가 겪는 것을 적어요' },
  { id: 'menus', label: '메뉴와 카드 모양', description: '이 패턴이 쓰는 메뉴와 카드 모양이에요' },
  { id: 'knobs', label: '손잡이', description: '운영 묶음에서 바꿀 수 있는 값과 닫아 둔 값이에요' },
  { id: 'samples', label: '샘플', description: '이 패턴을 보여 주는 예시예요' },
  { id: 'pitfalls', label: '주의점', description: '쓸 때 조심할 점이에요' },
]

export const PATTERN_FORM_NOTE = '이전 내용은 남지 않아요. 저장하면 에이전트가 바로 새 내용을 읽어요'
export const PATTERN_FORM_CANCEL_LABEL = '취소'
export const PATTERN_RELOAD_LABEL = '최신 내용 불러오기'
export const PATTERN_DISCARD_TITLE = '입력한 내용이 사라져요'
export const PATTERN_CANCEL_DESCRIPTION = '저장하지 않은 내용은 남지 않아요. 나갈까요?'
export const PATTERN_RELOAD_DESCRIPTION = '최신 내용을 불러오면 지금 입력한 내용은 남지 않아요.'
export const PATTERN_UNCHANGED_TOAST = '바뀐 내용이 없어요'

export function changedCountText(count: number): string {
  return `바뀐 칸 ${count}개`
}

/** 폼 위쪽에 보이는 저장 실패의 종류. */
type FormFailure =
  | { kind: 'error'; message: string }
  /** 고치기 409: 그사이 다른 곳에서 고쳤다. 불러오기 버튼이 붙는다. */
  | { kind: 'conflict'; message: string }
  /** 만들기 409: 그사이 다른 패턴이 만들어졌다. 다시 저장하면 된다. */
  | { kind: 'create-conflict'; message: string }

/** 레일 안 저장 실패 알림. 붉은 실패는 S7 카드와 같은 부품이고, 충돌은 경고 알림이다. */
export function PatternFailureAlerts({ failure, reloading, onReload }: { failure: FormFailure | null; reloading: boolean; onReload: () => void }) {
  if (failure === null) return null
  if (failure.kind === 'error') {
    return <SaveFailureAlerts failure={{ kind: 'error', message: failure.message }} conflictMessage="" reloading={false} onReload={onReload} />
  }
  return (
    <Alert variant="warning">
      <IconAlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>{SAVE_FAILED_TITLE}</AlertTitle>
      <AlertDescription>
        <p className="break-words">{failure.message}</p>
        {failure.kind === 'conflict' && (
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" disabled={reloading} onClick={onReload}>
              {PATTERN_RELOAD_LABEL}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** 레일의 「바뀐 칸 N개」와 칸 이름 목록(고치기에서만). */
export function ChangedFieldsList({ fields }: { fields: readonly string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium tabular-nums">{changedCountText(fields.length)}</p>
      {fields.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {fields.map((field) => (
            <li key={field} className="break-words">
              {field}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 첫 오류 칸으로 포커스를 옮긴다. 포커스할 수 없는 칸(칩 줄·목록 전체 오류)은 그 구역으로 스크롤한다. */
function focusErrorField(path: string) {
  const { section, domId } = fieldErrorTarget(path)
  const el = document.getElementById(domId)
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) {
    el.focus()
    return
  }
  if (section) scrollToSection(PATTERN_FORM_NAMESPACE, section)
}

export type OpsPatternFormProps = {
  /** 머리(되돌아가기·제목·상태 글자). 서버 컴포넌트가 만들어 넘긴다. */
  header: ReactNode
  /** 폼의 처음 값. 만들기는 빈 초안, 고치기는 읽어 온 패턴을 바꾼 초안이다. */
  initial: PatternDraft
} & ({ mode: 'create' } | { mode: 'edit'; patternNo: string; updatedAt: string })

export function OpsPatternForm(props: OpsPatternFormProps) {
  const { header, initial } = props
  const router = useRouter()
  const [base] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<OpsPatternFieldErrors>({})
  const [failure, setFailure] = useState<FormFailure | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reloadOpen, setReloadOpen] = useState(false)
  const [reloading, startReload] = useTransition()

  const editing = props.mode === 'edit'
  const changed = useMemo(() => changedFields(base, draft), [base, draft])
  const dirty = changed.length > 0

  // 한 번 저장을 눌러 본 뒤에는 고치는 대로 다시 검사해, 고친 칸의 오류가 바로 사라진다.
  const clientErrors = useMemo<OpsPatternFieldErrors>(() => {
    if (!submitted) return {}
    const checked = validateOpsPatternInput(inputFromDraft(draft))
    return checked.ok ? {} : checked.fieldErrors
  }, [submitted, draft])
  const errors: OpsPatternFieldErrors = { ...serverErrors, ...clientErrors }

  usePatternLeaveGuard(dirty && !done)

  const edit = (patch: Partial<PatternDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setServerErrors({})
  }

  const target: PatternFormTarget = props.mode === 'edit' ? { mode: 'edit', patternNo: props.patternNo, expectedUpdatedAt: props.updatedAt } : { mode: 'create' }
  const detailHref = props.mode === 'edit' ? patternDetailHref(props.patternNo) : null
  const cancelHref = detailHref ?? patternListHref()

  const save = async () => {
    if (!dirty || saving || done || reloading) return
    setSubmitted(true)
    setFailure(null)
    setServerErrors({})
    setSaving(true)
    const result = await submitPatternForm(target, draft)
    setSaving(false)
    switch (result.kind) {
      case 'invalid':
        focusErrorField(orderedErrorPaths(result.fieldErrors)[0])
        return
      case 'created':
        setDone(true)
        toast.success(createdToastText(result.patternNo))
        router.push(patternDetailHref(result.patternNo))
        return
      case 'saved':
        setDone(true)
        if (result.changed) toast.success(SAVED_LIVE_MESSAGE)
        else toast.message(PATTERN_UNCHANGED_TOAST)
        router.push(cancelHref)
        return
      case 'conflict':
        setFailure({ kind: editing ? 'conflict' : 'create-conflict', message: result.message })
        return
      case 'fieldErrors': {
        setServerErrors(result.fieldErrors)
        const paths = orderedErrorPaths(result.fieldErrors)
        // 어느 칸에도 붙지 않는 오류가 있으면 문장을 알림으로도 알린다.
        if (paths.some((path) => fieldErrorTarget(path).section === null)) setFailure({ kind: 'error', message: result.message })
        focusErrorField(paths[0])
        return
      }
      case 'failed':
        setFailure({ kind: 'error', message: result.message })
        return
    }
  }

  const leave = () => {
    setDone(true)
    setCancelOpen(false)
    router.push(cancelHref)
  }

  const reload = () => {
    setReloadOpen(false)
    startReload(() => router.refresh())
  }

  const rail = (
    <>
      <RailCard title="목차">
        <SectionNav namespace={PATTERN_FORM_NAMESPACE} items={PATTERN_FORM_SECTIONS.map(({ id, label }) => ({ id, label }))} />
      </RailCard>
      <RailCard className={RAIL_ACTIONS_CLASS}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={!dirty || saving || done || reloading} onClick={save}>
              {saving ? SAVING_LABEL : failure?.kind === 'error' ? RETRY_SAVE_LABEL : SAVE_LABEL}
            </Button>
            {dirty && !done && <UnsavedChip />}
          </div>
          {editing && <ChangedFieldsList fields={changed} />}
          <PatternFailureAlerts failure={failure} reloading={reloading} onReload={() => setReloadOpen(true)} />
          <p className="text-xs text-muted-foreground">{PATTERN_FORM_NOTE}</p>
          {dirty && !done ? (
            <Button type="button" variant="outline" disabled={saving} onClick={() => setCancelOpen(true)}>
              {PATTERN_FORM_CANCEL_LABEL}
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={cancelHref}>{PATTERN_FORM_CANCEL_LABEL}</Link>
            </Button>
          )}
        </div>
      </RailCard>
    </>
  )

  const [basic, menus, knobs, samples, pitfalls] = PATTERN_FORM_SECTIONS

  const main = (
    <>
      <SectionCard namespace={PATTERN_FORM_NAMESPACE} id={basic.id} title={basic.label} description={basic.description}>
        <TextField path="name" label="이름" required max={PATTERN_NAME_MAX} value={draft.name} error={errors.name} onChange={(name) => edit({ name })} />
        <TextField
          path="principle"
          label="작동 원리"
          required
          rows={4}
          max={PATTERN_LONG_TEXT_MAX}
          value={draft.principle}
          error={errors.principle}
          onChange={(principle) => edit({ principle })}
        />
        <TextField
          path="userExperience"
          label="유저가 겪는 것"
          required
          rows={4}
          max={PATTERN_LONG_TEXT_MAX}
          value={draft.userExperience}
          error={errors.userExperience}
          onChange={(userExperience) => edit({ userExperience })}
        />
      </SectionCard>
      <SectionCard namespace={PATTERN_FORM_NAMESPACE} id={menus.id} title={menus.label} description={menus.description}>
        <MenuChips menus={draft.menus} errors={errors} onChange={(next) => edit({ menus: next })} />
        <CardShapeRows rows={draft.cardShapes} errors={errors} onChange={(cardShapes) => edit({ cardShapes })} />
      </SectionCard>
      <SectionCard namespace={PATTERN_FORM_NAMESPACE} id={knobs.id} title={knobs.label} description={knobs.description}>
        <KnobGroups knobs={draft.knobs} errors={errors} onChange={(key, values) => edit({ knobs: { ...draft.knobs, [key]: values } })} />
      </SectionCard>
      <SectionCard namespace={PATTERN_FORM_NAMESPACE} id={samples.id} title={samples.label} description={samples.description}>
        <SampleRows rows={draft.samples} errors={errors} onChange={(next) => edit({ samples: next })} />
      </SectionCard>
      <SectionCard namespace={PATTERN_FORM_NAMESPACE} id={pitfalls.id} title={pitfalls.label} description={pitfalls.description}>
        <TextField
          path="pitfalls"
          label="주의점"
          rows={4}
          max={PATTERN_LONG_TEXT_MAX}
          value={draft.pitfalls}
          error={errors.pitfalls}
          onChange={(next) => edit({ pitfalls: next })}
        />
      </SectionCard>
    </>
  )

  return (
    <>
      <EditorShell railLabel="패턴 저장" header={header} rail={rail} main={main} />
      <OpsConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        tone="destructive"
        title={PATTERN_DISCARD_TITLE}
        description={<p>{PATTERN_CANCEL_DESCRIPTION}</p>}
        confirmLabel="나가기"
        cancelLabel="계속 쓰기"
        onConfirm={leave}
      />
      <OpsConfirmDialog
        open={reloadOpen}
        onOpenChange={setReloadOpen}
        tone="destructive"
        title={PATTERN_DISCARD_TITLE}
        description={<p>{PATTERN_RELOAD_DESCRIPTION}</p>}
        confirmLabel="불러오기"
        cancelLabel="계속 쓰기"
        onConfirm={reload}
      />
    </>
  )
}

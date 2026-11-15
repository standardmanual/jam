'use client'

/**
 * 템플릿 색과 이름·값 글자를 조정하는 패널 (티켓 20261116_0653). 표시와 콜백만 맡고 상태를 들지 않는다.
 */
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Input } from '@/components/admin/ui/input'
import SliderRow from '@/app/admin/asset-generator/SliderRow'
import {
  FONT_WEIGHT_RANGE,
  formatDegree,
  formatPercent,
  formatWeight,
} from '@/app/admin/asset-generator/assetGeneratorHelpers'
import { parseFontWeight } from '@/lib/admin/activityBadgeTemplate/composeTemplate'
import {
  COLOR_FAMILIES,
  dominantHue,
  hueShiftForFamily,
  type ColorCount,
} from '@/lib/admin/activityBadgeTemplate/templateColors'
import {
  isDefaultTemplateBadgeParams,
  TEMPLATE_PARAM_RANGES,
  type SlotTextParams,
  type TemplateBadgeParams,
} from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateSlotName, TemplateSlots } from '@/lib/admin/activityBadgeTemplate/templateSvg'
import TemplateFontField from './TemplateFontField'

const WRAP = 'break-keep wrap-break-word'
const GROUP_TITLE = `text-sm font-medium ${WRAP}`
const ROW_LABEL = `text-sm text-foreground ${WRAP}`
const HINT = `text-xs text-muted-foreground ${WRAP}`
const SLOT_GROUPS: { name: TemplateSlotName; title: string }[] = [
  { name: 'name', title: '이름 글자' },
  { name: 'value', title: '값 글자' },
]

export interface BadgeAdjustPanelProps {
  params: TemplateBadgeParams
  onChange: (next: TemplateBadgeParams) => void
  onReset: () => void
  colors: ColorCount[]
  slots: TemplateSlots
}

function ColorSection({ params, onChange, colors }: Pick<BadgeAdjustPanelProps, 'params' | 'onChange' | 'colors'>) {
  const c = params.color
  const setColor = (patch: Partial<typeof c>) => onChange({ ...params, color: { ...c, ...patch } })
  const hasDominant = dominantHue(colors) !== null

  function setOverride(color: string, next: string | null) {
    const overrides = { ...c.overrides }
    if (next === null) delete overrides[color]
    else overrides[color] = next.toUpperCase()
    setColor({ overrides })
  }

  return (
    <section className="space-y-3">
      <h3 className={GROUP_TITLE}>템플릿 색</h3>
      <div className="space-y-1.5">
        <span className={ROW_LABEL}>색 계열</span>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_FAMILIES.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasDominant}
              onClick={() => {
                const shift = hueShiftForFamily(colors, f.hue)
                if (shift !== null) setColor({ hueShift: Math.round(shift) })
              }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-full border"
                style={{ backgroundColor: `hsl(${f.hue} 70% 50%)` }}
              />
              {f.label}
            </Button>
          ))}
        </div>
        {!hasDominant && <p className={HINT}>이 템플릿에는 색 계열을 바꿀 색이 없어요</p>}
      </div>
      <SliderRow
        label="색상"
        value={c.hueShift}
        {...TEMPLATE_PARAM_RANGES.hueShift}
        format={formatDegree}
        onChange={(v) => setColor({ hueShift: v })}
      />
      <SliderRow
        label="채도"
        value={c.saturation}
        {...TEMPLATE_PARAM_RANGES.saturation}
        format={formatPercent}
        onChange={(v) => setColor({ saturation: v })}
      />
      <SliderRow
        label="명도"
        value={c.lightness}
        {...TEMPLATE_PARAM_RANGES.lightness}
        format={formatPercent}
        onChange={(v) => setColor({ lightness: v })}
      />
      <div className="space-y-1.5">
        <span className={ROW_LABEL}>색 칸</span>
        <p className={HINT}>템플릿에 쓰인 색이에요. 칸을 눌러 하나씩 바꿀 수 있어요</p>
        {colors.length === 0 ? (
          <p className={HINT}>바꿀 수 있는 색이 없어요</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {colors.map(({ color }) => (
              <div key={color} className="flex flex-col items-start gap-1">
                <Input
                  type="color"
                  aria-label={color}
                  value={c.overrides[color] ?? color}
                  onChange={(e) => setOverride(color, e.target.value)}
                  className="h-9 w-14 p-1"
                />
                {color in c.overrides && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setOverride(color, null)}>
                    되돌리기
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SlotSection({
  title,
  name,
  params,
  onChange,
  slots,
}: { title: string; name: TemplateSlotName } & Pick<BadgeAdjustPanelProps, 'params' | 'onChange' | 'slots'>) {
  const t = params.text[name]
  const slot = slots[name]
  const setText = (patch: Partial<SlotTextParams>) =>
    onChange({ ...params, text: { ...params.text, [name]: { ...t, ...patch } } })

  return (
    <section className="space-y-3">
      <h3 className={GROUP_TITLE}>{title}</h3>
      <div className="flex items-center justify-between gap-2">
        <span className={ROW_LABEL}>색</span>
        <div className="flex items-center gap-2">
          {t.color !== null && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setText({ color: null })}>
              템플릿 색으로
            </Button>
          )}
          <Input
            type="color"
            aria-label={`${title} 색`}
            value={t.color ?? slot.fill ?? '#000000'}
            onChange={(e) => setText({ color: e.target.value.toUpperCase() })}
            className="h-9 w-16 p-1"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <span className={ROW_LABEL}>글꼴</span>
        <TemplateFontField value={t.fontFamily} onChange={(family) => setText({ fontFamily: family })} />
      </div>
      <SliderRow
        label="굵기"
        value={t.fontWeight ?? parseFontWeight(slot.fontWeight)}
        {...FONT_WEIGHT_RANGE}
        format={formatWeight}
        onChange={(v) => setText({ fontWeight: v })}
      />
      <SliderRow
        label="크기"
        value={t.sizeScalePct}
        {...TEMPLATE_PARAM_RANGES.sizeScalePct}
        format={formatPercent}
        onChange={(v) => setText({ sizeScalePct: v })}
      />
    </section>
  )
}

export default function BadgeAdjustPanel({ params, onChange, onReset, colors, slots }: BadgeAdjustPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className={WRAP}>조정</CardTitle>
        <Button type="button" size="sm" variant="outline" disabled={isDefaultTemplateBadgeParams(params)} onClick={onReset}>
          처음으로
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <ColorSection params={params} onChange={onChange} colors={colors} />
        {SLOT_GROUPS.map((g) => (
          <SlotSection key={g.name} title={g.title} name={g.name} params={params} onChange={onChange} slots={slots} />
        ))}
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import type { HealthState } from '../../health/useHealth'
import { useBodySection } from '../../health/useBodySection'
import { friendlyDateShort, toLocalDateString } from '../../lib/dates'
import { Sparkline } from '../charts/Sparkline'
import type { Tone } from '../charts/tones'
import { SectionFrame } from './SectionFrame'

type Tile = {
  id: string
  label: string
  value: string
  unit?: string
  note: string
  series: number[]
  tone: Tone
  date: string
}

export function VitalsSection({ health }: { health: HealthState }) {
  const { data, loading, error, retry } = useBodySection(health, 'vitals')
  const [open, setOpen] = useState<string | null>(null)
  const today = toLocalDateString()

  const tiles: Tile[] = []
  const spo2 = data?.spo2 ?? []
  const lastSpo2 = spo2[spo2.length - 1]
  if (lastSpo2) {
    tiles.push({
      id: 'spo2',
      label: 'Blood oxygen',
      value: lastSpo2.avg.toFixed(1),
      unit: '%',
      note: lastSpo2.low != null && lastSpo2.high != null ? `Range ${lastSpo2.low}–${lastSpo2.high}%` : 'Nightly average',
      series: spo2.map((d) => d.avg),
      tone: 'ice',
      date: lastSpo2.date,
    })
  }
  const breathing = data?.breathing ?? []
  const lastBreath = breathing[breathing.length - 1]
  if (lastBreath) {
    tiles.push({
      id: 'breathing',
      label: 'Breathing rate',
      value: lastBreath.bpm.toFixed(1),
      unit: ' /min',
      note: 'Breaths per minute asleep',
      series: breathing.map((d) => d.bpm),
      tone: 'accent',
      date: lastBreath.date,
    })
  }
  const temp = data?.skinTemp ?? []
  const lastTemp = temp[temp.length - 1]
  if (lastTemp) {
    tiles.push({
      id: 'temp',
      label: 'Skin temp',
      value: `${lastTemp.deltaC > 0 ? '+' : ''}${lastTemp.deltaC.toFixed(1)}`,
      unit: '°C',
      note: 'vs your baseline',
      series: temp.map((d) => d.deltaC),
      tone: 'rem',
      date: lastTemp.date,
    })
  }
  const weight = data?.weight ?? []
  const lastWeight = weight[weight.length - 1]
  if (lastWeight) {
    tiles.push({
      id: 'weight',
      label: 'Weight',
      value: lastWeight.kg.toFixed(1),
      unit: ' kg',
      note: `Logged ${friendlyDateShort(lastWeight.date)}`,
      series: weight.map((d) => d.kg),
      tone: 'muted',
      date: lastWeight.date,
    })
  }

  return (
    <SectionFrame title="Night vitals" loading={loading} error={error} empty={!tiles.length} onRetry={retry}>
      <div className="vitals-grid">
        {tiles.map((t) => {
          const expanded = open === t.id
          return (
            <button
              key={t.id}
              type="button"
              className={`body-tile vitals-tile${expanded ? ' expanded' : ''}`}
              onClick={() => setOpen(expanded ? null : t.id)}
              aria-expanded={expanded}
            >
              <span className="label">{t.label}</span>
              <span className="body-tile-value">
                {t.value}
                {t.unit && <small>{t.unit}</small>}
              </span>
              <span className="vitals-note">
                {t.note}
                {t.id !== 'weight' && t.date !== today ? ` · ${friendlyDateShort(t.date)}` : ''}
              </span>
              {expanded && t.series.length > 1 && (
                <Sparkline values={t.series} tone={t.tone === 'muted' ? 'accent' : t.tone} height={44} ariaLabel={`${t.label}, recent trend`} />
              )}
            </button>
          )
        })}
      </div>
    </SectionFrame>
  )
}

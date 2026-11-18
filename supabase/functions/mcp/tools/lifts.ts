import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  bad,
  Confirm,
  type Ctx,
  defineTool,
  LIFT_COLUMNS,
  LiftSets,
  mapPgError,
  must,
  MuscleGroup,
  ok,
  resolveZone,
  TimeZone,
  ToolError,
  Uuid,
  WeightUnit,
} from '../common.ts'
import {
  convertSets,
  escapeLike,
  type HistoryPoint,
  type LiftSet,
  metricsOf,
  MUSCLE_GROUPS,
  newPrKinds,
  parseSetsDetail,
  personalBests,
  PR_KIND_OUT,
  prEvents,
  round1,
  setsEqual,
  volumeOf,
} from '../domain.ts'
import { localParts } from '../../_shared/localTime.ts'
import { normalizeLift, toLift } from '../shapes.ts'

async function getLiftRow(c: Ctx, id: string) {
  const row = must(await c.db.from('tracked_lifts').select(LIFT_COLUMNS).eq('id', id).eq('user_id', c.userId).maybeSingle())
  if (!row) throw new ToolError('not_found', 'No lift with that id.')
  return row
}

type HistRow = { sets_detail: unknown; unit: string; recorded_at: string }
const toPoint = (h: HistRow): HistoryPoint => ({
  sets_detail: parseSetsDetail(h.sets_detail),
  unit: h.unit,
  recorded_at: h.recorded_at,
})

async function liftHistory(c: Ctx, liftId: string) {
  return (must(
    await c.db.from('lift_history').select('id, sets_detail, unit, volume, recorded_at').eq('user_id', c.userId)
      .eq('lift_id', liftId).order('recorded_at', { ascending: false }).limit(1000),
  ) ?? []) as (HistRow & { id: string })[]
}

export function registerLiftTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'list_lifts', {
    title: 'List tracked lifts',
    description:
      "Lists the exercises on the user's lift board with their current working sets (reps × weight per set), unit, estimated 1RM and the sets before the last change. Weights are in each lift's own unit (kg or lb). Use the id with get_lift_progress or log_lift_session.",
    input: {
      muscle_group: MuscleGroup.optional().describe('Only lifts in this group'),
      q: z.string().trim().min(1).max(60).optional().describe('Case-insensitive name filter'),
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      let q = c.db.from('tracked_lifts').select(LIFT_COLUMNS).eq('user_id', c.userId)
      if (a.muscle_group) q = q.eq('muscle_group', a.muscle_group)
      if (a.q) q = q.ilike('exercise_name', `%${escapeLike(a.q)}%`)
      const rows = must(
        await q.order('sort_order').order('updated_at', { ascending: false }).limit(200),
      ) ?? []
      const rank = (g: string) => {
        const i = (MUSCLE_GROUPS as readonly string[]).indexOf(g)
        return i === -1 ? MUSCLE_GROUPS.length : i
      }
      // Array.prototype.sort is stable, so sort_order/updated_at order holds inside a group
      const sorted = [...rows].sort((x, y) => rank(x.muscle_group) - rank(y.muscle_group))
      return ok({ lifts: sorted.map(toLift) })
    },
  })

  defineTool(server, ctx, 'get_lift_progress', {
    title: 'Lift progress',
    description:
      "Returns one lift's history of logged sets with estimated 1RM, heaviest weight and volume per entry, plus personal bests and the PRs along the way, all in the lift's current unit. History is oldest first and dated in the user's local time.",
    input: {
      lift_id: Uuid.describe('Lift id from list_lifts'),
      limit: z.number().int().min(1).max(200).default(30).describe('Most recent history entries to return'),
      time_zone: TimeZone,
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const liftRow = await getLiftRow(c, a.lift_id)
      const lift = toLift(liftRow)
      const u = lift.unit
      const all = (await liftHistory(c, a.lift_id)).reverse() // oldest first
      const day = (iso: string) => localParts(new Date(iso), zone.timeZone).day

      const points = all.map(toPoint)
      const entries = all.map((h, i) => {
        const m = metricsOf(convertSets(points[i].sets_detail, points[i].unit === 'lb' ? 'lb' : 'kg', u))
        return {
          entry_id: h.id,
          recorded_at: h.recorded_at,
          date: day(h.recorded_at),
          sets: points[i].sets_detail,
          stored_unit: h.unit === 'lb' ? 'lb' : 'kg',
          est_1rm: round1(m.oneRepMax),
          heaviest: round1(m.heaviest),
          volume: round1(m.volume),
        }
      })

      const pb = personalBests(points, u)
      const prs = prEvents(points, u)
        .sort((x, y) => y.recorded_at.localeCompare(x.recorded_at))
        .slice(0, 10)
        .map((e) => ({ kind: PR_KIND_OUT[e.kind], value: round1(e.value), date: day(e.recorded_at) }))
      return ok({
        lift,
        unit: u,
        time_zone: zone.timeZone,
        personal_bests: {
          est_1rm: pb.oneRepMax ? { value: round1(pb.oneRepMax.value), date: day(pb.oneRepMax.recorded_at) } : null,
          heaviest: pb.heaviest
            ? { value: round1(pb.heaviest.value), reps: pb.heaviest.reps, date: day(pb.heaviest.recorded_at) }
            : null,
          volume: pb.volume ? { value: round1(pb.volume.value), date: day(pb.volume.recorded_at) } : null,
        },
        prs,
        history: entries.slice(-a.limit),
        total_entries: entries.length,
        change_since_first: entries.length > 1
          ? { est_1rm: round1(entries[entries.length - 1].est_1rm - entries[0].est_1rm) }
          : null,
      })
    },
  })

  defineTool(server, ctx, 'create_lift', {
    title: 'Add a lift',
    description:
      "Adds an exercise to the lift board with its current working sets and records them as the first history entry. The unit defaults to the user's weight unit. Check list_lifts first: to log a new session for an existing exercise, use log_lift_session instead.",
    input: {
      name: z.string().trim().min(1).max(60).describe("Exercise name, e.g. 'Bench press'"),
      muscle_group: MuscleGroup.describe('Muscle group it belongs to'),
      sets: LiftSets,
      unit: WeightUnit.optional().describe("Unit for the set weights; defaults to the user's weight_unit setting"),
      allow_duplicate: z.boolean().default(false)
        .describe('Set true to add a lift with the same name as an existing one'),
    },
    hints: { ro: false, idempotent: false },
    run: async (a, c) => {
      if (!a.allow_duplicate) {
        const dup = must(
          await c.db.from('tracked_lifts').select('id').eq('user_id', c.userId)
            .ilike('exercise_name', escapeLike(a.name)).limit(1),
        ) ?? []
        if (dup.length) {
          throw new ToolError(
            'conflict',
            `A lift named '${a.name}' already exists (id ${dup[0].id}). Use log_lift_session to record new sets, or pass allow_duplicate: true.`,
          )
        }
      }
      let unit = a.unit
      if (!unit) {
        const p = must(await c.db.from('profiles').select('weight_unit').eq('id', c.userId).single())
        unit = p.weight_unit === 'lb' ? 'lb' : 'kg'
      }
      const now = new Date().toISOString()
      const cnt = await c.db.from('tracked_lifts').select('id', { count: 'exact', head: true })
        .eq('user_id', c.userId).eq('muscle_group', a.muscle_group)
      if (cnt.error) throw mapPgError(cnt.error)
      const id = crypto.randomUUID()
      const row = must(
        await c.db.from('tracked_lifts').insert({
          id,
          user_id: c.userId,
          muscle_group: a.muscle_group,
          exercise_name: a.name,
          sets: a.sets.length,
          reps: a.sets[0].reps,
          weight: a.sets[0].weight,
          unit,
          sets_detail: a.sets,
          prev_sets: null,
          prev_reps: null,
          prev_weight: null,
          prev_sets_detail: null,
          sort_order: cnt.count ?? 0,
          updated_at: now,
        }).select(LIFT_COLUMNS).single(),
      )
      const hist = await c.db.from('lift_history').insert({
        id: crypto.randomUUID(),
        user_id: c.userId,
        lift_id: id,
        sets_detail: a.sets,
        unit,
        volume: volumeOf(a.sets),
        recorded_at: now,
      })
      if (hist.error) console.error('history insert failed', hist.error.code ?? '')
      return ok({ created: true, lift: toLift(row), ...(hist.error ? { warning: 'History entry was not saved' } : {}) })
    },
  })

  defineTool(server, ctx, 'log_lift_session', {
    title: 'Log sets for a lift',
    description:
      "Records a new session for a lift on the board: the sets you pass become its current sets, the old ones are kept as 'previous', a history entry is added, and any new PRs are reported. If the sets and unit match the current ones exactly, nothing is recorded (as in the app). The entry is timestamped now.",
    input: {
      lift_id: Uuid.describe('Lift id from list_lifts'),
      sets: LiftSets,
      unit: WeightUnit.optional()
        .describe("Unit of these weights; defaults to the lift's current unit. Changing it does not convert old entries."),
    },
    hints: { ro: false, idempotent: false },
    run: async (a, c) => {
      const row = await getLiftRow(c, a.lift_id)
      const lift = normalizeLift(row)
      const u = a.unit ?? lift.unit
      const sets: LiftSet[] = a.sets
      if (setsEqual(sets, lift.sets) && u === lift.unit) {
        return ok({
          recorded: false,
          reason: 'Same sets as the current ones; nothing to record.',
          lift: toLift(row),
        })
      }
      // Read BEFORE inserting so the new entry can't compete with itself
      const previous = (await liftHistory(c, a.lift_id)).map(toPoint)
      const prKinds = newPrKinds(previous, sets, u)
      const now = new Date().toISOString()
      const updated = must(
        await c.db.from('tracked_lifts').update({
          sets: sets.length,
          reps: sets[0].reps,
          weight: sets[0].weight,
          unit: u,
          sets_detail: sets,
          updated_at: now,
          prev_sets: lift.sets.length,
          prev_reps: lift.sets[0]?.reps ?? 0,
          prev_weight: lift.sets[0]?.weight ?? 0,
          prev_sets_detail: lift.sets,
        }).eq('id', a.lift_id).eq('user_id', c.userId).select(LIFT_COLUMNS).single(),
      )
      const hist = await c.db.from('lift_history').insert({
        id: crypto.randomUUID(),
        user_id: c.userId,
        lift_id: a.lift_id,
        sets_detail: sets,
        unit: u,
        volume: volumeOf(sets),
        recorded_at: now,
      })
      if (hist.error) console.error('history insert failed', hist.error.code ?? '')
      return ok({
        recorded: true,
        lift: toLift(updated),
        new_prs: prKinds.map((k) => PR_KIND_OUT[k]),
        ...(hist.error ? { warning: 'History entry was not saved' } : {}),
      })
    },
  })

  defineTool(server, ctx, 'update_lift', {
    title: 'Rename or move a lift',
    description: 'Renames a lift or moves it to another muscle group without recording a session. To log new sets, use log_lift_session.',
    input: {
      lift_id: Uuid.describe('Lift id'),
      name: z.string().trim().min(1).max(60).optional().describe('New exercise name'),
      muscle_group: MuscleGroup.optional().describe('New muscle group'),
    },
    hints: { ro: false, idempotent: true },
    run: async (a, c) => {
      if (a.name === undefined && a.muscle_group === undefined) throw bad('Pass a new name or muscle_group.')
      const patch: Record<string, string> = { updated_at: new Date().toISOString() }
      if (a.name !== undefined) patch.exercise_name = a.name
      if (a.muscle_group !== undefined) patch.muscle_group = a.muscle_group
      const row = must(
        await c.db.from('tracked_lifts').update(patch).eq('id', a.lift_id).eq('user_id', c.userId)
          .select(LIFT_COLUMNS).single(),
      )
      return ok({ updated: true, lift: toLift(row) })
    },
  })

  defineTool(server, ctx, 'delete_lift', {
    title: 'Delete a lift',
    description:
      'Permanently removes a lift from the board along with its entire progress history and PRs. This cannot be undone, so only call after the user has confirmed. Session logs are not affected.',
    input: { lift_id: Uuid.describe('Lift id'), confirm: Confirm },
    hints: { ro: false, destructive: true, idempotent: true },
    run: async (a, c) => {
      const lift = must(
        await c.db.from('tracked_lifts').select('id, exercise_name').eq('id', a.lift_id).eq('user_id', c.userId)
          .maybeSingle(),
      )
      if (!lift) throw new ToolError('not_found', 'No lift with that id.')
      const cnt = await c.db.from('lift_history').select('id', { count: 'exact', head: true })
        .eq('lift_id', a.lift_id).eq('user_id', c.userId)
      if (cnt.error) throw mapPgError(cnt.error)
      const del = await c.db.from('tracked_lifts').delete().eq('id', a.lift_id).eq('user_id', c.userId)
      if (del.error) throw mapPgError(del.error) // lift_history rows cascade
      return ok({ deleted: true, id: a.lift_id, name: lift.exercise_name, history_entries_removed: cnt.count ?? 0 })
    },
  })

  defineTool(server, ctx, 'delete_lift_entry', {
    title: 'Delete a lift history entry',
    description:
      "Permanently deletes one entry from a lift's progress history, for example a session logged by mistake. It does not change the lift's current sets; log_lift_session again if those are wrong too. Only call after the user has confirmed.",
    input: { entry_id: Uuid.describe('entry_id from get_lift_progress'), confirm: Confirm },
    hints: { ro: false, destructive: true, idempotent: true },
    run: async (a, c) => {
      const row = must(
        await c.db.from('lift_history').select('id, lift_id, recorded_at').eq('id', a.entry_id)
          .eq('user_id', c.userId).maybeSingle(),
      )
      if (!row) throw new ToolError('not_found', 'No history entry with that id.')
      const del = await c.db.from('lift_history').delete().eq('id', a.entry_id).eq('user_id', c.userId)
      if (del.error) throw mapPgError(del.error)
      return ok({ deleted: true, entry_id: row.id, lift_id: row.lift_id, recorded_at: row.recorded_at })
    },
  })
}

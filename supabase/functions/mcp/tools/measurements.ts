import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  checkMeasurementDate,
  Confirm,
  type Ctx,
  defineTool,
  LocalDate,
  mapPgError,
  MEASUREMENT_COLUMNS,
  must,
  ok,
  resolveZone,
  TimeZone,
  ToolError,
  Uuid,
} from '../common.ts'
import { round1 } from '../domain.ts'
import { toMeasurement } from '../shapes.ts'

export function registerMeasurementTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'add_measurement', {
    title: 'Log body weight',
    description:
      'Saves a body-weight measurement in kilograms, optionally with body fat %, for a date (default today). Convert pounds first (lb × 0.4536). GRIND Age uses the latest measurement from the last 60 days.',
    input: {
      weight_kg: z.number().min(25).max(350).describe('Body weight in kg (25–350), stored to 0.1 kg'),
      body_fat_pct: z.number().min(3).max(70).optional().describe('Body fat percentage (3–70), optional'),
      date: LocalDate.optional().describe('Measurement date, YYYY-MM-DD; defaults to today. Cannot be in the future.'),
      time_zone: TimeZone,
    },
    hints: { ro: false, idempotent: false },
    run: async (a, c) => {
      const zone = await resolveZone(c, a.time_zone)
      const date = a.date ?? zone.today
      checkMeasurementDate(date, zone.today)
      const row = must(
        await c.db.from('body_measurements').insert({
          user_id: c.userId,
          measured_on: date,
          weight_kg: round1(a.weight_kg),
          body_fat_pct: a.body_fat_pct == null ? null : round1(a.body_fat_pct),
        }).select(MEASUREMENT_COLUMNS).single(),
      )
      return ok({
        created: true,
        measurement: toMeasurement(row),
        note: 'GRIND Age refreshes weekly; call get_grind_age with refresh: true to recompute now.',
      })
    },
  })

  defineTool(server, ctx, 'list_measurements', {
    title: 'List body measurements',
    description:
      "Lists the user's body-weight measurements (kg, with optional body fat %), newest first, optionally within a date range (inclusive, YYYY-MM-DD).",
    input: {
      from: LocalDate.optional().describe('Earliest date (inclusive)'),
      to: LocalDate.optional().describe('Latest date (inclusive)'),
      limit: z.number().int().min(1).max(200).default(30).describe('Max rows (max 200)'),
    },
    hints: { ro: true, idempotent: true },
    run: async (a, c) => {
      let q = c.db.from('body_measurements').select(MEASUREMENT_COLUMNS).eq('user_id', c.userId)
      if (a.from) q = q.gte('measured_on', a.from)
      if (a.to) q = q.lte('measured_on', a.to)
      const rows = must(
        await q.order('measured_on', { ascending: false }).order('created_at', { ascending: false }).limit(a.limit),
      ) ?? []
      const list = rows.map(toMeasurement)
      return ok({ measurements: list, latest: list[0] ?? null })
    },
  })

  defineTool(server, ctx, 'delete_measurement', {
    title: 'Delete a measurement',
    description:
      "Permanently deletes one body measurement. Measurements can't be edited, so delete and re-add to correct one. Only call after the user has confirmed.",
    input: { id: Uuid.describe('Measurement id from list_measurements'), confirm: Confirm },
    hints: { ro: false, destructive: true, idempotent: true },
    run: async (a, c: Ctx) => {
      const row = must(
        await c.db.from('body_measurements').select(MEASUREMENT_COLUMNS).eq('id', a.id).eq('user_id', c.userId)
          .maybeSingle(),
      )
      if (!row) throw new ToolError('not_found', 'No measurement with that id.')
      const del = await c.db.from('body_measurements').delete().eq('id', a.id).eq('user_id', c.userId)
      if (del.error) throw mapPgError(del.error)
      return ok({ deleted: true, measurement: toMeasurement(row) })
    },
  })
}

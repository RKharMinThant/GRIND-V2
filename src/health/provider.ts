import type {
  BodySectionData,
  BodySectionId,
  DailySteps,
  HealthConnection,
  HealthRecovery,
  HealthSource,
  HealthWorkout,
  TodaySummary,
} from './types'

/** Where health data comes from. Phase 1: mock. Phase 2: Google Health API. */
export interface HealthProvider {
  source: HealthSource
  getConnection(): Promise<HealthConnection>
  connect(): Promise<void>
  disconnect(): Promise<void>
  getWorkouts(fromDate: string, toDate: string): Promise<HealthWorkout[]>
  getRecovery(date: string): Promise<HealthRecovery | null>
  getDailySteps(fromDate: string, toDate: string): Promise<DailySteps[]>
  /** Record a successful sync time. */
  markSynced(): Promise<void>
  /** Home Today strip (steps, zone minutes, distance, calories). */
  getToday(date: string): Promise<TodaySummary | null>
  /** One Body tab section for the day ending at `date`. */
  getBodySection<S extends BodySectionId>(section: S, date: string): Promise<BodySectionData[S]>
}

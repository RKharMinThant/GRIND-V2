import { createContext, useContext } from 'react'

export type SheetApi = { close: () => void; dismissible: boolean }

export const SheetContext = createContext<SheetApi | null>(null)

/** Close the surrounding sheet with its exit animation (use for Cancel / Close buttons). */
export function useSheetClose(): () => void {
  const ctx = useContext(SheetContext)
  return ctx?.close ?? (() => {})
}

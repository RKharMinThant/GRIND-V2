import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { spring } from 'motion'
import { SheetContext, useSheetClose, type SheetApi } from '../hooks/useSheetClose'
import { SheetValue, useSheetDrag, type SheetRelease, shouldDismiss } from '../hooks/useSheetDrag'

type Playback = { stop: () => void; finished: Promise<void> }

type Motion =
  /** Spring defined by response (s, ≈ time to reach the target) and damping ratio (1 = no overshoot). */
  | { response: number; damping: number; velocity?: number }
  /** Short ease-out fade/slide for reduced motion. */
  | { tween: number }

/**
 * Animate `value` to `target` from wherever it is now. A spring takes the finger's release
 * velocity (px/s, signed like the value) so the hand-off from drag to animation has no seam.
 */
function animate(value: SheetValue, target: number, motion: Motion): Playback {
  const from = value.get()
  let frame = 0
  let settle: () => void = () => {}
  const finished = new Promise<void>((resolve) => {
    settle = resolve
  })
  const start = performance.now()
  let step: (elapsed: number) => { value: number; done: boolean }
  if ('tween' in motion) {
    const total = motion.tween
    step = (t) => {
      const p = Math.min(1, t / total)
      return { value: from + (target - from) * (1 - Math.pow(1 - p, 3)), done: p >= 1 }
    }
  } else {
    const omega = (2 * Math.PI) / motion.response
    const generator = spring({
      keyframes: [from, target],
      stiffness: omega * omega,
      damping: 2 * motion.damping * omega,
      mass: 1,
      velocity: motion.velocity ?? 0,
    })
    step = (t) => generator.next(t)
  }
  const tick = (now: number) => {
    const { value: next, done } = step(now - start)
    value.set(done ? target : next)
    if (done) settle()
    else frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return {
    stop: () => {
      cancelAnimationFrame(frame)
      settle()
    },
    finished,
  }
}

const SETTLE: Motion = { response: 0.35, damping: 1 }
/** A little bounce, only when the gesture carried momentum. */
const momentumSpring = (velocity: number): Motion => ({ response: 0.42, damping: 0.82, velocity })

/**
 * The one bottom-sheet primitive. iOS behaviour:
 *  - slides up on a critically damped spring while the scrim fades in
 *  - drag the grabber / header (or the content while it is scrolled to the top) to dismiss,
 *    1:1 with the finger; a flick or a pull past ~25 % closes it, otherwise it springs back
 *  - pulling up rubber-bands; grabbing a sheet mid-animation takes over from where it is
 *  - Esc and a scrim tap close it; focus is kept inside; reduced motion cross-fades only
 *
 * `open` is the source of truth. Gesture closes call `onClose` once the sheet has left the
 * screen; if the parent keeps `open` true (e.g. it is saving) the sheet springs back.
 * Content stays mounted through the exit, so parents that blank their data on close should
 * keep a copy until the sheet is gone.
 */
export type SheetProps = {
  open: boolean
  onClose: () => void
  /**
   * False while a save/delete is in flight, or while the form holds unsaved input: drag, scrim
   * tap and Esc then do nothing. The explicit Cancel / Done button ({@link SheetCancel}) still
   * closes, so disable it while busy.
   */
  dismissible?: boolean
  /** `id` of the element naming the dialog (usually the SheetHeader title). */
  labelledBy?: string
  /** Fallback accessible name when there is no visible title. */
  label?: string
  /** Extra class on the sheet panel, e.g. `sheet--log`. */
  className?: string
  /** Header row inside the drag zone, under the grabber. Usually a {@link SheetHeader}. */
  header?: ReactNode
  /** Pinned under the scrolling content (primary action for long forms). */
  footer?: ReactNode
  children: ReactNode
  /** Ref to the scrolling content element. */
  scrollRef?: Ref<HTMLDivElement>
  /** Fires once the entrance has settled (e.g. to focus a field). */
  onOpened?: () => void
}

/* One scroll lock and one Esc/focus owner, even with two sheets mounted at once. */
let lockCount = 0
let lockPrev = ''
function lockBody() {
  if (lockCount === 0) {
    lockPrev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockCount += 1
  return () => {
    lockCount -= 1
    if (lockCount === 0) document.body.style.overflow = lockPrev
  }
}
const sheetStack: symbol[] = []
/** Each open sheet's panel and the element to give focus back to, for hand-offs between sheets. */
const sheetFocus = new Map<symbol, { panel: HTMLElement | null; returnTo: HTMLElement | null }>()

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Sheet(props: SheetProps) {
  const [mounted, setMounted] = useState(props.open)
  if (props.open && !mounted) setMounted(true)
  if (!mounted) return null
  return createPortal(<SheetPanel {...props} onExited={() => setMounted(false)} />, document.body)
}

function SheetPanel({
  open,
  onClose,
  dismissible = true,
  labelledBy,
  label,
  className,
  header,
  footer,
  children,
  scrollRef: externalScrollRef,
  onOpened,
  onExited,
}: SheetProps & { onExited: () => void }) {
  const reduced = usePrefersReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)
  const id = useRef(Symbol('sheet')).current

  const [y] = useState(() => new SheetValue(typeof window === 'undefined' ? 1000 : window.innerHeight))
  const [fade] = useState(() => new SheetValue(reduced ? 0 : 1))
  const heightRef = useRef(0)
  const getHeight = useCallback(() => {
    const h = panelRef.current?.offsetHeight ?? 0
    if (h > 0) heightRef.current = h
    return heightRef.current || window.innerHeight
  }, [])
  const scrimRef = useRef<HTMLDivElement>(null)

  /* Motion values drive the panel and scrim directly (transform / opacity only, no React renders).
     The first apply() also sets the off-screen start, so React never owns these styles. */
  useLayoutEffect(() => {
    const apply = () => {
      const offset = y.get()
      const f = fade.get()
      const h = heightRef.current || window.innerHeight
      const panel = panelRef.current
      if (panel) {
        panel.style.transform = `translate3d(0, ${offset}px, 0)`
        panel.style.opacity = String(f)
      }
      if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - offset / h)) * f)
    }
    apply()
    const stops = [y.on(apply), fade.on(apply)]
    return () => stops.forEach((stop) => stop())
  }, [y, fade])

  /* Latest props for async callbacks */
  const live = useRef({ open, onClose, dismissible, onOpened, onExited, reduced })
  live.current = { open, onClose, dismissible, onOpened, onExited, reduced }

  const anim = useRef<Playback | null>(null)
  const exit = useRef<'none' | 'running' | 'done'>('none')
  const token = useRef(0)
  const opened = useRef(false)
  const reenterTimer = useRef<number>(undefined)

  const fireOpened = useCallback(() => {
    if (opened.current) return
    opened.current = true
    live.current.onOpened?.()
  }, [])

  const stopAnim = useCallback(() => {
    anim.current?.stop()
    anim.current = null
  }, [])

  const enter = useCallback(
    () => {
      token.current += 1
      exit.current = 'none'
      opened.current = false
      stopAnim()
      getHeight()
      const t = token.current
      const done = () => {
        if (t === token.current) fireOpened()
      }
      if (live.current.reduced) {
        y.set(0)
        anim.current = animate(fade, 1, { tween: 200 })
      } else {
        fade.set(1)
        anim.current = animate(y, 0, SETTLE)
      }
      void anim.current.finished.then(done)
    },
    [y, fade, stopAnim, getHeight, fireOpened],
  )

  /** Slide (or fade) off screen. `notify`: a gesture close, so tell the parent when it lands. */
  const leave = useCallback(
    (velocity: number, notify: boolean) => {
      token.current += 1
      const t = token.current
      exit.current = 'running'
      stopAnim()
      const finish = () => {
        if (t !== token.current) return // grabbed or reopened meanwhile
        exit.current = 'done'
        if (!live.current.open) {
          live.current.onExited()
          return
        }
        if (!notify) return
        live.current.onClose()
        // Parent kept it open (busy, validation…): bring it back
        reenterTimer.current = window.setTimeout(() => {
          if (t === token.current && live.current.open) enter()
        }, 120)
      }
      if (live.current.reduced) {
        anim.current = animate(fade, 0, { tween: 180 })
      } else {
        anim.current = animate(y, getHeight() + 24, {
          response: 0.38,
          damping: 1,
          velocity: Math.max(0, velocity),
        })
      }
      void anim.current.finished.then(finish)
    },
    [y, fade, getHeight, stopAnim, enter],
  )

  /* open → entrance; open → false (parent-driven) → exit */
  useEffect(() => {
    if (open) {
      enter()
    } else if (exit.current === 'none') {
      leave(0, false)
    } else if (exit.current === 'done') {
      live.current.onExited()
    }
    // exit 'running': the finish handler sees open === false and unmounts
  }, [open, enter, leave])

  useEffect(
    () => () => {
      token.current += 1 // pending finish callbacks must not call onClose after unmount
      window.clearTimeout(reenterTimer.current)
      stopAnim()
    },
    [stopAnim],
  )

  /** Scrim tap: only when dismissible. */
  const requestClose = useCallback(() => {
    if (!live.current.dismissible) return
    leave(0, true)
  }, [leave])

  /** Cancel / Done button: always closes (callers disable it while busy). */
  const closeFromButton = useCallback(() => leave(0, true), [leave])

  /* Release after a drag */
  const onRelease = useCallback(
    ({ offset, velocity, height }: SheetRelease) => {
      const dismiss =
        live.current.dismissible && (!live.current.open || shouldDismiss(offset, velocity, height))
      if (dismiss) {
        leave(velocity, true)
      } else {
        // Spring back; a sheet grabbed during its entrance still owes its onOpened
        const t = token.current
        anim.current = animate(
          y,
          0,
          live.current.reduced
            ? { tween: 200 }
            : Math.abs(velocity) > 150
              ? momentumSpring(velocity)
              : SETTLE,
        )
        void anim.current.finished.then(() => {
          if (t === token.current) fireOpened()
        })
      }
    },
    [leave, y, fireOpened],
  )

  const onGrab = useCallback(() => {
    token.current += 1 // cancels any pending open/close completion
    if (exit.current === 'running') exit.current = 'none'
    stopAnim()
    getHeight()
  }, [stopAnim, getHeight])

  const { gripProps } = useSheetDrag({
    y,
    getHeight,
    enabled: dismissible,
    scrollRef,
    onGrab,
    onRelease,
  })

  /* Esc, focus containment, scroll lock, focus return */
  useEffect(() => {
    sheetStack.push(id)
    const unlock = lockBody()
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Opened from inside another sheet (which may be on its way out): fall back to where that one
    // would have returned focus if our own return target is gone by the time we close.
    let fallback: HTMLElement | null = null
    for (const other of sheetFocus.values()) {
      if (returnTo && other.panel?.contains(returnTo)) fallback = other.returnTo
    }
    sheetFocus.set(id, { panel: panelRef.current, returnTo })
    panelRef.current?.focus({ preventScroll: true })

    const isTop = () => sheetStack[sheetStack.length - 1] === id
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return
      if (e.key === 'Escape') {
        if (!live.current.open || !live.current.dismissible) return
        e.preventDefault()
        leave(0, true)
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (!items.length) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current
      if (!isTop() || !panel || !(e.target instanceof Node) || panel.contains(e.target)) return
      panel.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      const at = sheetStack.indexOf(id)
      if (at >= 0) sheetStack.splice(at, 1)
      sheetFocus.delete(id)
      unlock()
      const target = [returnTo, fallback].find(
        (el) => el && document.contains(el) && !el.hasAttribute('disabled'),
      )
      // While another sheet is open it owns focus: only hand it back into one of them
      const underSheet = [...sheetFocus.values()].some((o) => o.panel?.contains(target as Node))
      if (target && (!sheetFocus.size || underSheet)) target.focus({ preventScroll: true })
    }
  }, [id, leave])

  /* Hairline under the header once content scrolls beneath it */
  const onScroll = useCallback(() => {
    const scrolled = (scrollRef.current?.scrollTop ?? 0) > 2
    gripRef.current?.toggleAttribute('data-scrolled', scrolled)
  }, [])

  const setScrollRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      if (typeof externalScrollRef === 'function') externalScrollRef(node)
      else if (externalScrollRef) externalScrollRef.current = node
    },
    [externalScrollRef],
  )

  const api = useMemo<SheetApi>(() => ({ close: closeFromButton, dismissible }), [closeFromButton, dismissible])

  return (
    <SheetContext.Provider value={api}>
      <div className="sheet-root">
        <div ref={scrimRef} className="sheet-scrim" style={{ opacity: 0 }} aria-hidden onClick={requestClose} />
        <div
          ref={panelRef}
          className={`sheet${footer ? ' sheet--has-footer' : ''}${className ? ` ${className}` : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          tabIndex={-1}
        >
          <div ref={gripRef} className="sheet-grab" {...gripProps}>
            <span className="sheet-grabber" aria-hidden />
            {header}
          </div>
          <div ref={setScrollRef} className="sheet-scroll" onScroll={onScroll}>
            {children}
          </div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </div>
      </div>
    </SheetContext.Provider>
  )
}

/* ── Header pieces ───────────────────────────────────────────────────────────── */

type HeaderProps = {
  title: ReactNode
  /** Put on the title so the dialog is named by it. */
  titleId?: string
  /** Left slot: Cancel / Close / Back. */
  leading?: ReactNode
  /** Right slot: the primary action when it lives in the header. */
  trailing?: ReactNode
}

/** iOS sheet header: leading text button, centred Headline title, trailing primary action. */
export function SheetHeader({ title, titleId, leading, trailing }: HeaderProps) {
  return (
    <div className="sheet-header">
      <div className="sheet-header-side sheet-header-side--start">{leading}</div>
      <h2 className="sheet-header-title t-headline" id={titleId}>
        {title}
      </h2>
      <div className="sheet-header-side sheet-header-side--end">{trailing}</div>
    </div>
  )
}

type ActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Headline weight, for the primary action (Save, Done). */
  primary?: boolean
  danger?: boolean
}

/** Text button for the header (accent-ink). */
export function SheetAction({ primary, danger, className, type = 'button', ...rest }: ActionProps) {
  return (
    <button
      type={type}
      className={`sheet-action${primary ? ' sheet-action--primary' : ''}${danger ? ' sheet-action--danger' : ''}${
        className ? ` ${className}` : ''
      }`}
      {...rest}
    />
  )
}

/** Cancel / Close / Done text button that runs the sheet's exit animation. */
export function SheetCancel({
  children = 'Cancel',
  confirm,
  ...rest
}: Omit<ActionProps, 'onClick'> & {
  /** Ask this before closing (e.g. 'Discard changes?'); leave unset when nothing would be lost. */
  confirm?: string
}) {
  const close = useSheetClose()
  return (
    <SheetAction
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return
        close()
      }}
      {...rest}
    >
      {children}
    </SheetAction>
  )
}

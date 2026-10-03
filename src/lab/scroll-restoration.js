import { isTreeLabRoute } from '../route.js'

// Loaded only for the lab, including its synchronous placeholder commit.
export { flushSync } from 'react-dom'

const entryKey = '__treeLabLoadingGeometry'
const mergeable = state => state === null || (
  typeof state === 'object' && Object.getPrototypeOf(state) === Object.prototype
)

// Native restoration needs a scrollable document before the lazy lab arrives.
// Keep a bounded fallback in this history entry when native reload restoration
// ran before the lazy bootstrap. BFCache retains its native viewport untouched.
export function prepareLabScrollRestoration(host) {
  const path = host.location.pathname
  if (!isTreeLabRoute(path)) return { loadingHeight: undefined, restore() {}, dispose() {} }
  let loadingHeight, restoredY
  try {
    const type = host.performance.getEntriesByType('navigation')[0]?.type
    const saved = host.history.state?.[entryKey]
    if ((type === 'reload' || type === 'back_forward') && saved?.path === path &&
        Number.isFinite(saved.height) && saved.height > 0) {
      loadingHeight = saved.height
      if (Number.isFinite(saved.y) && saved.y >= 0) restoredY = saved.y
    }
  } catch { /* Unavailable history must not prevent opening the lab. */ }

  function capture() {
    // Never replace real geometry with the short bootstrap or import error UI.
    if (host.location.pathname !== path || !host.document.querySelector('.tree-lab-narrative')) return
    try {
      const state = host.history.state
      const height = host.document.documentElement.scrollHeight
      const y = host.scrollY
      if (state?.[entryKey]?.path === path && state[entryKey].height === height && state[entryKey].y === y) return
      if (mergeable(state) && Number.isFinite(height) && height > 0 && Number.isFinite(y) && y >= 0) {
        host.history.replaceState({ ...state, [entryKey]: { path, height, y } }, '')
      }
    } catch { /* History access may be denied; keep native behavior. */ }
  }
  function pause(event) {
    capture()
    host.removeEventListener('scroll', capture)
    host.removeEventListener('pagehide', pause)
    if (!event.persisted) host.removeEventListener('pageshow', resume)
  }
  function resume(event) {
    if (event.persisted) {
      host.addEventListener('scroll', capture, { passive: true })
      host.addEventListener('pagehide', pause)
    }
  }
  // Capture while the document is still active: replaceState during pagehide
  // can be rejected by browsers. Unchanged position/layout causes no write.
  host.addEventListener('scroll', capture, { passive: true })
  host.addEventListener('pagehide', pause)
  host.addEventListener('pageshow', resume)
  return {
    loadingHeight,
    restore() {
      // Called once with scrollable bootstrap layout, just before mounting the
      // lab. Never override a native-restored or user-moved nonzero viewport.
      if (restoredY > 0 && host.scrollY === 0) host.scrollTo({ top: restoredY, behavior: 'instant' })
      restoredY = undefined
    },
    dispose() {
      host.removeEventListener('scroll', capture)
      host.removeEventListener('pagehide', pause)
      host.removeEventListener('pageshow', resume)
    },
  }
}

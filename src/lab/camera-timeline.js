const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0

// top is relative to the sticky inset; no travel (or invalid geometry) means start.
export function scrollProgress(top, height, viewport) {
  if (![top, height, viewport].every(Number.isFinite) || viewport <= 0 || height <= viewport) return 0
  return clamp(-top / (height - viewport))
}

export function stageProgress(stage) {
  return { trunk: 0, canopy: 0.5, whole: 1 }[stage] ?? 0
}

export function sampleCamera(progress, bounds, fov, aspect) {
  const p = clamp(progress)
  const size = Object.fromEntries(['x', 'y', 'z'].map(k => [k, bounds.max[k] - bounds.min[k]]))
  const center = Object.fromEntries(['x', 'y', 'z'].map(k => [k, (bounds.min[k] + bounds.max[k]) / 2]))
  const radius = Math.hypot(size.x, size.y, size.z) / 2
  const vertical = (Number.isFinite(fov) && fov > 0 && fov < 180 ? fov : 38) * Math.PI / 360
  const limiting = Math.min(vertical, Math.atan(Math.tan(vertical) * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1)))
  // Anatomy fractions are art direction for this mature zelkova, not growth rules.
  const anchors = [
    { fraction: 0.25, radius: radius * 0.27, direction: [0.45, 0.08, 1] },
    { fraction: 0.72, radius: radius * 0.62, direction: [-0.45, 0.12, 1] },
    { fraction: 0.5, radius, direction: [0.85, 0.32, 1] },
  ].map(({ fraction, radius: focusRadius, direction }) => {
    const target = { ...center, y: bounds.min.y + size.y * fraction }
    const distance = focusRadius / Math.sin(limiting) * 1.12
    const length = Math.hypot(...direction)
    const position = Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, target[k] + direction[i] / length * distance]))
    return { target, position }
  })
  const segment = p < 0.5 ? 0 : 1
  const t = (p - segment * 0.5) * 2
  const eased = t * t * (3 - 2 * t)
  const result = { stage: p < 0.25 ? 'trunk' : p < 0.75 ? 'canopy' : 'whole' }
  for (const key of ['position', 'target']) {
    result[key] = Object.fromEntries(['x', 'y', 'z'].map(k => [k,
      anchors[segment][key][k] + (anchors[segment + 1][key][k] - anchors[segment][key][k]) * eased,
    ]))
  }
  return result
}

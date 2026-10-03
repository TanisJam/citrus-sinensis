import { useEffect, useRef, useState } from 'react'
import { mountTreeScene } from './scene.js'
import { chapterScroll, growthProgress, scrollProgress } from './camera-timeline.js'
import { STAGES, stageProgress } from './growth-model.js'
import './lab.css'

const copy = {
  seed: ['Semilla', 'Una semilla de naranjo bajo la superficie. La reserva alimenta lo que viene; la cáscara todavía está cerrada.'],
  roots: ['Raíces', 'La radícula sale primero y baja. El suelo es un corte transparente: las raíces quedan a la vista.'],
  sprout: ['Brote', 'El tallo sube y desdobla sus primeras hojas mientras la reserva de la semilla se agota.'],
  trunk: ['Tronco', 'El mismo eje del brote engrosa y se alarga. No es un árbol escalado: cada segmento crece desde su punta.'],
  branches: ['Ramas', 'Las ramas nacen donde el tronco ya llegó, y de ellas otras más finas. Las raíces se abren en la tierra.'],
  leaves: ['Hojas', 'El follaje completa la copa. Ilustración procedural, no simulación botánica; volvé hacia arriba para rebobinar.'],
}
const stages = STAGES.map(({ id }) => ({ id, title: copy[id][0], text: copy[id][1] }))
const stageAt = p => STAGES.findLast(stage => p >= stage.progress).id

export function TreeLab() {
  const canvas = useRef(null)
  const viewer = useRef(null)
  const narrative = useRef(null)
  const sticky = useRef(null)
  const measure = useRef(null)
  const owner = useRef({ mode: 'narrative', progress: 0, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
  const [status, setStatus] = useState('loading')
  const [mode, setMode] = useState('narrative')
  const [stage, setStage] = useState('seed')
  const [reduced, setReduced] = useState(owner.current.reduced)
  const [wind, setWind] = useState(() => !owner.current.reduced)
  useEffect(() => {
    document.title = 'Naranjo · Laboratorio botánico'
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = null, active = true
    const readProgress = () => {
      const { top, travel } = scrollTravel()
      return scrollProgress(top, travel + 1, 1)
    }
    const update = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      if (!active || owner.current.mode !== 'narrative' || owner.current.reduced) return
      owner.current.progress = growthProgress(readProgress())
      viewer.current?.setProgress(owner.current.progress)
      setStage(stageAt(owner.current.progress))
    }
    const schedule = () => { if (active && frame === null) frame = requestAnimationFrame(update) }
    measure.current = update
    const reduce = event => {
      owner.current.reduced = event.matches
      setReduced(event.matches)
      // Freeze the current (possibly intermediate) pose, without snapping to an anchor.
      if (event.matches) {
        if (frame !== null) cancelAnimationFrame(frame)
        frame = null
        setWind(false)
      } else schedule()
    }
    motion.addEventListener('change', reduce)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(narrative.current)
    observer.observe(sticky.current)
    update() // cache restored scroll before the asset's first render
    const mounted = mountTreeScene(canvas.current, {
      windEnabled: !motion.matches,
      mode: owner.current.mode,
      progress: owner.current.progress,
      onReady: () => { if (active) { setStatus('ready'); schedule() } },
      onError: () => { if (active) setStatus('error') },
    })
    viewer.current = mounted
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer.disconnect()
      motion.removeEventListener('change', reduce)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      measure.current = null
      mounted.dispose()
      viewer.current = null
    }
  }, [])
  useEffect(() => { viewer.current?.setWind(wind) }, [wind])
  function changeMode(next) {
    owner.current.mode = next
    viewer.current?.setMode(next)
    setMode(next)
    if (next === 'narrative') {
      if (owner.current.reduced) viewer.current?.setProgress(owner.current.progress)
      else measure.current?.()
    }
  }
  function selectStage(id) {
    if (owner.current.mode !== 'narrative') return
    const progress = stageProgress(id)
    if (owner.current.reduced) {
      owner.current.progress = progress
      viewer.current?.setProgress(progress)
      setStage(id)
    } else {
      const { top, travel } = scrollTravel()
      // Round up so integer scroll positions never land just short of an anchor.
      window.scrollTo({ top: Math.ceil(window.scrollY + top + travel * chapterScroll(id)), behavior: 'instant' })
      measure.current?.()
    }
  }
  // Sticky travel, capped by the document's scroll range so full growth is reachable.
  function scrollTravel() {
    const box = narrative.current.getBoundingClientRect()
    const top = box.top - 8
    const end = document.documentElement.scrollHeight - window.innerHeight - window.scrollY - top
    return { top, travel: Math.min(box.height - sticky.current.getBoundingClientRect().height, end) }
  }
  const ready = status === 'ready'
  const explore = mode === 'explore'
  return (
    <main className="tree-lab">
      <header className="tree-lab-header">
        <a href="/">← Volver al ciclo</a>
        <p className="tree-lab-eyebrow">Laboratorio botánico / 01</p>
        <h1>De semilla a árbol, en tres dimensiones.</h1>
        <p>Un naranjo ilustrado que crece mientras bajás: semilla, raíces, brote, tronco, ramas y hojas. Geometría procedural original; no es una simulación botánica.</p>
      </header>
      <div className="tree-lab-narrative" ref={narrative}>
        <div className="tree-lab-sticky" ref={sticky}>
          <div className="tree-lab-controls" aria-label="Modo de cámara">
            <button aria-pressed={!explore} onClick={() => changeMode('narrative')}>Recorrido</button>
            <button aria-pressed={explore} onClick={() => changeMode('explore')}>Explorar</button>
            <button disabled={!ready} aria-pressed={wind} onClick={() => setWind(value => !value)}>Viento: {wind ? 'activado' : 'desactivado'}</button>
          </div>
          <section className="tree-lab-studio" aria-label="Visor del espécimen">
            <canvas id="tree-lab-canvas" ref={canvas} tabIndex={explore ? 0 : -1} aria-label="Naranjo en crecimiento, en 3D" aria-describedby="tree-lab-help" />
            <p className="tree-lab-status" role={status === 'error' ? 'alert' : 'status'}>
              {status === 'loading' && 'Preparando el espécimen…'}
              {ready && 'Espécimen listo · el suelo es un corte transparente'}
              {status === 'error' && <>No se pudo mostrar el árbol. Revisá la conexión y el soporte WebGL. <a href="">Recargar para reintentar</a></>}
            </p>
          </section>
          <div className="tree-lab-controls" aria-label={explore ? 'Controles de cámara' : 'Etapas del recorrido'}>
            {explore ? <>
              <button disabled={!ready} onClick={() => viewer.current.reset()}>Restablecer cámara</button>
              <button disabled={!ready} onClick={() => viewer.current.zoom(0.85)}>Acercar</button>
              <button disabled={!ready} onClick={() => viewer.current.zoom(1.18)}>Alejar</button>
            </> : stages.map(item => <button key={item.id} aria-pressed={stage === item.id} onClick={() => selectStage(item.id)}>{item.title}</button>)}
          </div>
          <p id="tree-lab-help" className="tree-lab-help">{explore
            ? 'Arrastrá para girar; rueda o pellizco para acercar. Con foco en el visor: flechas, + / − y Home.'
            : reduced ? 'Movimiento reducido: crecimiento detenido. Elegí una etapa para verla sin animación.'
              : 'Desplazá la página para hacer crecer el árbol (o volvé para rebobinar), o elegí una etapa. En Explorar se congela el crecimiento y podés girar y acercarte.'}</p>
        </div>
        <div className="tree-lab-chapters">
          {stages.map((item, index) => <section key={item.id} aria-labelledby={`chapter-${item.id}`}>
            <p className="tree-lab-eyebrow">0{index + 1} / 0{stages.length}</p>
            <h2 id={`chapter-${item.id}`}>{item.title}</h2>
            <p>{item.text}</p>
          </section>)}
        </div>
      </div>
      <footer className="tree-lab-footer">
        <p>Geometría y materiales procedurales originales: 94 segmentos de raíz y madera, 300 hojas. Three.js r185.</p>
      </footer>
    </main>
  )
}

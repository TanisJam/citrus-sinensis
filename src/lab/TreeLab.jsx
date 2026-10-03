import { useEffect, useRef, useState } from 'react'
import { mountTreeScene } from './scene.js'
import { scrollProgress, stageProgress } from './camera-timeline.js'
import './lab.css'

const stages = [
  { id: 'trunk', title: 'Tronco', text: 'La corteza y las bifurcaciones sostienen la estructura. Nos acercamos al eje del espécimen adulto.' },
  { id: 'canopy', title: 'Copa', text: 'Las ramas se abren y el follaje ocupa el espacio. Cambia el encuadre, no la edad del árbol.' },
  { id: 'whole', title: 'Árbol completo', text: 'Una misma zelkova, vista en conjunto. La escala original y el porte del espécimen permanecen intactos.' },
]
const stageAt = p => p < 0.25 ? 'trunk' : p < 0.75 ? 'canopy' : 'whole'

export function TreeLab() {
  const canvas = useRef(null)
  const viewer = useRef(null)
  const narrative = useRef(null)
  const sticky = useRef(null)
  const measure = useRef(null)
  const owner = useRef({ mode: 'narrative', progress: 0, reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches })
  const [status, setStatus] = useState('loading')
  const [mode, setMode] = useState('narrative')
  const [stage, setStage] = useState('trunk')
  const [reduced, setReduced] = useState(owner.current.reduced)
  const [wind, setWind] = useState(() => !owner.current.reduced)
  useEffect(() => {
    document.title = 'Zelkova · Laboratorio botánico'
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = null, active = true
    const readProgress = () => {
      const box = narrative.current.getBoundingClientRect()
      return scrollProgress(box.top - 8, box.height, sticky.current.getBoundingClientRect().height)
    }
    const update = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      if (!active || owner.current.mode !== 'narrative' || owner.current.reduced) return
      owner.current.progress = readProgress()
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
      viewer.current?.setStage(id)
      setStage(id)
    } else {
      const box = narrative.current.getBoundingClientRect()
      const travel = box.height - sticky.current.getBoundingClientRect().height
      window.scrollTo({ top: window.scrollY + box.top - 8 + travel * progress, behavior: 'instant' })
      measure.current?.()
    }
  }
  const ready = status === 'ready'
  const explore = mode === 'explore'
  return (
    <main className="tree-lab">
      <header className="tree-lab-header">
        <a href="/">← Volver al ciclo</a>
        <p className="tree-lab-eyebrow">Laboratorio botánico / 01</p>
        <h1>Un árbol, en otra dimensión.</h1>
        <p>Base del recorrido de cámara · zelkova adulta de referencia, no un naranjo. El crecimiento desde semilla todavía no está implementado.</p>
      </header>
      <div className="tree-lab-narrative" ref={narrative}>
        <div className="tree-lab-sticky" ref={sticky}>
          <div className="tree-lab-controls" aria-label="Modo de cámara">
            <button aria-pressed={!explore} onClick={() => changeMode('narrative')}>Recorrido</button>
            <button aria-pressed={explore} onClick={() => changeMode('explore')}>Explorar</button>
            <button disabled={!ready} aria-pressed={wind} onClick={() => setWind(value => !value)}>Viento: {wind ? 'activado' : 'desactivado'}</button>
          </div>
          <section className="tree-lab-studio" aria-label="Visor del espécimen">
            <canvas id="tree-lab-canvas" ref={canvas} tabIndex={explore ? 0 : -1} aria-label="Árbol zelkova en 3D" aria-describedby="tree-lab-help" />
            <p className="tree-lab-status" role={status === 'error' ? 'alert' : 'status'}>
              {status === 'loading' && 'Cargando espécimen (8 MB)…'}
              {ready && 'Espécimen listo · escala original en metros'}
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
            : reduced ? 'Movimiento reducido: vista detenida. Elegí una etapa para cambiar el encuadre sin animación.'
              : 'Desplazá la página para recorrer el árbol, o elegí una etapa. En Explorar podés girar y acercarte.'}</p>
        </div>
        <div className="tree-lab-chapters">
          {stages.map((item, index) => <section key={item.id} aria-labelledby={`chapter-${item.id}`}>
            <p className="tree-lab-eyebrow">0{index + 1} / 03</p>
            <h2 id={`chapter-${item.id}`}>{item.title}</h2>
            <p>{item.text}</p>
          </section>)}
        </div>
      </div>
      <footer className="tree-lab-footer">
        <p>Modelo generado con <a href="https://amix-design.com/tl/fab-botanic/">FABOTANIC</a> · AMIX｜トミナガハルキ. 43 900 triángulos · Three.js r185.</p>
        <p>El modelo no es MIT: <a href="https://amix-design.com/tl/fab-botanic/license/1.0.0.html">condiciones del material</a>. <a href="/lab-assets/zelkova/LICENSES.txt">Licencias del runtime y terceros</a>.</p>
      </footer>
    </main>
  )
}

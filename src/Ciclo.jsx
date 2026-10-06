import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine, STAGES } from './engine/engine.js'
import { createAudio } from './audio/audio.js'
import { BANDS } from './content/bands.jsx'
import { Bands } from './components/Bands.jsx'
import { SpecimenLabel } from './components/SpecimenLabel.jsx'
import { Brand, Nav, CycleRail } from './components/Chrome.jsx'
import { TextIndex } from './components/TextIndex.jsx'
import { Gate, ScrollHint, SoundToggle } from './components/Gate.jsx'
import { ProjectTag } from './components/ProjectTag.jsx'

/* El primer pintado tiene que salir ya con la etiqueta puesta. Un estado
   inicial vacio se ve: la pieza abre con "day 0 / DISPERSAL" en blanco y el
   texto aparece un frame despues, que es exactamente el salto que la pieza
   trabaja tanto para no tener. */
const INITIAL_HUD = {
  age: 'day 0',
  stage: STAGES[0].name,
  note: STAGES[0].note,
  dark: STAGES[0].dark,
  /* La marca y la navegacion viran por su cuenta: ver `sampleChrome` en el
     motor. */
  brandDark: STAGES[0].dark,
  navDark: STAGES[0].dark,
  from: '',
  /* La etiqueta del proyecto: cual fruta y si esta a la vista. */
  project: 0,
  tag: false,
}

/* ============================================================
   El contenedor. Es el unico componente que conoce el motor.

   La division de responsabilidades es la decision de fondo de toda la
   migracion, asi que conviene dejarla escrita:

     React    ->  que hay en la pagina, en que orden, con que texto, y todo lo
                  que cambia pocas veces por recorrido.
     el motor ->  el pixel, y lo que cambia sesenta veces por segundo.

   No es una concesion ni deuda: es que un frame de canvas no es un arbol de
   elementos. Es una secuencia de escrituras opacas sobre un contexto, y no hay
   nada que reconciliar entre un frame y el siguiente — no existe el "diff" de
   veintisiete mil llamadas de dibujo. Declararlo en JSX agregaria una capa que
   no describe nada y cobraria una reconciliacion por frame a cambio.

   Lo que si gana React es todo lo demas: las bandas dejan de ser
   `querySelectorAll('.band')` + `parseFloat(dataset.from)` y pasan a ser datos;
   la lista accesible de proyectos deja de ser una copia a mano y sale del mismo
   catalogo que dibuja el canvas; el HUD deja de ser once `getElementById` y
   pasa a ser props.
   ============================================================ */
export function Ciclo() {
  const canvasRef = useRef(null)
  const flashRef = useRef(null)
  const cycleDotRef = useRef(null)
  const labelRef = useRef(null)
  const bandEls = useRef([])

  const [hud, setHud] = useState(INITIAL_HUD)
  /* 'gate' la puerta arriba · 'leaving' fundiendose · 'in' la pieza sola.
     El estado intermedio existe porque desmontar la puerta en el mismo click
     seria un corte duro, y porque el sonido tiene que arrancar DENTRO de ese
     click aunque el cartel siga en pantalla medio segundo mas. */
  const [phase, setPhase] = useState('gate')
  const [muted, setMuted] = useState(true)
  const [hinting, setHinting] = useState(true)

  const registerBand = useCallback((i, el) => { bandEls.current[i] = el }, [])

  /* El sonido se construye en el montaje pero NO abre un `AudioContext`: eso
     pasa recien dentro de `enter()`, que sale del click de la puerta. Crear el
     contexto acá lo dejaria suspendido para siempre — es literalmente lo que la
     politica de autoplay impide. */
  const audioRef = useRef(null)
  if (audioRef.current === null) audioRef.current = createAudio()

  const enter = useCallback(sound => {
    audioRef.current.enter({ sound })
    setMuted(!sound)
    setPhase('leaving')
  }, [])

  const toggleSound = useCallback(() => {
    setMuted(m => { audioRef.current.setMuted(!m); return !m })
  }, [])

  /* La unica cosa que la pagina le PIDE al motor, en toda la pieza: volver al
     principio. Todo lo demas va en el sentido contrario —el motor reporta y
     React dibuja—, asi que el motor se guarda en una referencia y no en estado:
     tenerlo no cambia nada de lo que se renderiza. */
  const engineRef = useRef(null)
  const goHome = useCallback(() => { engineRef.current?.home() }, [])
  /* Y la segunda: la fruta siguiente, desde la etiqueta del proyecto. El motor
     ya sabe cual es la actual; la pagina solo pide "la que sigue". */
  const nextFruit = useCallback(() => {
    const e = engineRef.current
    if (e) e.pick(e.state().fruit + 1)
  }, [])

  useEffect(() => {
    /* Las referencias de los hijos ya estan puestas cuando corre este efecto:
       React confirma de abajo hacia arriba. Por eso el motor puede recibir los
       nodos de las bandas aca y no hace falta un segundo efecto ni un estado
       intermedio para esperarlos.

       El motor es 3D. Three.js llega en un chunk aparte mientras la puerta esta
       arriba; si el navegador no puede abrir WebGL, la pieza sigue en el motor
       2D, que tiene el mismo contrato. `?engine=2d` lo fuerza. */
    const options = {
      canvas: canvasRef.current,
      bands: BANDS.map((b, i) => ({ from: b.from, to: b.to, el: bandEls.current[i] })),
      refs: { flash: flashRef, cycleDot: cycleDotRef, label: labelRef },
      /* El motor solo manda los campos que CAMBIARON, asi que se funden sobre
         el estado anterior. Mandar el snapshot entero obligaria a comparar seis
         strings por frame para descubrir que no cambio ninguno. */
      onHud: delta => setHud(prev => ({ ...prev, ...delta })),
      onAccent: hex => document.documentElement.style.setProperty('--accent', hex),
      /* Sin objeto intermedio y sin cierre sobre estado: lo que el motor emite
         entra derecho al grafo de audio. `sig` ya viene siendo el mismo objeto
         en todos los frames —lo reusa el motor— asi que esto no aloca nada. */
      onTick: (p, night, interior, sig) => audioRef.current.tick(p, night, interior, sig),
    }
    let alive = true
    const start2D = () => { if (alive) engineRef.current = createEngine(options) }
    if (/[?&]engine=2d\b/.test(location.search)) start2D()
    else import('./cycle/engine3d.js').then(({ createEngine: create3D }) => {
      if (!alive) return
      try { engineRef.current = create3D(options) } catch (error) { console.warn('3D unavailable, using 2D:', error); start2D() }
    }, start2D)
    const audio = audioRef.current
    return () => { alive = false; engineRef.current?.destroy(); audio.destroy(); engineRef.current = null }
  }, [])

  const scheme = hud.dark ? 'on-dark' : 'on-light'
  /* La marca y la navegacion no miran lo mismo que el resto: estan pegadas al
     borde de arriba, y ahi hay cielo mientras las bandas tienen tierra detras.
     El motor lee los pixeles debajo de cada una y el esquema sale de ahi, uno
     por lado. */
  const brandScheme = hud.brandDark ? 'on-dark' : 'on-light'
  const navScheme = hud.navDark ? 'on-dark' : 'on-light'
  /* La pista y la etiqueta se pisan en un telefono: la etiqueta mide 226px de
     ancho en una pantalla de 390 y la pista esta centrada, asi que "SCROLL"
     termina impreso adentro de la tarjeta. Se muestra una sola, y la que cede
     es la etiqueta porque la pista se va sola a los pocos segundos. El corte
     por ancho lo pone el CSS; aca solo se dice cuando la pista esta arriba. */
  const hintUp = phase === 'in' && hinting

  return (
    <>
      <canvas id="scene" ref={canvasRef} aria-hidden="true" />
      <div id="grain" aria-hidden="true" />
      <div id="flash" ref={flashRef} aria-hidden="true" />

      <Brand scheme={brandScheme} onHome={goHome} />
      <Nav scheme={navScheme} />
      <CycleRail scheme={scheme} dotRef={cycleDotRef} />

      {phase !== 'in' && (
        <Gate onEnter={enter} leaving={phase === 'leaving'} onGone={() => setPhase('in')} />
      )}
      {phase === 'in' && <SoundToggle scheme={scheme} muted={muted} onToggle={toggleSound} />}
      {hintUp && (
        <ScrollHint scheme={scheme} onDone={() => setHinting(false)} />
      )}

      <ProjectTag project={hud.project} on={phase === 'in' && hud.tag} onNext={nextFruit} />

      <SpecimenLabel
        labelRef={labelRef}
        age={hud.age}
        stage={hud.stage}
        note={hud.note}
        from={hud.from}
        dim={hintUp}
      />

      <main>
        <Bands onBandRef={registerBand} scheme={scheme} />
        <TextIndex />
      </main>

      {/* El recorrido. No es decoracion: es el unico insumo del que sale `p`, y
          con menos, un flick de trackpad se come tres fases enteras. */}
      <div id="spacer" />
    </>
  )
}

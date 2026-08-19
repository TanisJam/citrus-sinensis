import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine, STAGES } from './engine/engine.js'
import { createAudio } from './audio/audio.js'
import { BANDS } from './content/bands.jsx'
import { Bands } from './components/Bands.jsx'
import { SpecimenLabel } from './components/SpecimenLabel.jsx'
import { Brand, Nav, CycleRail } from './components/Chrome.jsx'
import { TextIndex } from './components/TextIndex.jsx'
import { Gate, ScrollHint, SoundToggle } from './components/Gate.jsx'

/* El primer pintado tiene que salir ya con la etiqueta puesta. Un estado
   inicial vacio se ve: la pieza abre con "day 0 / DISPERSAL" en blanco y el
   texto aparece un frame despues, que es exactamente el salto que la pieza
   trabaja tanto para no tener. */
const INITIAL_HUD = {
  age: 'day 0',
  stage: STAGES[0].name,
  note: STAGES[0].note,
  dark: STAGES[0].dark,
  from: '',
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

  useEffect(() => {
    /* Las referencias de los hijos ya estan puestas cuando corre este efecto:
       React confirma de abajo hacia arriba. Por eso el motor puede recibir los
       nodos de las bandas aca y no hace falta un segundo efecto ni un estado
       intermedio para esperarlos. */
    const engine = createEngine({
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
    })
    const audio = audioRef.current
    return () => { engine.destroy(); audio.destroy() }
  }, [])

  const scheme = hud.dark ? 'on-dark' : 'on-light'

  return (
    <>
      <canvas id="scene" ref={canvasRef} aria-hidden="true" />
      <div id="grain" aria-hidden="true" />
      <div id="flash" ref={flashRef} aria-hidden="true" />

      <Brand scheme={scheme} />
      <Nav scheme={scheme} />
      <CycleRail scheme={scheme} dotRef={cycleDotRef} />

      {phase !== 'in' && (
        <Gate onEnter={enter} leaving={phase === 'leaving'} onGone={() => setPhase('in')} />
      )}
      {phase === 'in' && <SoundToggle scheme={scheme} muted={muted} onToggle={toggleSound} />}
      {phase === 'in' && hinting && (
        <ScrollHint scheme={scheme} onDone={() => setHinting(false)} />
      )}

      <SpecimenLabel
        labelRef={labelRef}
        age={hud.age}
        stage={hud.stage}
        note={hud.note}
        from={hud.from}
      />

      <main>
        <Bands onBandRef={registerBand} />
        <TextIndex />
      </main>

      {/* El recorrido. No es decoracion: es el unico insumo del que sale `p`, y
          con menos, un flick de trackpad se come tres fases enteras. */}
      <div id="spacer" />
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { createEngine, STAGES } from './engine/engine.js'
import { BANDS } from './content/bands.jsx'
import { Bands } from './components/Bands.jsx'
import { SpecimenLabel } from './components/SpecimenLabel.jsx'
import { Brand, Nav, CycleRail, Cue } from './components/Chrome.jsx'
import { ProjectsIndex } from './components/ProjectsIndex.jsx'

/* El primer pintado tiene que salir ya con la etiqueta puesta. Un estado
   inicial vacio se ve: la pieza abre con "day 0 / DISPERSAL" en blanco y el
   texto aparece un frame despues, que es exactamente el salto que la pieza
   trabaja tanto para no tener. */
const INITIAL_HUD = {
  age: 'day 0',
  stage: STAGES[0].name,
  note: STAGES[0].note,
  dark: STAGES[0].dark,
  cue: '',
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
  const bandEls = useRef([])

  const [hud, setHud] = useState(INITIAL_HUD)

  const registerBand = useCallback((i, el) => { bandEls.current[i] = el }, [])

  useEffect(() => {
    /* Las referencias de los hijos ya estan puestas cuando corre este efecto:
       React confirma de abajo hacia arriba. Por eso el motor puede recibir los
       nodos de las bandas aca y no hace falta un segundo efecto ni un estado
       intermedio para esperarlos. */
    const engine = createEngine({
      canvas: canvasRef.current,
      bands: BANDS.map((b, i) => ({ from: b.from, to: b.to, el: bandEls.current[i] })),
      refs: { flash: flashRef, cycleDot: cycleDotRef },
      /* El motor solo manda los campos que CAMBIARON, asi que se funden sobre
         el estado anterior. Mandar el snapshot entero obligaria a comparar seis
         strings por frame para descubrir que no cambio ninguno. */
      onHud: delta => setHud(prev => ({ ...prev, ...delta })),
      onAccent: hex => document.documentElement.style.setProperty('--accent', hex),
    })
    return () => engine.destroy()
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
      <Cue scheme={scheme} text={hud.cue} />

      <SpecimenLabel
        scheme={scheme}
        age={hud.age}
        stage={hud.stage}
        note={hud.note}
        from={hud.from}
      />

      <main>
        <Bands onBandRef={registerBand} />
        <ProjectsIndex />
      </main>

      {/* Veintiocho pantallas de recorrido. No es decoracion: es el unico
          insumo del que sale `p`, y con menos un flick de trackpad se come
          tres fases enteras. */}
      <div id="spacer" />
    </>
  )
}

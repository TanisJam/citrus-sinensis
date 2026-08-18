import { useEffect, useRef, useState } from 'react'

/* La puerta, la pista de scroll y el control de sonido.
 *
 * Van juntos porque son las tres piezas de una sola cosa: como se ENTRA. Y la
 * puerta existe por una razon tecnica que no se puede esquivar — un
 * `AudioContext` creado antes de un gesto de usuario nace suspendido, y el
 * scroll NO cuenta como gesto en Chrome. Sin un click en algun lado, la pieza
 * no puede sonar.
 *
 * Lo interesante es que la restriccion tecnica y la decision de diseno apuntan
 * al mismo lado. Un toggle de sonido flotando en una esquina es un accesorio
 * pegado a la pieza; una puerta es la pieza empezando. Y no cuesta nada
 * decirle al lector que hay sonido ANTES de que suene, que es lo unico que
 * cualquiera quiere de una pagina que hace ruido. */

/* La puerta bloquea el scroll mientras esta arriba. Sin esto se podria
   scrollear por detras y empezar la pieza a la mitad, que es exactamente lo
   que una puerta existe para impedir. */
function useScrollLock() {
  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = prev }
  }, [])
}

/* El desmontaje no puede colgar de un solo evento. Si la transicion no arranca
   —click antes de que termine la animacion de entrada, una regla de
   `prefers-reduced-motion`, una pestana en segundo plano— `transitionend` no
   llega nunca y la puerta se queda tapando la pieza con el scroll trabado. El
   fundido sigue siendo el camino normal; esto es el piso. */
function useFallbackGone(leaving, onGone) {
  /* El callback va por ref y NO en las dependencias. `onGone` llega como arrow
     inline y el HUD re-renderiza casi por frame: con la identidad en las
     dependencias el efecto se reinicia sin parar y el timer no llega a vencer
     nunca. */
  const cb = useRef(onGone)
  cb.current = onGone
  useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => cb.current(), 900)
    return () => clearTimeout(t)
  }, [leaving])
}

export function Gate({ onEnter, leaving, onGone }) {
  useScrollLock()
  useFallbackGone(leaving, onGone)
  /* `onEnter` sale SINCRONICO del click, y eso no es un detalle de estilo: el
     navegador cuenta el gesto de usuario sobre la pila de llamadas del evento.
     Diferirlo un tick —a un `setTimeout`, a un `transitionend`, a un `await`
     previo— deja de valer como activacion y `AudioContext.resume()` se rechaza.
     El fundido de salida corre despues, por su cuenta. */
  const go = sound => () => { onEnter(sound) }
  /* `transitionend` burbujea, asi que sin el filtro el fundido del boton —o
     cualquier transicion de un hijo— desmontaria la puerta antes de tiempo. */
  const done = e => {
    if (e.target === e.currentTarget && e.propertyName === 'opacity') onGone()
  }
  return (
    <div
      className={`gate ${leaving ? 'gate-out' : ''}`}
      onTransitionEnd={leaving ? done : undefined}
    >
      <div className="gate-card">
        <p className="gate-kicker">Field recording — synthesised</p>
        <p className="gate-line">This piece has sound.</p>
        <button type="button" className="gate-go" onClick={go(true)}>
          Begin
        </button>
        {/* La pieza no se gatea detras del audio: el que no quiere sonido entra
            igual, y despues puede cambiar de idea con el control de abajo. */}
        <button type="button" className="gate-quiet" onClick={go(false)}>
          Enter in silence
        </button>
      </div>
    </div>
  )
}

/* La pista de scroll.
 *
 * Aca vivia el `Cue` que pedia mover el mouse para elegir una fruta, y se fue
 * con esta regla escrita: un cartel que invita a hacer algo que no hace nada es
 * peor que ningun cartel. Esta pista pasa ese test — invita a hacer lo unico
 * que la pieza hace, y se va sola en cuanto el lector lo hace una vez. */
export function ScrollHint({ scheme, onDone }) {
  const [going, setGoing] = useState(false)

  useEffect(() => {
    const off = () => { setGoing(true); window.removeEventListener('scroll', off) }
    window.addEventListener('scroll', off, { passive: true })
    /* Y si nadie scrollea, tampoco se queda para siempre. */
    const t = setTimeout(off, 9000)
    return () => { clearTimeout(t); window.removeEventListener('scroll', off) }
  }, [])

  const done = e => {
    if (e.target === e.currentTarget && e.propertyName === 'opacity') onDone()
  }
  return (
    <div
      className={`hint ${scheme} ${going ? 'hint-out' : ''}`}
      onTransitionEnd={going ? done : undefined}
      aria-hidden="true"
    >
      <span>Scroll</span>
      <i />
    </div>
  )
}

export function SoundToggle({ muted, onToggle, scheme }) {
  return (
    <button
      type="button"
      className={`snd ${scheme}`}
      onClick={onToggle}
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {/* Tres barras que se aplanan al silenciar. Un icono de parlante seria
          mas obvio, pero esto es lo que el sonido de la pieza ES: tres camas de
          ruido con la ganancia colgada del scroll. */}
      <i /><i /><i />
    </button>
  )
}

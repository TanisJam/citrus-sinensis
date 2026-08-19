/* Marca, navegacion y riel del ciclo.
 *
 * Van juntos porque comparten una sola cosa: el esquema claro/oscuro, que sale
 * de la etapa en la que esta la pieza. Antes eso era un `classList.toggle`
 * sobre cinco nodos buscados por id; aca es un prop.
 *
 * Aca vivia tambien `Cue`, el cartel que pedia mover el mouse para elegir una
 * fruta. Se fue con la eleccion: la pieza ahora corre sola de punta a punta y
 * un cartel que invita a hacer algo que no hace nada es peor que ningun
 * cartel. */

/* La marca es el unico enlace que la pieza tiene siempre a la vista, y desde
   que la pieza ES el home, "ir al home" dejo de significar navegar: significa
   volver a la semilla. El click lo atiende el motor, que salta a cero en un
   cuadro en vez de rebobinar la reproduccion entera.
 *
 * Sigue siendo un `<a href="/">` y no un `<button>`, y eso importa por dos
 * razones. Sin JS —o antes de que hidrate— el enlace igual lleva al home, solo
 * que recargando. Y cmd+click, la rueda del mouse o "abrir en pestaña nueva"
 * siguen haciendo lo que el usuario espera de un enlace: por eso el
 * `preventDefault` se saltea cuando hay modificadores. Un boton disfrazado de
 * enlace rompe las dos cosas. */
export function Brand({ scheme, onHome }) {
  const go = e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onHome()
  }
  return (
    <a className={`brand ${scheme}`} href="/" onClick={go} aria-label="Mauricio Romero — back to the start">
      MNR
    </a>
  )
}

/* Tres salidas y nada mas: los dos lugares donde esta el trabajo, y el sitio
   viejo para quien venia a buscar lo que habia antes.
 *
 * `/old` va con barra inicial. Es la unica de las tres que es del propio sitio,
 * y una relativa sin barra cambia de destino segun desde donde se monte la
 * pieza: `old` desde `/algo/` apunta a `/algo/old`, que no existe. Con barra
 * apunta siempre a la raiz, se sirva desde donde se sirva. */
export function Nav({ scheme }) {
  return (
    <nav className={`nav ${scheme}`}>
      <a href="https://github.com/TanisJam" rel="noopener noreferrer" target="_blank">GitHub</a>
      <a href="https://www.linkedin.com/in/mauricionromero/" rel="noopener noreferrer" target="_blank">LinkedIn</a>
      <a href="/old">Old site</a>
    </nav>
  )
}

/* El punto del riel se mueve en todos los frames, asi que su posicion la
   escribe el motor por referencia. El riel en si es estructura. */
export function CycleRail({ scheme, dotRef }) {
  return (
    <div className={`cycle ${scheme}`}>
      <i ref={dotRef} />
    </div>
  )
}

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

export function Brand({ scheme }) {
  return <div className={`brand ${scheme}`}>MNR</div>
}

export function Nav({ scheme }) {
  return (
    <nav className={`nav ${scheme}`}>
      <a href="#">Blog</a>
      <a href="#">Projects</a>
      <a href="#">Resume</a>
      <a href="#">ES</a>
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

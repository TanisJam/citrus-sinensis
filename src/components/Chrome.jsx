import { useRef } from 'react'

/* Marca, navegacion, riel del ciclo y pista de interaccion.
 *
 * Van juntos porque comparten una sola cosa: el esquema claro/oscuro, que sale
 * de la etapa en la que esta la pieza. Antes eso era un `classList.toggle`
 * sobre cinco nodos buscados por id; aca es un prop. */

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

export function Cue({ scheme, text }) {
  /* La pista se desvanece en medio segundo, asi que el texto tiene que
     sobrevivir a su propia salida: vaciarlo apenas la ventana se cierra hace
     que la frase desaparezca de golpe y solo se desvanezca la nada. Se conserva
     el ultimo texto no vacio y se apaga nada mas la clase. */
  const held = useRef('')
  if (text) held.current = text
  return <div className={`cue ${scheme}${text ? ' show' : ''}`}>{held.current}</div>
}

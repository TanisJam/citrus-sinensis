import { BANDS } from '../content/bands.jsx'

/* Las bandas de texto.
 *
 * Presentacional puro: no sabe donde esta el scroll ni cuando le toca
 * aparecer. Solo entrega los nodos hacia arriba, y el motor les escribe
 * opacidad y desplazamiento por frame.
 *
 * `scheme` es la excepcion, y es nueva: en vertical las bandas pierden el papel
 * y caen directo sobre el dibujo, asi que pasan a necesitar el mismo viraje
 * claro/oscuro que ya usan la marca, la navegacion y el riel. No es estado por
 * frame —cambia unas pocas veces por recorrido, cuando el fondo detras del
 * texto cruza el umbral de luma— asi que pasarlo por props no cuesta nada.
 *
 * Eso ULTIMO es deliberado y vale explicarlo, porque parece lo contrario de lo
 * que uno haria en React. Estas seis bandas cambian de opacidad en TODOS los
 * frames mientras se scrollea. Pasarlas por estado seria pedirle a React una
 * reconciliacion cada 16 ms para mover un div veintiseis pixeles: se paga el
 * precio del modelo declarativo sin comprar nada de lo que el modelo
 * declarativo da. React se queda con lo que es estructura —que bandas hay, que
 * dicen, en que orden— y el motor se queda con lo que es pintura.
 */
export function Bands({ onBandRef, scheme }) {
  return (
    <>
      {BANDS.map((b, i) => (
        <section
          key={i}
          ref={el => onBandRef(i, el)}
          className={`band${b.align ? ' ' + b.align : ''} ${scheme}`}
        >
          <div className="col">{b.body}</div>
        </section>
      ))}
    </>
  )
}

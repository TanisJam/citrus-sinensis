import { BANDS } from '../content/bands.jsx'

/* Las bandas de texto.
 *
 * Presentacional puro: no sabe donde esta el scroll ni cuando le toca
 * aparecer. Solo entrega los nodos hacia arriba, y el motor les escribe
 * opacidad y desplazamiento por frame.
 *
 * Eso ULTIMO es deliberado y vale explicarlo, porque parece lo contrario de lo
 * que uno haria en React. Estas seis bandas cambian de opacidad en TODOS los
 * frames mientras se scrollea. Pasarlas por estado seria pedirle a React una
 * reconciliacion cada 16 ms para mover un div veintiseis pixeles: se paga el
 * precio del modelo declarativo sin comprar nada de lo que el modelo
 * declarativo da. React se queda con lo que es estructura —que bandas hay, que
 * dicen, en que orden— y el motor se queda con lo que es pintura.
 */
export function Bands({ onBandRef }) {
  return (
    <>
      {BANDS.map((b, i) => (
        <section
          key={i}
          ref={el => onBandRef(i, el)}
          className={`band${b.align ? ' ' + b.align : ''}`}
        >
          <div className="col">{b.body}</div>
        </section>
      ))}
    </>
  )
}

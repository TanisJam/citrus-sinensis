import { PROJECTS } from '../engine/engine.js'

/* La etiqueta del proyecto.
 *
 * Es la unica cartela que existe DESPUES de 0.80, y la regla que prohibe
 * cartelas ahi —"una cartela sobre el climax tapa lo que el climax existe para
 * mostrar"— sigue en pie: esta va en la esquina baja derecha, donde el corte y
 * sus rotulos no llegan, y no describe la fruta —eso lo dibuja el lienzo—.
 * Existe por lo unico que el lienzo no puede dibujar: un enlace. Sin ella, la
 * fruta abierta era un callejon; el lector llegaba al nombre de un proyecto
 * y no tenia adonde ir, y los otros cinco quedaban a una vuelta entera de
 * distancia cada uno.
 *
 * El motor manda dos cosas por el HUD —cual proyecto y si la etiqueta esta
 * encendida— y nada mas: no sabe de enlaces ni de botones. "Next fruit" es la
 * unica eleccion que la pieza acepta, y esta anunciada con nombre, que es lo
 * que le faltaba a la que se saco.
 *
 * Apagada no es `display:none` —se desvanece, como las bandas— pero si es
 * `inert`: una cartela que no se ve no puede recibir el foco ni un click, o el
 * teclado tabula hacia un boton invisible. */
export function ProjectTag({ project, on, onNext }) {
  const p = PROJECTS[project] ?? PROJECTS[0]
  const n = PROJECTS.length
  return (
    <aside className={`tag${on ? ' on' : ''}`} inert={!on} aria-label="Project">
      <p className="tag-idx">{String(project + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</p>
      <p className="tag-name">{p.name}</p>
      <p className="tag-line">{p.line}</p>
      <p className="tag-go">
        {p.live && (
          <a className="go" href={p.live} rel="noopener noreferrer" target="_blank">
            {p.liveLabel ?? 'Open live'} ↗
          </a>
        )}
        <a className="tag-src" href={p.url} rel="noopener noreferrer" target="_blank">Source</a>
      </p>
      <button type="button" className="tag-next" onClick={onNext}>
        Next fruit →
      </button>
    </aside>
  )
}

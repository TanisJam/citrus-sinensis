import { IDEAS, PROJECTS } from '../engine/engine.js'

/* Los proyectos viven en el canvas como frutas, y un canvas no tiene texto.
 * Esta lista es la version leible de la misma informacion — la que reciben los
 * lectores de pantalla y los buscadores.
 *
 * Sale del MISMO catalogo que dibuja el motor, y eso es lo que cambio en la
 * migracion. Antes eran dos listas: una en el script y otra escrita a mano en
 * el HTML, que podian divergir sin que nada avisara — agregar un gajo al canvas
 * no agregaba nada a la version accesible. Ahora hay una sola fuente, asi que
 * la accesibilidad no puede quedarse atras del dibujo.
 */
export function ProjectsIndex() {
  return (
    <nav className="sr-only" aria-label="Projects">
      <h2>Projects</h2>
      <ul>
        {PROJECTS.map(p => (
          <li key={p.name}>
            <a href="#">{p.name} — {p.meta}.</a>{' '}
            {p.gajos.map(g => g.name).join(', ')}.
          </li>
        ))}
      </ul>
      <h2>Ideas everything is built from</h2>
      <ul>
        {IDEAS.map(idea => <li key={idea}>{idea}</li>)}
      </ul>
    </nav>
  )
}

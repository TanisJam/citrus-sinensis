import { IDEAS, PROJECTS } from '../engine/engine.js'

/* La version leible de la pieza.
 *
 * La pieza es un canvas y seis cartelas fijas que el motor enciende y apaga por
 * posicion del ciclo. Eso funciona para quien ve y scrollea, y para nadie mas:
 * el canvas es `aria-hidden` por definicion, y una cartela apagada esta en
 * `visibility:hidden`, o sea fuera del arbol de accesibilidad. Sin este bloque,
 * lo unico que un lector de pantalla encuentra en toda la pagina es la banda que
 * justo esta encendida — y un buscador, ni eso.
 *
 * Empezo siendo solo el indice de proyectos y crecio a esto por una razon
 * concreta: la pieza pasa a ser el portfolio, y un portfolio que un crawler no
 * puede leer no es un portfolio.
 *
 * DOS REGLAS, y las dos existen para que esto no se pudra:
 *
 * 1. Los proyectos salen del MISMO catalogo que dibuja el motor. Antes eran dos
 *    listas —una en el script, otra escrita a mano en el HTML— que podian
 *    divergir sin que nada avisara: agregar un gajo al canvas no agregaba nada a
 *    la version accesible. Ahora hay una sola fuente.
 *
 * 2. Lo que NO sale del catalogo son HECHOS, no prosa. Nombre, rol, links,
 *    donde vive el texto largo. Copiar aca los parrafos de `bands.jsx` seria
 *    fabricar la misma divergencia que la regla 1 elimina, un archivo mas
 *    abajo. Los hechos cambian una vez por ano; la prosa cambia todo el tiempo.
 *
 *    La glosa de cada gajo (`about`) es una frase y aun asi cumple la regla:
 *    no esta copiada de ningun lado. Vive UNA sola vez, en el catalogo, y la
 *    dibuja el canvas cuando el puntero se apoya sobre ese carpelo. Lo que la
 *    regla prohibe es la segunda copia, no la oracion.
 */
export function TextIndex() {
  return (
    <section className="sr-only" aria-label="Text version of this page">
      <h2>Mauricio Romero — software developer</h2>
      <p>
        Full-stack developer at Aerolab, working on the internal platform used by
        Endeavor staff across more than 40 offices. Frontend and backend:
        TypeScript, React, Next.js, Tailwind CSS, Salesforce. Based in Argentina.
      </p>
      <p>
        This page is a scroll-driven piece: the life cycle of an orange tree, from
        seed to fruit to the seed inside the fruit. The projects below hang in its
        canopy. It has sound, and it never ends — the cycle starts over.
      </p>

      <h2>Elsewhere</h2>
      <ul>
        <li><a href="/home">Personal site</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="/projects">Projects, with full write-ups</a></li>
        <li><a href="/resume">Resume</a></li>
        <li><a href="https://github.com/TanisJam">GitHub</a></li>
        <li><a href="https://www.linkedin.com/in/mauricionromero/">LinkedIn</a></li>
      </ul>

      <h2>Projects</h2>
      <ul>
        {PROJECTS.map(p => (
          <li key={p.name}>
            <a href={p.url} rel="noopener noreferrer" target="_blank">
              {p.name} — {p.meta}.
            </a>
            <ul>
              {p.gajos.map(g => (
                <li key={g.name}>{g.name} — {g.about}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2>Ideas everything is built from</h2>
      <ul>
        {IDEAS.map(idea => <li key={idea}>{idea}</li>)}
      </ul>
    </section>
  )
}

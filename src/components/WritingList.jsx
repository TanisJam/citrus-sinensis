/* La lista de posts de la banda Writing.
 *
 * Vivia escrita a mano aca al lado, en `bands.jsx`, y esa era su falla: el blog
 * es OTRO proyecto de Vercel, asi que publicar un post alla no tocaba esta
 * lista y la pieza se quedaba un post atras sin que nada avisara. Dos listas
 * que habia que editar juntas, en dos repos, sin nada que las atara.
 *
 * Ahora hay una sola fuente: `/blog/feed.json`, que el sitio de Astro genera en
 * su build desde la misma coleccion que dibuja el indice del blog. Es mismo
 * origen —la pieza sirve `/` y le rewritea todo lo demas a ese sitio— asi que
 * no hay CORS ni host absoluto que mantener. Publicar un post alla ya lo pone
 * aca, sin deploy de la pieza.
 *
 * SEED no es un placeholder: es lo que se ve si el fetch no vuelve —dev sin el
 * otro sitio delante, la red caida, el feed roto— y ademas es lo que se pinta
 * en el primer frame, antes de que la respuesta llegue. Una banda que aparece
 * vacia y se llena medio segundo despues salta a la vista mientras se scrollea;
 * una que aparece con cuatro filas y cambia de contenido, no. Por eso el largo
 * de SEED es el mismo que el de la lista: la altura de la cartela no cambia
 * cuando llega el feed, y la izquierda no se mueve.
 */
import { useEffect, useState } from 'react'

const COUNT = 4

const SEED = [
  { url: '/blog/an-orange-tree-that-grows-with-scroll/', title: 'An orange tree that grows with scroll', publishedAt: '2026-08-19' },
  { url: '/blog/from-portfolio-to-personal-site/', title: 'From portfolio to personal site', publishedAt: '2026-04-21' },
  { url: '/blog/leading-internal-tools-for-distributed-teams/', title: 'Leading internal tools for distributed teams', publishedAt: '2026-04-18' },
  { url: '/blog/ai-assisted-workflows-with-engineering-standards/', title: 'AI-assisted workflows without losing engineering standards', publishedAt: '2026-04-12' },
]

/* `publishedAt` viene como `YYYY-MM-DD` a proposito. `new Date('2026-08-19')`
   lo parsea como medianoche UTC y al formatearlo en un huso al oeste retrocede
   un dia: el post del 19 se muestra 18. Partir el string evita el viaje por
   Date y no depende del huso de quien mira. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso) {
  const [y, m, d] = String(iso).split('-')
  const month = MONTHS[Number(m) - 1]
  if (!month) return iso
  return `${month} ${Number(d)}, ${y}`
}

export function WritingList() {
  const [posts, setPosts] = useState(SEED)

  useEffect(() => {
    const ac = new AbortController()

    fetch('/blog/feed.json', { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(data => {
        const list = Array.isArray(data?.posts) ? data.posts.filter(p => p?.url && p?.title) : []
        if (list.length) setPosts(list.slice(0, COUNT))
      })
      .catch(() => {
        /* Silencio deliberado: la banda ya tiene contenido valido. Un error de
           red no es algo que quien scrollea pueda accionar, y la pieza no tiene
           donde ponerlo sin taparle el cuadro al arbol. */
      })

    return () => ac.abort()
  }, [])

  return (
    <ul className="rows">
      {posts.map(p => (
        <li key={p.url}>
          <b><a href={p.url}>{p.title}</a></b>
          <span>{formatDate(p.publishedAt)}</span>
        </li>
      ))}
    </ul>
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import './styles.css'
import { isTreeLabRoute } from './route.js'

/* StrictMode a proposito, aunque monte y desmonte dos veces en desarrollo: esa
   doble pasada es justamente la que prueba que `engine.destroy()` limpia bien.
   Si el motor filtrara el bucle de animacion o un oyente de scroll, se veria
   aca antes que en ningun otro lado. */
const root = createRoot(document.getElementById('root'))
if (isTreeLabRoute(window.location.pathname)) {
  root.render(<main role="status">Cargando el laboratorio 3D…</main>)
  let restoration
  import('./lab/scroll-restoration.js').then(({ prepareLabScrollRestoration, flushSync }) => {
    restoration = prepareLabScrollRestoration(window)
    // Reserve this history entry's layout while its lab module is loading.
    flushSync(() => {
      root.render(<main role="status" style={{ minHeight: restoration.loadingHeight }}>Cargando el laboratorio 3D…</main>)
    })
    return import('./lab/TreeLab.jsx')
  }).then(({ TreeLab }) => {
    restoration.restore()
    root.render(<StrictMode><TreeLab /></StrictMode>)
  }).catch(() => {
    restoration?.dispose()
    root.render(<main><p role="alert">No se pudo abrir el laboratorio. Recargá para reintentar.</p><a href="/">Volver al ciclo</a></main>)
  })
} else {
  root.render(<StrictMode><App /></StrictMode>)
}

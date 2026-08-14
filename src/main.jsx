import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.jsx'
import './styles.css'

/* StrictMode a proposito, aunque monte y desmonte dos veces en desarrollo: esa
   doble pasada es justamente la que prueba que `engine.destroy()` limpia bien.
   Si el motor filtrara el bucle de animacion o un oyente de scroll, se veria
   aca antes que en ningun otro lado. */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

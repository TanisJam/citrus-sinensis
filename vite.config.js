import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // La pieza sirve la raiz de mnr.ar y le pasa TODO lo demas —el blog, los
  // proyectos, el resume— al sitio de Astro con un rewrite de Vercel. Vercel
  // resuelve el filesystem ANTES que los rewrites, asi que cualquier archivo
  // que exista aca gana y nunca llega al otro lado.
  //
  // Los dos proyectos publican en `/assets/`. Hoy no chocan porque el chequeo
  // es por archivo exacto y los nombres van hasheados, pero alcanza con que
  // una vez coincidan para que el sitio de Astro se quede sin una imagen y el
  // motivo no aparezca en ningun lado. Con el directorio propio, el solapamiento
  // no puede pasar.
  build: { assetsDir: 'ciclo-assets' },
})

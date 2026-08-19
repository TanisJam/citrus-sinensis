# ciclo-react

`ciclo.html` migrado a React. Misma pieza, misma matemática, mismos tests.

```bash
pnpm install
pnpm dev
pnpm build
pnpm og                               # regenera la tarjeta social (necesita `pnpm dev`)
cd .. && node test-loop-identity.js   # y los otros cuatro
```

## Qué se movió y qué no

React se quedó con **la página**. El motor se quedó con **el píxel**.

| | quién |
|---|---|
| Estructura, contenido, orden, accesibilidad | React |
| Etapa, edad, nota, esquema claro/oscuro, pista, acento | React (estado) |
| Opacidad y desplazamiento de las bandas, punto del riel, destello | el motor (por referencia) |
| Los 44 000 dibujos por frame | el motor |

Un frame de canvas no es un árbol de elementos: es una secuencia de escrituras
opacas sobre un contexto, y entre un frame y el siguiente no hay nada que
reconciliar. Declararlo en JSX agregaría una capa que no describe nada y
cobraría una reconciliación por frame a cambio. Por eso `src/engine/engine.js`
sigue siendo el mismo código imperativo que corría dentro del `<script>`, y por
eso las bandas se mueven por referencia en vez de por estado.

Lo que sí ganó la migración:

- Los rangos de las bandas dejaron de ser `data-from="0.085"` leído con
  `querySelectorAll` + `parseFloat` y pasaron a ser números al lado del
  contenido que gobiernan (`src/content/bands.jsx`).
- La lista accesible de proyectos sale del **mismo** catálogo que dibuja el
  canvas. Antes eran dos listas escritas a mano que podían divergir sin que
  nada avisara: agregar un gajo al dibujo no agregaba nada para un lector de
  pantalla.
- El HUD dejó de ser once `getElementById` y pasó a ser props.

## El contenido

La pieza es el portfolio, no una demo con texto de relleno. Los seis frutos con
nombre de la copa son los seis proyectos de
[mnr.ar/projects](https://www.mnr.ar/projects), y salen de `PROJECTS` en
`src/engine/engine.js` — nombre, stack, gajos y URL del repo, todo del mismo
sitio. Agregar o sacar un proyecto es editar ese array y nada más: cuántos
frutos cuelga el árbol se deriva de `PROJECTS.length`.

El trabajo diario —Endeavor, en Aerolab— **no** está entre los frutos a
propósito. No es algo que se corta y se abre; es el árbol que se sigue cuidando.
Vive en la banda "Currently".

Dos cosas que hay que saber antes de tocar `src/content/bands.jsx`:

- **Las bandas de la izquierda tienen techo de altura.** Comparten columna con
  la etiqueta de especimen, que está fija abajo a la izquierda. Una cartela
  izquierda de más de ~390 px se le mete abajo y la etiqueta le tapa las últimas
  líneas, sin romper nada. Si el texto crece, se recorta o se manda a una banda
  `r`.
- **Ninguna banda pasa de 0.80.** De ahí en adelante la cámara se abre, el árbol
  se planta en el medio del cuadro y el interior de la fruta dibuja su propio
  texto sobre el canvas. Una cartela ahí tapa justo lo que el clímax existe para
  mostrar.

`src/components/TextIndex.jsx` es la versión leíble de todo esto: la pieza es un
canvas (`aria-hidden`) más cartelas que se apagan con `visibility:hidden`, así
que sin ese bloque un lector de pantalla encuentra sólo la banda encendida y un
buscador no encuentra nada.

## La tarjeta social

`public/og.jpg` **no es un mockup**: es un cuadro real del canvas en `p=0.78`
—viraje de color, de noche, con el árbol cargado y la raíz a la vista— con el
título inyectado como DOM y fotografiado junto con el dibujo. Por eso usa las
mismas fuentes que la pieza y no una aproximación que se desalinea sola.

```bash
pnpm dev                        # en otra terminal
pnpm og                         # http://localhost:5173 por defecto
pnpm og http://localhost:5174   # o el puerto que haya tocado
```

Hay que volver a correrlo cuando cambie el nombre, el subtítulo o el dibujo. Es
manual a propósito: treinta segundos por cambio, contra montar un navegador en
cada `build`.

La URL de `og:image` es **absoluta** —los crawlers no resuelven relativas— y
apunta a la raíz, igual que `og:url` y el `canonical`. Si la pieza termina
servida desde una subruta, esas tres se mueven juntas.

## El contrato del motor

```js
const engine = createEngine({
  canvas,                              // <canvas> ya montado
  bands: [{ from, to, el }],           // las secciones de texto
  refs:  { flash, cycleDot },          // nodos que cambian todos los frames
  onHud: delta => ...,                 // SÓLO los campos que cambiaron
  onAccent: hex => ...,
})
engine.destroy()
```

`destroy()` no es prolijidad. StrictMode monta, desmonta y vuelve a montar cada
componente a propósito: sin él quedan dos bucles de animación peleándose por el
mismo canvas desde el primer arranque. Se resuelve **sombreando**
`addEventListener` y `requestAnimationFrame` con locales que delegan en
`globalThis` — el cuerpo del motor no cambia una línea, y los tests, que
reemplazan esas globales por espías, siguen viendo lo mismo que veían.

## El pelado

`drawPeelStrips` reemplaza los ocho sectores de anillo que se corrían hacia
afuera. Aquello funcionaba como reparto de una torta: la piel no se rompía, no
se doblaba y nunca mostraba su lado de adentro.

Ahora hay una **línea de pelado** que baja por la fruta. Debajo, la piel sigue
pegada y está exactamente sobre la esfera. Arriba está libre: sale por la
tangente y sigue un arco de curvatura constante cuya longitud es exactamente la
piel ya soltada, así que no se estira ni se encoge. Es `deformGore`, de
`orange-r3f`, porque la proyección ortográfica de un gore visto de costado es
literalmente `x = u·sen ψ`, `y = −v` — el par `(u, v)` que esa función calcula
en el plano meridiano ya es el dibujo. Lo único que hace falta agregar es el
orden de pintado por `z`, que son diez tiras ordenadas por el coseno del
azimut.

Después la cáscara **cae** —no se desvanece— y el albedo se **abre desde el
centro** —tampoco se desvanece—. Las dos cosas por la misma razón: bajar el
alpha delata las costuras internas de una forma que se pisa a sí misma, y un
velo blanco al 50% sobre la pulpa manda los naranjas al gris justo en el frame
más importante de la pieza.

## Los tests

Siguen siendo los cinco de la raíz del repo, sin cambios de fondo. Cargan el
motor con `engine-under-test.js`. `ciclo.html` queda intacto como referencia;
ya no lo lee nadie.

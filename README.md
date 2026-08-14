# ciclo-react

`ciclo.html` migrado a React. Misma pieza, misma matemática, mismos tests.

```bash
pnpm install
pnpm dev
pnpm build
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

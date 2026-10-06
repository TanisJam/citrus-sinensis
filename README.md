# Citrus × sinensis

El ciclo de un naranjo, de semilla a semilla, en 3D. Es la puerta de entrada de
[mnr.ar](https://www.mnr.ar/).

```bash
pnpm install
pnpm dev
pnpm build
pnpm og            # regenera la tarjeta social (necesita `pnpm dev` corriendo)
pnpm test          # motor 2D, ciclo compartido, modelo botánico, renderer y cámara
pnpm test:browser  # WebGL real: laboratorio y raíz (levantan su propio Vite)
```

## La pieza en 3D

La raíz corre sobre `src/cycle/engine3d.js`, un motor con **el mismo contrato que
el 2D** (`createEngine(host)` → `home`, `pick`, `state`, `destroy`; avisos `onHud`
por diferencia, `onAccent`, `onTick(pe, night, interior, sig)`; escrituras de
bandas, riel y etiqueta). Por eso `Ciclo.jsx`, la puerta, las bandas, el sonido, la
etiqueta del proyecto y el índice accesible no cambiaron: sólo cambió quién pinta.
Three.js llega en un chunk aparte mientras la puerta está arriba. Si el navegador no
abre WebGL, la pieza sigue en el motor 2D (`src/engine/engine.js`), intacto;
`?engine=2d` lo fuerza. `?at=` y `?hold` funcionan igual en los dos, así que
`pnpm og` y `pnpm figures` siguen sirviendo.

El tiempo es el mismo para los dos: `src/cycle/timeline.js` copia del motor 2D el
reparto de scroll, el bucle (0.95–1 = 0–0.05), las señales del sonido, las noches,
la elección por vuelta y las escrituras del DOM, y `tests/test-cycle-timeline.mjs`
fija cada tabla contra el texto del motor 2D: si una cambia de un lado, el test se
rompe. Las trece etapas (Dispersal … Endosperm) se mapean a la edad del modelo
botánico del laboratorio (`AGE_3D`): la semilla cae, se entierra y se hincha, la
radícula baja, el brote rompe la tierra, el árbol juvenil crece años, florece a los
~9, hace la caída de junio, las noches frías viran la fruta y a los 10 años se elige
una naranja. Las seis naranjas de proyecto son frutas reales de la copa, en su
superficie y del lado que ve la cámara, maduradas al color del proyecto.

El clímax abre esa naranja en 3D (`src/cycle/anatomy.js`): el flavedo se abre como
una flor desde el polo y se va, la fruta gira a sección, el albedo se rasga, los diez
gajos se separan en abanico con los nombres de los cinco primeros (números y una
referencia en pantallas angostas), el elegido se abre y suelta la semilla. Esa semilla
vuela al punto y al tamaño exactos donde cuelga la semilla de la vuelta siguiente, así
que el corte del bucle no se ve. Pasar el puntero sobre un gajo escribe su glosa.
`tests/test-root-browser.mjs` recorre las etapas en WebGL real, la etiqueta del
proyecto, "Next fruit", el bucle, el respaldo 2D y la referencia en móvil.

## Laboratorio 3D (aislado)

Abrí `/lab/tree-3d` o `/lab/tree-3d/` con `pnpm dev`. La raíz conserva el
ciclo 2D; sólo la ruta del laboratorio carga Three.js **0.185.0**. Requiere WebGL.

Un naranjo dulce (*Citrus sinensis*) crece en **escala real (metros)** de semilla
a árbol de diez años mientras bajás: Semilla → Raíces → Brote → Tronco → Ramas →
Hojas, con textos en el DOM, la edad en el visor y visor fijo. Es geometría
procedural original con medidas y tiempos de fuentes botánicas (ver **Fidelidad
botánica**), no un modelo adulto escalado; no hay flores, frutos ni exportación. **Recorrido** usa el desplazamiento
nativo: los seis capítulos están espaciados igual en la página y
`growthProgress(scroll)` los lleva por tramos lineales a las anclas desiguales de
`STAGES`, así que cada capítulo empieza exactamente en su etapa y volver hacia
arriba rebobina. El recorrido se limita al alto real del documento, para que la
última etapa sea alcanzable. Los botones saltan a `chapterScroll(id)`.
La cámara se ajusta en cada pose a los límites actuales de la planta
(`sampleGrowthCamera`): raíces incluidas, suelo excluido.
**Explorar** congela crecimiento y pose: arrastrá para orbitar (también por
debajo del suelo, para ver raíces) y usá rueda/pellizco o los botones para zoom.
Con foco en el canvas, las flechas giran, +/− acercan/alejan y Home vuelve al
encuadre de la etapa congelada. Redimensionar en Explorar conserva la pose;
volver a Recorrido retoma el scroll actual.

Con movimiento reducido, el scroll no hace crecer la planta: los botones eligen
etapas estáticas inmediatas. Activar esa preferencia a mitad del recorrido
detiene la vista sin saltos. El viento sólo mece hojas, es independiente,
se puede apagar y empieza apagado con movimiento reducido; activar la
preferencia también lo apaga. El fallo de WebGL se anuncia en el visor.

Todo lo que se ve es geometría y materiales originales generados en código: el
laboratorio no carga modelos, texturas ni runtimes de terceros. La zelkova de
referencia de la etapa de cámara se retiró del repositorio.

`pnpm test` incluye `tests/test-route.mjs`: rutas exactas, precedencia de
rewrites, carga tardía tras desmontaje y el timeline de capítulos (anclas,
límites, monotonía). `tests/test-scroll-restoration.mjs` es la regresión explícita
en navegador (Vite en 127.0.0.1:5177; `CHROME_PATH` opcional): recarga, historial,
navegación fresca, primera pose, movimiento reducido y aislamiento de la raíz.
`pnpm test:browser` (`tests/test-lab-browser.mjs`) levanta su propio Vite y prueba
en WebGL real, a 1440×900, 390×844 y 390×600: las seis anclas dan seis cuadros
distintos y rebobinan exactamente; el final de la página es la planta completa;
el scroll de ida y vuelta repite el mismo cuadro; Explorar congela crecimiento y
pose ante el scroll, gira y acerca con teclado; volver a Recorrido sigue la página;
`touch-action` deja el scroll nativo fuera de Explorar; los recursos GPU no cambian
al crecer; movimiento reducido no anima y los botones cambian la etapa sin
desplazar; la raíz `/` no carga el laboratorio. Compara hashes, no guarda capturas.

`src/lab/growth-model.js` es un modelo morfológico determinista en metros (Y arriba,
suelo en Y=0), sin assets derivados, Three.js ni imports del motor 2D.
`createGrowthTopology(seed)` fija conexiones (~7.200 segmentos de raíz y madera,
~34.000 hojas ordenadas por aparición, ~130 espinas); `createGrowthSample(topology)`
crea buffers reutilizables y `sampleGrowth(topology, p, out)` los escribe sin integrar
tiempo. Las edades se escriben en días y `progressAtAge`/`ageAtProgress` las mapean
a `p` en escala log entre las anclas `STAGE_AGES` (0, 10 y 45 días, 1, ~3,5 y 10 años).
Los ejes crecen por segmentos que se alargan uno tras otro (brotaciones), con
tropismo y un envolvente de copa (`CROWN`, superelipsoide de lados llenos) que corta
las ramas en la superficie. Las ramas secundarias crecen desde la rama principal más
cercana hacia ~120 puntos repartidos sobre esa superficie (una colonización del
espacio simplificada), a ~0,6–0,8 m por año, así ningún sector de la copa queda vacío.
El grosor sigue el modelo de tubería: la sección de cada tallo es proporcional al
área foliar (o largo de raíz) que alguna vez sostuvo, con un mínimo que crece con la
edad del tejido; nunca adelgaza cuando caen hojas viejas. Las raíces son fibrosas:
raicillas a lo largo de la pivotante desde la plántula, laterales con sublaterales y
raíces finas, y un cuello de raíz tan grueso como el tronco. Las hojas viven ~900 días y luego caen; por eso el follaje maduro
queda en la periferia. `tests/test-lab-growth.mjs` cubre conexiones, crecimiento
local, rebobinado exacto **y los rangos botánicos** de la tabla de abajo.

`src/lab/growth-renderer.js` es el adaptador Three que monta `src/lab/scene.js`.
`createGrowthRenderer(topology)` entrega `group`, `bounds`,
`updateGrowth(sample)`, `updateWind(time, enabled)` y `dispose()`. Mallas originales:
semilla ovoide (cotiledones dentro de la cubierta partida), tubos de ocho lados con
color por vértice (brote verde → corteza gris verdosa → gris pardo en lo grueso;
raíz blanca → parda), espinas axilares instanciadas, y hojas instanciadas con pecíolo
de ala angosta, articulación, lámina elíptico-ovada acuminada de borde apenas crenulado,
nervio hundido y arco hacia la punta. Las hojas apuntan hacia adelante sobre el brote
y orientan la cara hacia la luz: hacia arriba y hacia afuera de la copa, como en la
superficie de un cítrico. Cada hoja nace verde claro y se oscurece en ~2 meses
(color por instancia); el envés es más pálido. Sólo se dibujan las hojas ya
nacidas (`leafCount`). El plano de suelo translúcido en Y=0 es un corte **educativo**:
no escribe profundidad y deja ver las raíces. El viento opcional sólo rota hojas
sobre su pecíolo; apagarlo restaura exactamente la pose estática y, sin viento,
no hay trabajo por cuadro. Geometrías, materiales y buffers se crean una vez; la
disposición es idempotente. `tests/test-lab-renderer.mjs` verifica tubos, marcos y
color de hojas, espinas, semilla, rebobinado y recursos en Node sin WebGL.

`sampleGrowthCamera(renderer.bounds, p, aspect, fov = GROWTH_CAMERA_FOV)` en
`src/lab/camera-timeline.js` es la cámara pura del recorrido: retorna `position`/
`target` XYZ, `fov` (42°), `near` y `far`. Como la planta pasa de ~1 cm a ~5 m, los
planos de corte escalan con la distancia (`near` = 2 % de ella) y el encuadre mínimo
es de 2 cm (`GROWTH_CAMERA_MIN_SPAN`). Ajusta los ocho vértices de la caja actual
(raíces incluidas, suelo excluido) a ±0.78 del canvas. `tests/test-lab-camera.mjs`
verifica encuadre, planos de corte, continuidad relativa y búsquedas reversibles.

### Fidelidad botánica

Cada cifra del modelo sale de esta tabla; los tests verifican las marcadas con ✓.
Las fuentes se consultaron por resúmenes de buscador porque el proxy del entorno
bloqueó las páginas: **conviene contrastarlas con el texto original**. Lo marcado
*sin fuente* es conocimiento botánico general o una elección del modelo.

| Rasgo | Modelo | Fuente |
|---|---|---|
| Semilla | ovoide 12 × 6,5 × 4,5 mm, crema ✓ | [IJH](https://journal.iahs.org.in/index.php/ijh/article/download/1497/954) (espesor y color *sin fuente*) |
| Siembra | 1,5 cm de profundidad ✓ | [ABRATES](https://www.abrates.org.br/artigo-cientifico/6635/influence-of-seedcoat-and-sowing-depth-on-seedling-emergence-and-development-of-trifoliata-rootstock) (en trifolio) |
| Germinación | hipogea: radícula ~día 8, tallo emerge ~día 20–25, cotiledones enterrados ✓ | [Kyushu](https://catalog.lib.kyushu-u.ac.jp/opac_download_md/4564/p049.pdf) |
| Poliembrionía | 3 plántulas, una domina ✓ | [IntechOpen](https://www.intechopen.com/chapters/82707), [SciELO](https://www.scielo.br/j/sa/a/SGCfZ3LNRMjxp9v6yT8gdJJ/?lang=en) |
| Plántula | ~40 cm al año ✓, hojas simples desde el inicio | altura *sin fuente para naranjo* ([trifolio](https://horticulturenepal.org/chapter/growth-of-trifoliate-orange-poncirus-trifoliata-l-seedlings-at-different-management-condition-in-ncrp-dhankuta)) |
| Espinas | una por axila, 0,9–2,1 cm, sólo en tronco y ramas jóvenes ✓ | [UniCT](https://www.iris.unict.it/handle/20.500.11769/720127), [eFlora India](https://efloraofindia.com/efi/citrus/) |
| Ramificación | 4 ramas principales entre 0,55 y 0,8 m, abiertas y curvadas a 45–60° ✓ | [UC ANR](https://ucanr.edu/media/288794), [CRFG](https://crfg.org/wp-content/uploads/CITRUS-PRUNING-Presentation.pdf) |
| Filotaxis | espiral alterna, 137,5° | resumen de fuente incierta (3/8–2/5) |
| Brotación | ~3 por año, brotes de 12–28 cm con hojas cada ~2 cm | [UF/IFAS CREC](https://crec.ifas.ufl.edu/media/crecifasufledu/extension/extension-publications/2008/Newflushandbloomconsiderations.pdf) (largo y hojas por brote *sin fuente*) |
| Árbol adulto | 4,5–5 m de alto ✓, ~5 m de ancho ✓, copa redondeada | [UF/IFAS ST169](https://edis.ifas.ufl.edu/pdffiles/ST/ST16900.pdf) |
| Tronco | ~15 cm de diámetro a los 10 años ✓ (modelo de tubería) | [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9205213/table/tab2) (13–17 cm, edad no confirmada) |
| Hoja | lámina 9,4–14,5 cm ✓, pecíolo con ala angosta y articulado, ápice acuminado | [eFlora India](https://efloraofindia.com/efi/citrus/), [USF Plant Atlas](https://dev.demo.plantatlas.usf.edu/genus/318) |
| Color de hoja | brote verde claro → verde oscuro brillante; envés pálido | [Citrus Australia](https://citrusaustralia.com.au/wp-content/uploads/2023/03/FACT-SHEET_Identifying-citrus-growth-flushes_Sept2022.pdf) |
| Vida de la hoja | ~2,5 años; follaje maduro en la periferia ✓ | [UC ANR](https://ucanr.edu/node/111611) |
| Densidad | ~21.000 hojas vivas a los 10 años, en una capa periférica densa | estimado desde IAF ~3 ([FSHS](https://journals.flvc.org/fshs/article/view/86106)); conteo por árbol *sin fuente* |
| Raíces | sistema fibroso; pivotante ~0,9 m; 14 laterales someras más allá de la copa ✓; ≥80 % de raíces finas en 40 cm ✓ | [UF/IFAS CG094](https://edis.ifas.ufl.edu/publication/CG094/pdf), [EDIS](https://journals.flvc.org/edis/article/view/130906/138684), [ASHS](https://journals.ashs.org/downloadpdf/view/journals/jashs/100/1/article-p1.pdf) |
| Corteza | brote liso verde amarillento → gris verdoso; tronco viejo gris pardo | [USPTO PP27144](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/PP27144) (tronco viejo *sin fuente*) |

Revisión visual: se iteró con capturas de cada etapa, de lejos y de cerca, hasta que
la copa se leyera como un naranjo (domo denso, verde oscuro, falda baja) y las raíces
como un sistema fibroso; no se comparó contra fotos de referencia, que el entorno no
pudo descargar. Simplificaciones conocidas: los brotes jóvenes son tubos redondos (en la planta
son angulosos); el viento no mueve ramas; no hay flores (un naranjo de semilla tarda
6–8+ años en florecer) ni frutos; las hojas caen achicándose en el lugar; las
plántulas hermanas quedan detenidas en vez de morir; la profundidad de raíces
depende mucho del suelo y del portainjerto (aquí, un suelo profundo y suelto).

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

Son los cinco de siempre, sin cambios de fondo: viven en `tests/` y cargan el
motor con `engine-under-test.js`, que lee `src/engine/engine.js` y le saca los
`export` para poder evaluarlo.

`tests/package.json` declara `"type": "commonjs"` y no es un descuido. Los cinco
usan `require`, y antes eso funcionaba solo porque estaban en la raíz del repo
viejo, fuera del alcance de cualquier `package.json`. Acá adentro los alcanza el
`"type": "module"` del paquete, así que la carpeta tiene que declarar su propio
sistema de módulos o Node los lee como ESM y no arrancan.

## El despliegue

La pieza es la puerta de entrada de `mnr.ar`: se queda con la raíz del dominio y
le pasa todo lo demás —`/blog`, `/projects`, `/resume`, `/es`— al sitio de Astro
de `portfolio-v3`, que vive en su propio repo y su propio proyecto de Vercel.

El proyecto de Vercel apunta a este subdirectorio (**Root Directory =
`ciclo-react`**); la raíz del repo es taller y no entra en el build.

`vercel.json` conserva el catch-all externo, precedido únicamente por dos
excepciones exactas (`/lab/tree-3d` y `/lab/tree-3d/`) hacia `/index.html`.
Las rutas vecinas o anidadas no son excepciones. La forma del catch-all importa:

```json
{ "source": "/:path+", "destination": "https://<alias>/:path+" }
```

`:path+` exige **al menos un segmento**. Por eso `/` se queda acá y todo lo demás
cae del otro lado, sin enumerar rutas: un post nuevo en el blog funciona sin
tocar este archivo. El `<alias>` es el dominio de producción estable del proyecto
de Astro, no el de un deploy puntual, o la regla queda apuntando a una versión
congelada.

La dirección no es intercambiable. Vercel resuelve el **filesystem antes que los
rewrites**, así que si el dominio se lo quedara Astro, un rewrite de `/` hacia
acá no dispararía nunca: su `index.html` existe y gana. El que sirve la raíz
tiene que ser el dueño del dominio.

El canónico es `www.mnr.ar` —lo dicen el `canonical` y el `og:url` de
`index.html`— y el apex redirige ahí con un 308. Eso vivía en el proyecto
anterior como una opción del panel; acá es la primera regla de `vercel.json`,
condicionada por `host`. Va primero a propósito: los redirects se evalúan antes
que el filesystem y que los rewrites, así que el salto a `www` ocurre antes de
que nada más entre a jugar.

De ahí también sale el `assetsDir` propio de `vite.config.js`: cualquier archivo
que exista en este build gana antes de que el rewrite entre a jugar, y los dos
proyectos publicaban en `/assets/`.

/* Las bandas de texto de la pieza.
 *
 * `from`/`to` son posiciones del ciclo, no de scroll: el motor las usa para
 * calcular la opacidad de cada banda contra `pe`. Antes vivian como
 * `data-from` / `data-to` en el HTML y el motor las leia con querySelectorAll
 * y parseFloat. Aca son numeros desde el principio, que es la unica ventaja
 * real de tener la pagina en React: el rango deja de ser un string en un
 * atributo y pasa a ser un dato al lado del contenido que gobierna.
 *
 * El orden del array ES el orden que el motor recibe: un desfase entre este
 * array y las referencias del DOM apagaria la banda equivocada, asi que las
 * dos cosas se derivan de la misma lista y nunca se escriben dos veces.
 *
 * LAS BANDAS DE LA IZQUIERDA TIENEN TECHO DE ALTURA, y no es una preferencia de
 * estilo. Las cartelas se centran en vertical y la etiqueta de especimen vive
 * fija abajo a la izquierda, asi que las dos comparten columna: una cartela
 * izquierda que pase de unos 390px de alto se le mete abajo y la etiqueta le
 * tapa las ultimas lineas. Pasa en silencio —nada se rompe, solo deja de leerse
 * el final del parrafo— asi que si a una banda de la izquierda le crece el
 * texto, hay que recortarlo o mandarlo a una banda `r`. Las de la derecha no
 * tienen el problema: la etiqueta no llega hasta alla.
 *
 * NINGUNA banda pasa de 0.80. De ahi en adelante el cuadro es del interior de
 * la fruta —entra en 0.812, se pela, se abre en gajos y suelta la semilla— y
 * ese tramo dibuja su propio texto sobre el canvas: el nombre del proyecto, los
 * gajos rotulados y las ideas de las que esta hecho. Una cartela encima de eso
 * taparia justo lo que el climax existe para mostrar.
 */
export const BANDS = [
  {
    /* `hero` la ancla arriba en vez de centrarla. La semilla ahora abre la pieza
       plantada en el medio del encuadre, y una banda centrada le caeria justo
       encima — que es el unico sitio donde no puede caer. */
    from: 0, to: 0.048, align: 'c hero',
    body: (
      <>
        <h1>Mauricio<br /><i>Romero</i></h1>
        <p className="sci">
          Software, writing, and the systems behind it — grown from one seed, in one loop.
        </p>
      </>
    ),
  },
  {
    /* Imbibicion. La nota de campo de esta etapa dice que una semilla de
       Valencia lleva entre 2.9 y 4.6 embriones, casi todos clones de la madre y
       normalmente uno nuevo. La banda se apoya en ese dato en vez de repetirlo. */
    from: 0.085, to: 0.165, align: '',
    body: (
      <>
        <h2>Four embryos,<br />one tree</h2>
        <p>
          Full-stack developer at Aerolab. Before that: machine shop, networks,
          IT consulting. Ten-plus years around technology, five writing software.
        </p>
        <p>
          Most of what you plant is a copy of what came before. Usually one is new.
        </p>
      </>
    ),
  },
  {
    /* Hidrotropismo → emergencia: la raiz elige a donde ir. Es la banda del
       trabajo de ahora. */
    from: 0.195, to: 0.262, align: 'r',
    body: (
      <>
        <h2>Currently</h2>
        <p>
          Building the internal platform that Endeavor staff use across more than 40
          offices. I'm not running it any more — I'm in it, contributing where the
          experience helps: the code, the reviews, and the product decisions upstream
          of both.
        </p>
        <p>
          And always with one ear out for the next technical challenge. Always looking
          for the next seed.
        </p>
      </>
    ),
  },
  {
    /* Ciclos de flujo. La nota dice que el citrico no crece raiz y brote a la
       vez: la primera linea de esta banda es literalmente esa nota. */
    from: 0.315, to: 0.400, align: '',
    body: (
      <>
        <h2>How I work</h2>
        <p><b>Two things at a time.</b> A citrus never grows roots and shoots at once. Neither do I.</p>
        <p><b>I ship code, not decks.</b> React, animation, accessibility included rather than bolted on.</p>
        <p><b>I leave the ground fertile.</b> Documented, tokenised, no strange dependencies.</p>
      </>
    ),
  },
  {
    from: 0.440, to: 0.510, align: 'r',
    body: (
      <>
        <h2>Writing</h2>
        <ul className="rows">
          <li>
            <b><a href="https://www.mnr.ar/blog/from-portfolio-to-personal-site/">From portfolio to personal site</a></b>
            <span>Apr 21, 2026</span>
          </li>
          <li>
            <b><a href="https://www.mnr.ar/blog/leading-internal-tools-for-distributed-teams/">Leading internal tools for distributed teams</a></b>
            <span>Apr 18, 2026</span>
          </li>
          <li>
            <b><a href="https://www.mnr.ar/blog/ai-assisted-workflows-with-engineering-standards/">AI-assisted workflows without losing engineering standards</a></b>
            <span>Apr 12, 2026</span>
          </li>
        </ul>
        <p className="meta"><a href="https://www.mnr.ar/blog">Read the blog →</a></p>
      </>
    ),
  },
  {
    /* Estaba centrada, y centrada dejo de poder estarlo cuando el texto paso a
       vivir en una cartela opaca: el centro del cuadro es del arbol en flor,
       que es exactamente lo que esta banda acompania. Una lamina pone el dibujo
       en el medio y las cartelas en los margenes; no al reves. */
    from: 0.560, to: 0.622, align: 'r',
    body: (
      <>
        <h2>Say hi</h2>
        <p>
          Tell me what you're building. I answer within the day, and if I'm not the
          right person I'll tell you who is.
        </p>
        <a className="go" href="https://www.linkedin.com/in/mauricionromero/">Drop a line</a>
        <p className="meta">
          <a href="https://github.com/TanisJam">GitHub</a> ·{' '}
          <a href="https://www.linkedin.com/in/mauricionromero/">LinkedIn</a> ·{' '}
          <a href="https://www.mnr.ar/resume">Resume</a>
        </p>
      </>
    ),
  },
  {
    /* La ultima banda, y la unica que se agrego despues: la tesis de la pieza.
       Va en la caida de junio y eso no es donde sobraba lugar, es donde
       corresponde. La nota de campo de esta etapa dice que menos del 2% de las
       flores llega a fruta — el arbol suelta casi todo lo que empezo y sigue.
       Es el unico cuadro del ciclo que ya cuenta lo que el texto dice.

       El rango termina en 0.686 y no mas alla por una razon de encuadre, no de
       ritmo: de ahi en adelante la camara se abre y el arbol se planta en el
       medio del cuadro con margenes de sobra a los dos lados, asi que cualquier
       cartela —a izquierda o a derecha— le cae encima al dibujo. Antes de 0.69
       el follaje ocupa todo el cuadro y una cartela se lee como lo que es: una
       etiqueta sobre hojas. Despues, tapa el arbol. Por eso el ultimo tercio de
       la pieza no tiene bandas y no es un olvido. */
    from: 0.636, to: 0.678, align: 'r',
    body: (
      <>
        <h2>What doesn't<br />change</h2>
        <p>
          A seed, a plant, a fruit, and inside the fruit the seeds for the next one.
          Nothing here ever finishes. That isn't the complaint — it's the part I'd keep.
        </p>
        <p>
          New languages, new tools, AI sitting in the loop with me: none of them
          replace the cycle. They make it worth running again. Adventure, satisfaction
          and quiet, all in the same turn.
        </p>
        <p className="sci">I love this.</p>
      </>
    ),
  },
]

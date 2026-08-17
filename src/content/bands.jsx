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
    from: 0.085, to: 0.165, align: '',
    body: (
      <>
        <h2>Four embryos,<br />one tree</h2>
        <p>
          Software developer at Aerolab. I work at the edge between design and code,
          which mostly means killing the good ideas early so one can actually finish.
        </p>
      </>
    ),
  },
  {
    from: 0.195, to: 0.262, align: 'r',
    body: (
      <>
        <h2>Currently</h2>
        <p>
          Leading an internal system used by Endeavor staff across more than 40 offices.
          Frontend-heavy, but the real work is upstream: reviews, estimates, and the
          workflows that let a distributed team decide without a meeting.
        </p>
      </>
    ),
  },
  {
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
          <li><b>From portfolio to personal site</b><span>Apr 21, 2026</span></li>
          <li><b>Leading internal tools for distributed teams</b><span>Apr 18, 2026</span></li>
        </ul>
        <p className="sci">Four-plus years, still counting.</p>
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
        <a className="go" href="#">Drop a line</a>
        <p className="meta">
          <a href="#">GitHub</a> · <a href="#">LinkedIn</a> · <a href="#">Email</a>
        </p>
      </>
    ),
  },
]

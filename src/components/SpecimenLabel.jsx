/* La etiqueta de especimen, abajo a la izquierda.
 *
 * Los cuatro campos cambian pocas veces por recorrido —trece etapas en todo el
 * ciclo— asi que aca si conviene estado de React: el motor avisa solo cuando
 * uno cambia y el resto del tiempo no se re-renderiza nada. */
/* `labelRef` la escribe el motor: la opacidad cambia todos los frames en las dos
 * ventanas del corte del bucle, y ahi el texto tiene que apagarse porque es lo
 * unico que no puede cruzar la costura de forma continua. */
/* Sin `scheme`. La cartela ya no vira con la hora del dia: tiene papel propio,
 * y el papel de un especimen no cambia de color porque afuera se haga de noche.
 * El viraje quedo solo para lo que cae directo sobre el dibujo — marca, nav y
 * riel — que sin el desapareceria. */
export function SpecimenLabel({ age, stage, note, from, labelRef }) {
  return (
    <figure className="label" ref={labelRef} aria-hidden="true">
      <div className="age">{age}</div>
      <div className="stage">{stage}</div>
      <div className="note">{note}</div>
      <div className={`from${from ? ' show' : ''}`}>{from}</div>
    </figure>
  )
}

/* La etiqueta de especimen, abajo a la izquierda.
 *
 * Los cuatro campos cambian pocas veces por recorrido —trece etapas en todo el
 * ciclo— asi que aca si conviene estado de React: el motor avisa solo cuando
 * uno cambia y el resto del tiempo no se re-renderiza nada. */
export function SpecimenLabel({ age, stage, note, from, scheme }) {
  return (
    <figure className={`label ${scheme}`} aria-hidden="true">
      <div className="age">{age}</div>
      <div className="stage">{stage}</div>
      <div className="note">{note}</div>
      <div className={`from${from ? ' show' : ''}`}>{from}</div>
    </figure>
  )
}

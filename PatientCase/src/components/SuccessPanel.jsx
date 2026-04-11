const CHECKMARK = '\u2713';

export default function SuccessPanel({
  heading,
  message,
  note,
  buttonText,
  onReset,
  referenceLabel,
  referenceValue,
  summaryItems = []
}) {
  return (
    <div className="success-panel">
      <div className="success-icon">{CHECKMARK}</div>
      <h3>{heading}</h3>
      <p>{message}</p>

      {referenceValue ? (
        <div className="success-reference-block">
          <span>{referenceLabel}</span>
          <code dir="ltr">{referenceValue}</code>
        </div>
      ) : null}

      {!!summaryItems.length && (
        <div className="success-summary">
          {summaryItems.map((item) => (
            <div key={item.label} className="success-summary-item">
              <span>{item.label}</span>
              <strong dir={item.dir || undefined}>{item.value}</strong>
            </div>
          ))}
        </div>
      )}

      {note ? <small className="success-note">{note}</small> : null}

      <button type="button" className="ghost-button" onClick={onReset}>
        {buttonText}
      </button>
    </div>
  );
}

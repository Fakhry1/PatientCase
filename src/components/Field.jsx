export default function Field({ label, required = false, hint = '', error = '', children }) {
  return (
    <label className="field-block">
      <span className="field-label">
        {label}
        {required && <em>*</em>}
      </span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

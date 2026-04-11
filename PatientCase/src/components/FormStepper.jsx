export default function FormStepper({ steps }) {
  return (
    <div className="form-stepper" aria-label="form progress">
      {steps.map((step) => (
        <div key={step.key} className={`step-item step-${step.state}`}>
          <span className="step-dot" aria-hidden="true">{step.state === 'done' ? '\u2713' : step.number}</span>
          <span className="step-label">{step.label}</span>
        </div>
      ))}
    </div>
  );
}

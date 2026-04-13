export default function SectionCard({ title, description, children }) {
  return (
    <div className="section-card">
      <div className="section-card-header">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

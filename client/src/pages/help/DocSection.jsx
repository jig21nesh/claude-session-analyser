/** One categorised block of the Help docs. */
export default function DocSection({ id, icon, kicker, title, children }) {
  return (
    <section id={id} className="docs-section">
      <header className="docs-section-head">
        <span className="docs-icon" aria-hidden="true">{icon}</span>
        <div>
          <div className="docs-kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
      </header>
      <div className="docs-body">{children}</div>
    </section>
  );
}

export function ModuleSectionTabs({
  sections,
  activeSection,
  onSectionChange,
  ariaLabel = 'Module sections',
}) {
  if (!sections?.length || sections.length < 2) return null

  return (
    <nav className="module-section-tabs" aria-label={ariaLabel}>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`module-section-tab${activeSection === section.id ? ' active' : ''}`}
          onClick={() => onSectionChange(section.id)}
          aria-current={activeSection === section.id ? 'page' : undefined}
        >
          {section.label}
        </button>
      ))}
    </nav>
  )
}

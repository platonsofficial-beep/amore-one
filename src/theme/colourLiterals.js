// Counts raw colour literals (hex, rgb/rgba, hsl/hsla) in CSS so the palette cannot drift.
export const COLOUR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g

export function countColourLiterals(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return (withoutComments.match(COLOUR_LITERAL_RE) || []).length
}

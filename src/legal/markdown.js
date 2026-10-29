function escapeHtml(text) {
  return `${text ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_]+?)_(?=\s|$|[.,;:])/g, '$1<em>$2</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(ΣΥΜΠΛΗΡΩΣΤΕ|FILL IN):([^\]]*)\]/g, '<mark class="legal-placeholder">[$1:$2]</mark>')
}

/** Minimal, safe Markdown → HTML for the bundled legal texts (headings, lists, tables, code). */
export function renderLegalMarkdown(source) {
  const lines = `${source ?? ''}`.replace(/\r/g, '').split('\n')
  const out = []
  let list = null
  let table = null
  let code = null
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null } }
  const closeTable = () => {
    if (!table) return
    const [head, ...body] = table
    out.push('<div class="legal-table-wrap"><table><thead><tr>'
      + head.map((cell) => `<th>${inline(cell)}</th>`).join('')
      + '</tr></thead><tbody>'
      + body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')
      + '</tbody></table></div>')
    table = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (code !== null) {
      if (line.startsWith('```')) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = null } else code.push(raw)
      continue
    }
    if (line.startsWith('```')) { closeList(); closeTable(); code = []; continue }
    if (/^\|.*\|$/.test(line)) {
      closeList()
      const cells = line.slice(1, -1).split('|').map((cell) => cell.trim())
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue
      table = table ?? []
      table.push(cells)
      continue
    }
    closeTable()
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) { closeList(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/)
    if (bullet || ordered) {
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind }
      out.push(`<li>${inline((bullet ?? ordered)[1])}</li>`)
      continue
    }
    closeList()
    if (line.trim()) out.push(`<p>${inline(line)}</p>`)
  }
  closeList(); closeTable()
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

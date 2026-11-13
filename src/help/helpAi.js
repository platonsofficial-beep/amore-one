/** Off unless the client build sets the flag. No key is read in the browser. */
export function helpAiEnabled(env = import.meta.env) {
  return env?.VITE_HELP_AI_ENABLED === 'true'
}

export function helpArticlesForModel(articles, locale = 'en') {
  return articles.map((article) => ({
    id: article.id,
    title: article.title?.[locale] || article.title?.en || '',
    steps: article.steps?.[locale] || article.steps?.en || [],
  }))
}

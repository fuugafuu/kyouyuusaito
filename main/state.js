export function createMainState() {
  return {
    userKey: '',
    storageMode: 'indexeddb',
    profile: null,
    settings: null,
    articles: [],
    currentArticleId: '',
    currentAttachments: [],
    selectedAttachmentId: '',
    currentTab: 'edit',
    dirty: false,
    lastShareUrl: '',
    isSaving: false,
  };
}

export function getCurrentArticle(state) {
  return state.articles.find((article) => article.id === state.currentArticleId) || null;
}

export function sortArticlesInState(state) {
  state.articles.sort((left, right) => {
    const delta = (right.updatedAt || 0) - (left.updatedAt || 0);
    return delta || (right.createdAt || 0) - (left.createdAt || 0);
  });
}

export function upsertArticle(state, article) {
  const index = state.articles.findIndex((item) => item.id === article.id);
  if (index >= 0) {
    state.articles.splice(index, 1, article);
  } else {
    state.articles.push(article);
  }

  sortArticlesInState(state);
}

export function removeArticle(state, articleId) {
  state.articles = state.articles.filter((article) => article.id !== articleId);
  if (state.currentArticleId === articleId) {
    state.currentArticleId = state.articles[0]?.id || '';
  }
}

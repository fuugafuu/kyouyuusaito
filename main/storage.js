import {
  DB_NAME_PREFIX,
  DB_VERSION,
  LOCAL_STORAGE_PREFIX,
  STORE_NAMES,
} from '../common/constants.js';
import {
  normalizeArticle,
  normalizeAttachment,
  normalizeBackupPayload,
  normalizeProfile,
  normalizeSettings,
} from '../common/models.js';
import { safeParseJSON } from '../common/utils.js';

const SETTINGS_KEY = 'settings';
const INDEXED_DB_INIT_TIMEOUT_MS = 1500;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted.'));
  });
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function createIndexedDbAdapter(userKey) {
  let database = null;

  async function getDb() {
    if (database) {
      return database;
    }

    database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`${DB_NAME_PREFIX}-${userKey}`, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAMES.profile)) {
          db.createObjectStore(STORE_NAMES.profile, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
          db.createObjectStore(STORE_NAMES.settings);
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.articles)) {
          db.createObjectStore(STORE_NAMES.articles, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_NAMES.attachments)) {
          const store = db.createObjectStore(STORE_NAMES.attachments, { keyPath: 'id' });
          store.createIndex('articleId', 'articleId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
    });

    return database;
  }

  async function withStore(storeName, mode, callback) {
    const db = await getDb();
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = await callback(store, transaction);
    await transactionToPromise(transaction);
    return result;
  }

  return {
    async init() {
      await getDb();
    },

    async getProfile() {
      return withStore(STORE_NAMES.profile, 'readonly', (store) => requestToPromise(store.get(userKey)));
    },

    async saveProfile(profile) {
      return withStore(STORE_NAMES.profile, 'readwrite', (store) => {
        store.put(profile);
        return profile;
      });
    },

    async getSettings() {
      return withStore(STORE_NAMES.settings, 'readonly', (store) => requestToPromise(store.get(SETTINGS_KEY)));
    },

    async saveSettings(settings) {
      return withStore(STORE_NAMES.settings, 'readwrite', (store) => {
        store.put(settings, SETTINGS_KEY);
        return settings;
      });
    },

    async listArticles() {
      return withStore(STORE_NAMES.articles, 'readonly', (store) => requestToPromise(store.getAll()));
    },

    async saveArticle(article) {
      return withStore(STORE_NAMES.articles, 'readwrite', (store) => {
        store.put(article);
        return article;
      });
    },

    async deleteArticle(articleId) {
      return withStore(STORE_NAMES.articles, 'readwrite', (store) => {
        store.delete(articleId);
      });
    },

    async listAttachments() {
      return withStore(STORE_NAMES.attachments, 'readonly', (store) => requestToPromise(store.getAll()));
    },

    async listAttachmentsByArticle(articleId) {
      return withStore(STORE_NAMES.attachments, 'readonly', (store) =>
        requestToPromise(store.index('articleId').getAll(articleId)),
      );
    },

    async saveAttachment(attachment) {
      return withStore(STORE_NAMES.attachments, 'readwrite', (store) => {
        store.put(attachment);
        return attachment;
      });
    },

    async deleteAttachment(attachmentId) {
      return withStore(STORE_NAMES.attachments, 'readwrite', (store) => {
        store.delete(attachmentId);
      });
    },

    async clearAll() {
      const db = await getDb();
      const transaction = db.transaction(Object.values(STORE_NAMES), 'readwrite');
      for (const storeName of Object.values(STORE_NAMES)) {
        transaction.objectStore(storeName).clear();
      }
      await transactionToPromise(transaction);
    },

    async replaceAllData(payload) {
      const db = await getDb();
      const transaction = db.transaction(Object.values(STORE_NAMES), 'readwrite');

      for (const storeName of Object.values(STORE_NAMES)) {
        transaction.objectStore(storeName).clear();
      }

      transaction.objectStore(STORE_NAMES.profile).put(payload.profile);
      transaction.objectStore(STORE_NAMES.settings).put(payload.settings, SETTINGS_KEY);

      for (const article of payload.articles) {
        transaction.objectStore(STORE_NAMES.articles).put(article);
      }

      for (const attachment of payload.attachments) {
        transaction.objectStore(STORE_NAMES.attachments).put(attachment);
      }

      await transactionToPromise(transaction);
    },
  };
}

function createLocalStorageAdapter(userKey) {
  const namespace = `${LOCAL_STORAGE_PREFIX}:${userKey}`;
  const keys = {
    profile: `${namespace}:profile`,
    settings: `${namespace}:settings`,
    articles: `${namespace}:articles`,
    attachments: `${namespace}:attachments`,
  };

  const read = (key, fallback) => safeParseJSON(localStorage.getItem(key) || '', fallback);
  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  return {
    async init() {
      if (!localStorage.getItem(keys.articles)) {
        write(keys.articles, []);
      }

      if (!localStorage.getItem(keys.attachments)) {
        write(keys.attachments, []);
      }
    },

    async getProfile() {
      return read(keys.profile, null);
    },

    async saveProfile(profile) {
      write(keys.profile, profile);
      return profile;
    },

    async getSettings() {
      return read(keys.settings, null);
    },

    async saveSettings(settings) {
      write(keys.settings, settings);
      return settings;
    },

    async listArticles() {
      return read(keys.articles, []);
    },

    async saveArticle(article) {
      const articles = read(keys.articles, []);
      const index = articles.findIndex((item) => item.id === article.id);
      if (index >= 0) {
        articles.splice(index, 1, article);
      } else {
        articles.push(article);
      }
      write(keys.articles, articles);
      return article;
    },

    async deleteArticle(articleId) {
      write(
        keys.articles,
        read(keys.articles, []).filter((item) => item.id !== articleId),
      );
    },

    async listAttachments() {
      return read(keys.attachments, []);
    },

    async listAttachmentsByArticle(articleId) {
      return read(keys.attachments, []).filter((item) => item.articleId === articleId);
    },

    async saveAttachment(attachment) {
      const attachments = read(keys.attachments, []);
      const index = attachments.findIndex((item) => item.id === attachment.id);
      if (index >= 0) {
        attachments.splice(index, 1, attachment);
      } else {
        attachments.push(attachment);
      }
      write(keys.attachments, attachments);
      return attachment;
    },

    async deleteAttachment(attachmentId) {
      write(
        keys.attachments,
        read(keys.attachments, []).filter((item) => item.id !== attachmentId),
      );
    },

    async clearAll() {
      Object.values(keys).forEach((key) => localStorage.removeItem(key));
    },

    async replaceAllData(payload) {
      write(keys.profile, payload.profile);
      write(keys.settings, payload.settings);
      write(keys.articles, payload.articles);
      write(keys.attachments, payload.attachments);
    },
  };
}

export async function createStorageService(userKey) {
  let adapter = null;
  let mode = 'indexeddb';

  if ('indexedDB' in window) {
    try {
      adapter = createIndexedDbAdapter(userKey);
      await withTimeout(adapter.init(), INDEXED_DB_INIT_TIMEOUT_MS, 'IndexedDB initialization timed out.');
    } catch {
      adapter = null;
    }
  }

  if (!adapter) {
    adapter = createLocalStorageAdapter(userKey);
    await adapter.init();
    mode = 'localstorage';
  }

  async function getAllData() {
    const [profile, settings, articles, attachments] = await Promise.all([
      adapter.getProfile(),
      adapter.getSettings(),
      adapter.listArticles(),
      adapter.listAttachments(),
    ]);

    return {
      profile: normalizeProfile(profile, userKey),
      settings: normalizeSettings(settings),
      articles: articles.map((article) => normalizeArticle(article)),
      attachments: attachments
        .map((attachment) => normalizeAttachment(attachment))
        .filter((attachment) => attachment.data),
    };
  }

  return {
    mode,

    async getProfile() {
      return normalizeProfile(await adapter.getProfile(), userKey);
    },

    async saveProfile(profile) {
      const normalized = normalizeProfile(profile, userKey);
      await adapter.saveProfile(normalized);
      return normalized;
    },

    async getSettings() {
      return normalizeSettings(await adapter.getSettings());
    },

    async saveSettings(settings) {
      const normalized = normalizeSettings(settings);
      await adapter.saveSettings(normalized);
      return normalized;
    },

    async listArticles() {
      const articles = await adapter.listArticles();
      return articles.map((article) => normalizeArticle(article));
    },

    async saveArticle(article) {
      const normalized = normalizeArticle(article);
      await adapter.saveArticle(normalized);
      return normalized;
    },

    async deleteArticle(articleId) {
      await adapter.deleteArticle(articleId);
    },

    async listAttachments() {
      return (await adapter.listAttachments())
        .map((attachment) => normalizeAttachment(attachment))
        .filter((attachment) => attachment.data);
    },

    async listAttachmentsByArticle(articleId) {
      return (await adapter.listAttachmentsByArticle(articleId))
        .map((attachment) => normalizeAttachment(attachment))
        .filter((attachment) => attachment.data);
    },

    async saveAttachment(attachment) {
      const normalized = normalizeAttachment(attachment);
      if (!normalized.data) {
        throw new Error('画像データが空です。');
      }
      await adapter.saveAttachment(normalized);
      return normalized;
    },

    async deleteAttachment(attachmentId) {
      await adapter.deleteAttachment(attachmentId);
    },

    async deleteAttachmentsByArticle(articleId) {
      const attachments = await this.listAttachmentsByArticle(articleId);
      await Promise.all(attachments.map((attachment) => adapter.deleteAttachment(attachment.id)));
    },

    async getAllData() {
      return getAllData();
    },

    async replaceAllData(payload) {
      const normalized = normalizeBackupPayload(payload, userKey);
      await adapter.replaceAllData(normalized);
      return normalized;
    },

    async clearAll() {
      await adapter.clearAll();
    },
  };
}

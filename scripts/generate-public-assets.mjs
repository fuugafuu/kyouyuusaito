import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const siteUrl = process.env.SITE_URL || 'https://kyouyuusaito.vercel.app';

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function buildSitemapXml(library) {
  const urls = [
    {
      loc: `${siteUrl}/`,
      changefreq: 'daily',
      priority: '1.0',
      lastmod: library.updatedAt,
    },
    ...library.articles.map((article) => ({
      loc: `${siteUrl}/p/${encodeURIComponent(article.slug)}`,
      changefreq: 'weekly',
      priority: article.featured ? '0.9' : '0.8',
      lastmod: article.publishedAt || library.updatedAt,
    })),
  ];

  const body = urls
    .map(
      (entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function syncStaticHtml(library) {
  const archiveIndex = await readFile(path.join(rootDir, 'archive', 'index.html'), 'utf8');
  const publicSiteIndex = archiveIndex.replace('/archive/app.js', '/public-site/app.js');
  const targets = [path.join(publicDir, 'index.html')];
  const publicSiteTargets = [
    path.join(rootDir, 'public-site', 'index.html'),
    path.join(publicDir, 'public-site', 'index.html'),
  ];

  for (const target of targets) {
    await ensureDir(path.dirname(target));
    await writeFile(target, archiveIndex, 'utf8');
  }

  for (const target of publicSiteTargets) {
    await ensureDir(path.dirname(target));
    await writeFile(target, publicSiteIndex, 'utf8');
  }

  const articlePagesDir = path.join(publicDir, 'p');
  await ensureDir(articlePagesDir);
  const existingEntries = await readdir(articlePagesDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    existingEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => rm(path.join(articlePagesDir, entry.name), { recursive: true, force: true })),
  );

  await Promise.all(
    library.articles.map(async (article) => {
      const targetDir = path.join(articlePagesDir, article.slug);
      await ensureDir(targetDir);
      await writeFile(path.join(targetDir, 'index.html'), archiveIndex, 'utf8');
    }),
  );
}

async function syncCompatibilityAssets() {
  const copies = [
    ['archive/app.js', 'public-site/app.js'],
    ['archive/styles.css', 'public-site/styles.css'],
    ['archive/decode.js', 'public-site/decode.js'],
    ['archive/app.js', 'public/public-site/app.js'],
    ['archive/styles.css', 'public/public-site/styles.css'],
    ['archive/decode.js', 'public/public-site/decode.js'],
    ['common/runtime.js', 'public/common/runtime.js'],
    ['common/boot.js', 'public/common/boot.js'],
    ['common/routes.js', 'public/common/routes.js'],
    ['common/publication.js', 'public/common/publication.js'],
    ['common/models.js', 'public/common/models.js'],
    ['admin/index.html', 'public/admin/index.html'],
    ['admin/app.js', 'public/admin/app.js'],
    ['admin/styles.css', 'public/admin/styles.css'],
    ['vercel.json', 'public/vercel.json'],
    ['robots.txt', 'public/robots.txt'],
    ['data/library.json', 'public/data/library.json'],
  ];

  await Promise.all(
    copies.map(async ([from, to]) => {
      const source = path.join(rootDir, from);
      const target = path.join(rootDir, to);
      await ensureDir(path.dirname(target));
      await copyFile(source, target);
    }),
  );
}

async function main() {
  const library = await readJson(path.join(rootDir, 'data', 'library.json'));
  const sitemapXml = buildSitemapXml(library);

  await writeFile(path.join(rootDir, 'sitemap.xml'), sitemapXml, 'utf8');
  await ensureDir(publicDir);
  await writeFile(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8');

  await syncStaticHtml(library);
  await syncCompatibilityAssets();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

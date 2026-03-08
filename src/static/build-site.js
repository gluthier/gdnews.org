const fs = require('fs/promises');
const path = require('path');

const PostRepository = require('../repositories/post-repository');
const database = require('../database/database');

const PAGE_SIZE = Number.parseInt(process.env.STATIC_PAGE_SIZE || '30', 10);
const PUBLIC_DIR = path.join(__dirname, '../../public');
const PAGE_DIR = path.join(PUBLIC_DIR, 'page');

const escapeHtml = (value) => {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const domainFromUrl = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
        return '';
    }
};

const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-CH', {
        day: 'numeric',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Europe/Zurich'
    }).format(date);
};

const pagePathPrefix = (page) => {
    return page === 1 ? '' : '../../';
};

const homeHref = (page) => {
    return page === 1 ? 'index.html' : '../../index.html';
};

const pageHref = (page, targetPage) => {
    if (targetPage <= 1) {
        return page === 1 ? 'index.html' : '../../index.html';
    }

    if (page === 1) {
        return `page/${targetPage}/index.html`;
    }

    return `../${targetPage}/index.html`;
};

const stylesheetHref = (page) => {
    return `${pagePathPrefix(page)}style.min.css`;
};

const faviconHref = (page, size) => {
    return `${pagePathPrefix(page)}images/favicon-${size}x${size}.png`;
};

const pageInfo = (page, totalPages) => {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>gdnews</title>
  <meta name="description" content="Game development and design news links">
  <link rel="icon" type="image/png" href="${faviconHref(page, 32)}" sizes="32x32">
  <link rel="icon" type="image/png" href="${faviconHref(page, 16)}" sizes="16x16">
  <link rel="stylesheet" href="${stylesheetHref(page)}">
</head>
<body>
  <div class="container">
    <header>
      <nav>
        <ul class="inline-list">
          <li>
            <div class="logo">
              <a href="${homeHref(page)}">
                <img class="logo-icon" src="${faviconHref(page, 16)}" alt="" width="16" height="16">
                gdnews
              </a>
            </div>
          </li>
        </ul>
      </nav>
    </header>
    <main>
    <section>
`;
};

const renderPostRow = (post, index, totalPosts) => {
    const domain = domainFromUrl(post.url);
    const date = formatDate(post.published_at || post.created_at);
    const isSeparator = ((index + 1) % 5 === 0) && index + 1 !== totalPosts;
    const separatorClass = isSeparator ? ' with-separator' : '';

    return `<li class="post-row${separatorClass}"><a class="post-link" href="${escapeHtml(post.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(post.title)}</a><span class="post-meta">${escapeHtml(domain)}${date ? `<span>${escapeHtml(date)}</span>` : ''}</span></li>`;
};

const renderPagination = (page, totalPages) => {
    const older = page < totalPages ? `<a href="${pageHref(page, page + 1)}">Older</a>` : '';
    const newer = page > 1 ? `<a href="${pageHref(page, page - 1)}">Newer</a>` : '';

    if (!older && !newer) return '';

    return `
<nav class="pagination" aria-label="Pagination">
  ${older}
  ${newer}
</nav>`;
};

const renderPage = ({ posts, page, totalPages }) => {
    const rows = posts.length > 0
        ? posts.map((post, index) => renderPostRow(post, index, posts.length)).join('\n')
        : '<li class="post-row empty">No articles yet. Run `npm run refresh` to fetch news.</li>';

    return `${pageInfo(page, totalPages)}
        <ul class="posts-static">${rows}</ul>
      </section>
    </main>
    ${renderPagination(page, totalPages)}
    <footer>
      <hr>
      <div class="footer-content">
        <p>Aggregation of game development & design news</p>
      </div>
    </footer>
  </div>
</body>
</html>`;
};

async function clearStalePagination() {
    await fs.rm(PAGE_DIR, { recursive: true, force: true });
}

async function writePage(page, html) {
    const outputPath = page === 1
        ? path.join(PUBLIC_DIR, 'index.html')
        : path.join(PAGE_DIR, String(page), 'index.html');

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf8');
}

async function buildSite() {
    const pageSize = Number.isFinite(PAGE_SIZE) && PAGE_SIZE > 0 ? PAGE_SIZE : 30;
    const totalPosts = await PostRepository.countAll();
    const totalPages = Math.max(1, Math.ceil(totalPosts / pageSize));

    await clearStalePagination();

    for (let page = 1; page <= totalPages; page += 1) {
        const posts = await PostRepository.listPage({ page, limit: pageSize });
        const html = renderPage({ posts, page, totalPages });
        await writePage(page, html);
    }

    return {
        totalPosts,
        totalPages,
        pageSize
    };
}

if (require.main === module) {
    buildSite()
        .then((result) => {
            console.log(`Static site built: ${result.totalPosts} posts across ${result.totalPages} page(s).`);
        })
        .catch((error) => {
            console.error('Static site build failed:', error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await database.close();
        });
}

module.exports = buildSite;

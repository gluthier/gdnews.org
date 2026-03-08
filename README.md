# gdnews

Static game development news site generated from a local crawler pipeline.

## Workflow

1. Reset the local post store (destructive):

```bash
npm run data:reset
```

2. Refresh everything (crawl -> ingest -> static build):

```bash
npm run refresh
```

3. Rebuild static pages only from existing stored data:

```bash
npm run build:static
```

Generated files:
- `public/index.html`
- `public/page/<n>/index.html`

Stored data:
- `data/posts.json`

## Environment

Copy `.template.env` to `.env.development` (or `.env.production`) and set crawler values.

## Testing

```bash
npm test
```

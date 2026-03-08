# gdnews

Static game development news site generated from a local crawler pipeline.

## Workflow

1. Reset DB to minimal schema (destructive):

```bash
npm run db:reset
```

If you want non-interactive reset, use:

```bash
GDNEWS_CONFIRM_DB_RESET=true npm run db:reset
```

2. Refresh everything (crawl -> ingest -> static build):

```bash
npm run refresh
```

3. Rebuild static pages only from existing DB data:

```bash
npm run build:static
```

Generated files:
- `public/index.html`
- `public/page/<n>/index.html`

## Environment

Copy `.template.env` to `.env.development` (or `.env.production`) and set DB + crawler values.

## Testing

```bash
npm test
```

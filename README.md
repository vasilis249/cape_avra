# Cape Avra

Direct-booking website for Cape Avra, a seafront house on the cape of Mytikas, Preveza.
Next.js 16 · TypeScript · Tailwind v4 · next-intl (EN/EL).

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000
```

- Copy and facts live in `content/`. No component changes are needed to edit text.
- Photos: originals in `photos/raw/`, registry in `content/photos.ts`, then `npm run photos`.
- Project decisions, conventions and the current phase are in [`CLAUDE.md`](./CLAUDE.md).

# Subtitle Alignment Editor — Deployment

## Project Structure

```
subtitle-editor-app/
├── index.html              # Entry point (font preloads, base styles)
├── vite.config.js          # Build config with code splitting
├── package.json
└── src/
    ├── main.jsx            # React mount
    ├── SubtitleAlignmentEditor.jsx  # Main component
    ├── assParser.js        # ASS parse/serialize (code-split target)
    ├── waveform.js         # Audio waveform generation/rendering
    └── theme.js            # Design tokens
```

## Build

```bash
npm install
npm run build        # → dist/
```

Production build output is entirely static (HTML + JS + CSS). No server-side logic.

Expected bundle size: ~140-170KB gzipped (React vendor chunk + app code).

## Deployment Options

### Option A: Vercel (recommended if main site is already on Vercel)

1. Create a new Vercel project pointing at this directory
2. Framework preset: **Vite**
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add domain: `editor.nerv-analytic.ai`

In your DNS, add a CNAME record:
```
editor.nerv-analytic.ai  →  cname.vercel-dns.com
```

### Option B: Cloudflare Pages

```bash
npx wrangler pages deploy dist --project-name=subtitle-editor
```

Then add custom domain `editor.nerv-analytic.ai` in the Cloudflare dashboard.

### Option C: Nginx (self-hosted / VPS)

```nginx
server {
    listen 443 ssl http2;
    server_name editor.nerv-analytic.ai;

    root /var/www/subtitle-editor/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively (hashed filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # SSL config (use certbot or your provider)
    ssl_certificate /etc/letsencrypt/live/editor.nerv-analytic.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/editor.nerv-analytic.ai/privkey.pem;
}
```

## Performance Notes

**Audio decoding** is the heaviest operation. The Web Audio API's `decodeAudioData` runs on a separate thread, but large files (full episodes at 44.1kHz stereo) will take 2-5 seconds to decode. The waveform generates immediately after.

**Event rendering** uses viewport culling — only events visible in the current scroll position are rendered to DOM. With 700+ events per episode across 4 tracks, this keeps frame rates smooth during zoom/scroll.

**Video preview** uses a `<video>` element with the browser's native decoder. MKV support depends on the browser (Chrome/Edge: yes via WebM demuxer for VP8/VP9/AV1; Firefox: limited; Safari: no). For guaranteed compatibility, use MP4 (H.264) or WebM containers. If your corpus is MKV with H.264, you may need to remux:

```bash
ffmpeg -i input.mkv -c copy output.mp4
```

## Connecting to the Main Site

Since this runs on a subdomain, you can link to it from `nerv-analytic.ai` with a simple anchor:

```html
<a href="https://editor.nerv-analytic.ai">Subtitle Alignment Editor</a>
```

If you later want shared auth, you can set cookies on `.nerv-analytic.ai` (note the leading dot) from the main site, and they'll be readable on the subdomain. But that's only needed if you add user accounts / session persistence.

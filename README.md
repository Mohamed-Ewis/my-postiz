# My Postiz

تطبيق شخصي لجدولة ونشر البوستات على السوشيال ميديا مع كابشن بالذكاء الاصطناعي.
A personal social media scheduling/publishing app with AI captions. Nuxt 3 + Vue 3 + Pinia + Tailwind + Prisma.

## التشغيل على ويندوز / Run on Windows

```powershell
cd "D:\ewis learn\my-postiz"
copy .env.example .env
# عدّل .env: حط NUXT_SESSION_PASSWORD (32 حرف أو أكتر) و NUXT_TOKEN_ENCRYPTION_KEY
# Edit .env: set NUXT_SESSION_PASSWORD (32+ chars) and NUXT_TOKEN_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm install
npx prisma migrate dev
npm run dev
```

افتح / Open http://localhost:3000 — أول مرة هيطلب منك تعمل حساب الأدمن (أو حط NUXT_ADMIN_EMAIL/PASSWORD في .env).
First run shows a setup form (or set NUXT_ADMIN_EMAIL/PASSWORD in .env).

## البنية / Structure
- `prisma/schema.prisma` — User, SocialAccount, Post, PostTarget, Media
- `server/utils/crypto.js` — AES-256-GCM token encryption + scrypt passwords
- `server/providers/` — provider contract (`base.js`), registry (`index.js`), `mock.js` for testing
- `server/api/accounts/[provider]/connect|callback` — generic OAuth with state/PKCE in a sealed cookie
- `pages/` — login, dashboard, accounts (+ placeholders)

للتحويل لـ Postgres: غيّر `provider` في schema.prisma لـ `postgresql` و `DATABASE_URL`.
To switch to Postgres: change the datasource provider and DATABASE_URL, then re-run migrations.

## تشغيل الـ Worker / Running the worker
`npm run dev:all` = الموقع + الـ Worker مع بعض. الـ Worker هو اللي بينشر المجدول، بيشيك على الفيديوهات، بيجدد التوكنات، وبيسحب الأخبار.
`npm run dev:all` runs the site and the worker (publishing, video status checks, token refresh, feeds). `npm test` runs provider unit tests.

## الميديا والتانل / Media & tunnel
الملفات بتتخزن على جهازك في `MEDIA_DIR` والرفع بيتعمل Streaming (مش بيحمّل الفيديو كله في الرام).
إنستجرام لازم يوصل للميديا من النت: شغّل `powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1` (بعد `winget install --id Cloudflare.cloudflared`)، وحط الرابط اللي يطلع في `MEDIA_PUBLIC_BASE_URL` وأعد تشغيل التطبيق. الروابط موقّعة ومؤقتة (6 ساعات).
Instagram needs public media URLs: run the tunnel script and put its URL in `MEDIA_PUBLIC_BASE_URL`. Links are HMAC-signed and expire after 6h. Quick-tunnel URLs change each run; for a fixed one create a named Cloudflare tunnel.

## ربط الحسابات / Connecting accounts
كل منصة بتتفعل لوحدها أول ما تحط مفاتيحها في `.env` وتعيد التشغيل. صفحة الحسابات بتوريك الـ Redirect URI بالظبط.
Each platform turns on once its keys are in `.env` (restart after editing). The Accounts page shows the exact Redirect URI.
Redirect URI format: `http://localhost:3000/api/accounts/<provider>/callback` (لو غيرت `NUXT_PUBLIC_APP_URL` هيتغير).

### Facebook Pages
- App: https://developers.facebook.com/apps → Create app → Business → add **Facebook Login for Business** (or Facebook Login).
- Scopes: `pages_show_list, pages_read_engagement, pages_manage_posts, business_management`
- Redirect URI: `http://localhost:3000/api/accounts/facebook/callback` → Facebook Login → Settings → Valid OAuth Redirect URIs.
- Env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- وضع Development كفاية طالما إنت Admin على التطبيق والصفحات. / Development mode is fine for your own pages.

### Instagram Business
- نفس تطبيق Meta. حساب إنستجرام Business/Creator ومربوط بصفحة فيسبوك. / Same Meta app; IG must be Business/Creator linked to a Page.
- Scopes: `instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management`
- Redirect URI: `http://localhost:3000/api/accounts/instagram/callback`
- Env: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` + **`MEDIA_PUBLIC_BASE_URL`** (tunnel).

### LinkedIn
- App: https://www.linkedin.com/developers/apps (محتاج LinkedIn Page للتطبيق) → Products: **Share on LinkedIn** + **Sign In with LinkedIn using OpenID Connect**.
- Scopes: `openid profile w_member_social`
- Redirect URI (Auth tab): `http://localhost:3000/api/accounts/linkedin/callback`
- Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (optional `LINKEDIN_VERSION`)
- التوكن 60 يوم؛ التجديد التلقائي بيشتغل بس لو لينكدإن ادّى refresh token، غير كده هيظهر تنبيه Reconnect.

### X (Twitter)
- التطبيق: https://console.x.com ← سجّل كمطوّر ← **New App** ← **User authentication settings**:
  - OAuth 2.0: **On** · App type: **Web App, Automated App or Bot** (Confidential client) · App permissions: **Read and write**
  - Callback URI / Redirect URL: `http://localhost:3000/api/accounts/x/callback` (لازم تطابق بالظبط) · Website URL: أي رابط ليك
- Scopes (بتتطلب تلقائيًا): `tweet.read tweet.write users.read offline.access media.write`
- Env: `X_CLIENT_ID`, `X_CLIENT_SECRET` (من Keys and tokens ← OAuth 2.0 Client ID and Client Secret)
- التوكن بيعيش ساعتين وبيتجدد تلقائيًا قبل النشر (offline.access). / Access tokens last 2h and are refreshed automatically.
- **التكلفة:** الـ X API بقى **دفع حسب الاستخدام (Credits)** — مفيش باقة مجانية للنشر. حسب docs.x.com/x-api/getting-started/pricing: إنشاء بوست ‎$0.015، وبوست فيه رابط ‎$0.200 (وقت كتابة الكود؛ الأسعار بتتغير). حط Spending limit في الـ Console.
- الحدود: `POST /2/tweets` = ‏100 لكل مستخدم / 15 دقيقة و10,000 للتطبيق / 24 ساعة. صور لحد 4 (5MB)، أو فيديو واحد (chunked).
- في Compose: عدّاد 280 بيحسب الروابط 23 والإيموجي 2، واختيار «قسّمه لسلسلة»، والتعليق الأول بيتنشر كـ Reply.

### YouTube
- https://console.cloud.google.com → New project → enable **YouTube Data API v3** → OAuth consent screen (External, add your Gmail as Test user) → Credentials → OAuth client ID → **Web application**.
- Scopes: `youtube.upload, youtube.readonly, youtube.force-ssl`
- Redirect URI: `http://localhost:3000/api/accounts/youtube/callback`
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- ملاحظة: في وضع Testing الـ refresh token بينتهي بعد 7 أيام، وفيديوهات التطبيقات غير المراجعة ممكن تتقفل Private. / In Testing mode refresh tokens expire after 7 days; unverified apps' uploads may be locked private.

### TikTok
- https://developers.tiktok.com → Manage apps → add **Login Kit** + **Content Posting API** (enable Direct Post).
- Scopes: `user.info.basic, video.publish, video.upload`
- Redirect URI: `http://localhost:3000/api/accounts/tiktok/callback` (تيك توك ممكن يطلب HTTPS → استخدم رابط التانل في `NUXT_PUBLIC_APP_URL`).
- Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`
- قبل مراجعة التطبيق (Audit) النشر بيكون `SELF_ONLY` بس.

بعد ما تربط كل حاجة حط `ENABLE_MOCK_PROVIDER=false`. / Set `ENABLE_MOCK_PROVIDER=false` when done.

## إنشاء فيديو / Video studio
صفحة "إنشاء فيديو": مونتاج محلي مجاني بـ FFmpeg (بيتنزل مع `npm install`، مش محتاج تسطب حاجة): صور/فيديوهات من المكتبة أو صور AI، سكريبت بالـ AI يتقسم مشاهد، نص عربي على الشاشة بخط Cairo، زووم Ken Burns، انتقالات، 9:16 / 1:1 / 16:9، موسيقى، كارت بداية/نهاية، لوجو، وتعليق صوتي اختياري (OpenAI/Gemini). الرندر بيحصل جوه الـ Worker، والفيديو بيتحفظ في المكتبة وتقدر تنشره بزرار "انشر الفيديو ده".
Local free montage with bundled FFmpeg; renders run in the worker and land in the media library. Optional AI video via fal.ai (`FAL_KEY`). Feeds can auto-render a short video per news item ("Make video" option).
لو FFmpeg مااشتغلش: `npm rebuild ffmpeg-static ffprobe-static` أو حط مسار ffmpeg.exe في `FFMPEG_PATH`.
Font: Cairo (SIL Open Font License, `assets/fonts/OFL.txt`).

## Templates & Poster Studio (step 5)
- **Settings → Brand kit (الهوية)**: logo (plus an optional version for light backgrounds; otherwise the logo is tinted dark automatically), primary/secondary/accent colours, font (IBM Plex Sans Arabic / Tajawal / Cairo, all OFL and bundled in `assets/fonts`), handle, website, default language.
- **Poster Studio (`/poster`)**: categories sport, politics-economy, medical, trend, breaking, quote. Templates: full-bleed photo, split light/dark, big number, type-only, breaking, quote. Sizes 4:5, 1:1, 9:16. Live preview, AI "fill from news text", AI image, focal-point crop. Save to library as JPEG, or press "انشره" to open Compose.
- **Video Studio**: "Design template" applies a category to every scene. Captions become branded lower-thirds with a reveal animation; intro/outro and text cards use the chosen template.
- **Feeds**: choose a design category/template per feed. Each item becomes a branded news card, or in video mode the video uses the template.
- Engine: `server/templates` (SVG → PNG via resvg, opentype.js for text measuring/auto-fit). API: `/api/design/{templates,preview,export,fill}`, `/api/brand`.

### Ready templates (قوالب جاهزة)
- 7 built-in Arabic poster presets at the top of Poster Studio. Video Studio has a "Presets" tab for your own saved video presets. Filter by category and language, then click one to load it into the editor.
- "Save design as preset" stores your own presets (`DesignPreset` table). Your presets can be renamed and deleted. Built-ins can only be duplicated.
- Starter photos are free-licensed Wikimedia Commons images; see `assets/CREDITS.md`. Thumbnails: `node scripts/build-preset-thumbs.mjs`.
- After updating, run `npx prisma migrate deploy` (new table).

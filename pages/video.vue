<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-2xl font-bold">🎬 {{ ui.t('video') }}</h1>
      <div class="flex rounded-xl border bg-white overflow-hidden text-sm ms-auto">
        <button class="px-3 py-1.5" :class="mode === 'local' ? 'bg-brand-600 text-white' : ''" @click="mode = 'local'">🖥 {{ ui.l('مونتاج محلي (مجاني)', 'Local montage (free)') }}</button>
        <button class="px-3 py-1.5" :class="mode === 'reel' ? 'bg-brand-600 text-white' : ''" @click="mode = 'reel'">📰 {{ ui.l('ريل أخبار «الكل»', 'News reel') }}</button>
        <button class="px-3 py-1.5" :class="mode === 'presets' ? 'bg-brand-600 text-white' : ''" @click="mode = 'presets'">📚 {{ ui.l('قوالب جاهزة', 'Presets') }}</button>
        <button class="px-3 py-1.5" :class="mode === 'ai' ? 'bg-brand-600 text-white' : ''" @click="mode = 'ai'">✨ {{ ui.l('فيديو بالذكاء الاصطناعي', 'AI video') }}</button>
      </div>
    </div>
    <p v-if="caps && !caps.worker" class="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">⚠️ {{ ui.l('الـ Worker واقف — الفيديو بيترندر جوه الـ Worker. شغّل npm run dev:all', 'Worker is not running — rendering happens in the worker. Run npm run dev:all') }}</p>
    <p v-else-if="caps && caps.ffmpeg === false" class="rounded-xl bg-red-50 text-red-700 p-3 text-sm">FFmpeg {{ ui.l('مش موجود. شغّل npm install تاني أو حط FFMPEG_PATH في .env', 'not found. Re-run npm install or set FFMPEG_PATH') }}</p>

    <p v-if="presetMsg" class="text-sm text-emerald-700">{{ presetMsg }}</p>
    <div v-show="mode === 'presets'" class="space-y-3">
      <PresetGallery ref="gallery" kind="video" @apply="applyPreset">
        <template #empty-action><button class="btn text-sm mt-3" @click="mode = 'local'">🎨 {{ ui.l('روح للمونتاج المحلي', 'Go to local montage') }}</button></template>
      </PresetGallery>
      <p class="text-sm text-slate-500">{{ ui.l('اختار قالب ← هيتطبق على المونتاج المحلي (التصنيف، الشكل، المقاس، نص أول مشهد وصورته). بعدين غيّر النص والصور وارندر.', 'Pick a preset → it is applied to the local montage (category, style, aspect, first scene text and photo). Then edit and render.') }}</p>
    </div>
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- LOCAL -->
      <div v-if="mode === 'local'" class="xl:col-span-2 space-y-4">
        <div class="card space-y-3">
          <h2 class="font-semibold">✍️ {{ ui.l('سكريبت بالـ AI (اختياري)', 'AI script (optional)') }}</h2>
          <textarea v-model="topic" rows="3" class="input" dir="auto" :placeholder="ui.l('اكتب الموضوع أو الصق نص الخبر...', 'Topic or paste a news text...')" />
          <div class="flex flex-wrap gap-2 items-center">
            <select v-model="spec.lang" class="rounded-lg border px-2 py-1.5 text-sm"><option value="ar">عربي</option><option value="en">English</option></select>
            <label class="text-sm text-slate-500">{{ ui.l('عدد المشاهد', 'Scenes') }}</label>
            <input v-model.number="sceneCount" type="number" min="2" max="10" class="rounded-lg border px-2 py-1 w-16 text-sm">
            <button class="btn !bg-violet-600 hover:!bg-violet-700 text-sm" :disabled="scriptBusy || !topic" @click="makeScript">✨ {{ scriptBusy ? '...' : ui.l('اكتب السكريبت', 'Write script') }}</button>
          </div>
          <p v-if="scriptError" class="text-sm text-red-600">{{ scriptError }}</p>
        </div>

        <div class="card space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">🎞 {{ ui.l('المشاهد', 'Scenes') }}</h2>
            <span class="text-sm text-slate-500">{{ ui.l('المدة', 'Length') }} ≈ {{ totalDuration.toFixed(1) }}s</span>
          </div>
          <div v-for="(sc, i) in spec.scenes" :key="sc.key" class="rounded-2xl border p-3 space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <b>#{{ i + 1 }}</b>
              <div class="flex rounded-lg border overflow-hidden ms-2">
                <button class="px-2 py-0.5" :class="sc.source === 'media' ? 'bg-slate-800 text-white' : ''" @click="sc.source = 'media'">{{ ui.l('من المكتبة', 'Library') }}</button>
                <button class="px-2 py-0.5" :class="sc.source === 'ai' ? 'bg-slate-800 text-white' : ''" @click="sc.source = 'ai'">🎨 AI</button>
                <button class="px-2 py-0.5" :class="sc.source === 'card' ? 'bg-slate-800 text-white' : ''" @click="sc.source = 'card'">{{ ui.l('كارت نص', 'Text card') }}</button>
              </div>
              <label class="ms-auto text-slate-500">⏱</label>
              <input v-model.number="sc.duration" type="number" min="1.5" max="60" step="0.5" class="rounded-lg border px-2 py-0.5 w-16">
              <button class="px-1" :disabled="i === 0" @click="move(i, -1)">↑</button>
              <button class="px-1" :disabled="i === spec.scenes.length - 1" @click="move(i, 1)">↓</button>
              <button class="text-red-600 px-1" @click="spec.scenes.splice(i, 1)">✕</button>
            </div>
            <ImageUploadField v-if="sc.source === 'media'" v-model="sc.mediaId" :items="library" :types="['image', 'video']" @uploaded="onUploaded" />
            <input v-if="sc.source === 'ai'" v-model="sc.imagePrompt" class="input text-sm" dir="ltr" placeholder="Image prompt (English works best)">
            <textarea v-model="sc.text" rows="2" class="input text-sm" dir="auto" :placeholder="ui.l('النص اللي هيظهر على الشاشة', 'On-screen text')" />
            <textarea v-if="spec.narration" v-model="sc.narration" rows="2" class="input text-sm" dir="auto" :placeholder="ui.l('نص التعليق الصوتي (لو فاضي هيستخدم النص)', 'Narration (defaults to on-screen text)')" />
          </div>
          <button class="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" @click="addScene()">+ {{ ui.l('مشهد', 'Scene') }}</button>
        </div>

        <div class="card grid md:grid-cols-2 gap-4 text-sm">
          <label>{{ ui.l('المقاس', 'Aspect') }}
            <div class="flex gap-2 mt-1"><button v-for="a in ['9:16', '1:1', '16:9']" :key="a" class="rounded-lg border px-3 py-1" :class="spec.aspect === a ? 'bg-brand-600 text-white border-brand-600' : ''" @click="spec.aspect = a">{{ a }}</button></div>
          </label>
          <label>{{ ui.l('الانتقال', 'Transition') }}
            <div class="flex gap-2 mt-1">
              <select v-model="spec.transition.type" class="input"><option v-for="t in caps?.transitions || ['fade']" :key="t">{{ t }}</option></select>
              <input v-model.number="spec.transition.duration" type="number" min="0" max="2" step="0.1" class="input !w-20">
            </div>
          </label>
          <div class="md:col-span-2 rounded-xl border p-3 space-y-2">
            <b>🎨 {{ ui.l('قالب التصميم (لكل المشاهد)', 'Design template (all scenes)') }}</b>
            <div class="flex flex-wrap gap-2">
              <button class="rounded-lg border px-3 py-1" :class="!spec.design.category ? 'bg-slate-800 text-white' : ''" @click="spec.design.category = ''">{{ ui.l('بدون (كلاسيك)', 'None (classic)') }}</button>
              <button v-for="(c, k) in design?.categories || {}" :key="k" class="rounded-lg border px-3 py-1 flex items-center gap-1.5" :class="spec.design.category === k ? 'ring-2 ring-offset-1' : ''" :style="spec.design.category === k ? { borderColor: c.accent } : {}" @click="spec.design.category = k"><span class="inline-block w-2.5 h-2.5 rounded-full" :style="{ background: c.accent }" />{{ c.label[ui.locale] || c.label.en }}</button>
            </div>
            <div v-if="spec.design.category" class="flex flex-wrap gap-2 items-center">
              <span class="text-slate-500">{{ ui.l('شكل الكروت (مقدمة/خاتمة/كارت نص):', 'Card style (intro/outro/text cards):') }}</span>
              <select v-model="spec.design.templateId" class="rounded-lg border px-2 py-1"><option v-for="t in cardTemplates" :key="t.id" :value="t.id">{{ t.name[ui.locale] || t.name.en }}</option></select>
              <input v-model="spec.design.source" class="rounded-lg border px-2 py-1" dir="auto" :placeholder="ui.l('المصدر (اختياري)', 'Source (optional)')">
              <span class="text-xs text-slate-400 w-full">{{ ui.l('الترجمة بتظهر كـ Lower-third بلون التصنيف وبحركة ظهور، وبتستخدم الهوية من الإعدادات.', 'Captions become category lower-thirds with a reveal animation, using your Brand kit.') }}</span>
            </div>
          </div>
          <label class="flex items-center gap-2"><input v-model="spec.kenBurns" type="checkbox"> {{ ui.l('حركة زووم على الصور (Ken Burns)', 'Ken Burns zoom/pan') }}</label>
          <label>{{ ui.l('مكان النص', 'Caption position') }}
            <select v-model="spec.captionPosition" class="input mt-1"><option value="bottom">{{ ui.l('تحت', 'Bottom') }}</option><option value="center">{{ ui.l('النص', 'Center') }}</option><option value="top">{{ ui.l('فوق', 'Top') }}</option></select>
          </label>
          <div>{{ ui.l('موسيقى خلفية', 'Background music') }}
            <MediaPicker v-model="musicId" class="mt-1" :items="library" :types="['other', 'video']" :placeholder="ui.l('اختار ملف صوت (ارفعه من صفحة الميديا)', 'Pick audio (upload in Media)')" :empty="ui.l('ارفع ملف mp3 من صفحة الميديا', 'Upload an mp3 in Media')" />
            <input v-if="musicId" v-model.number="musicVolume" type="range" min="0" max="1" step="0.05" class="w-full mt-1">
          </div>
          <div>{{ ui.l('لوجو (علامة مائية)', 'Logo watermark') }}
            <MediaPicker v-model="spec.logoMediaId" class="mt-1" :items="library" :types="['image']" :placeholder="ui.l('اختار صورة PNG', 'Pick a PNG')" />
          </div>
          <div class="space-y-1">
            <label class="flex items-center gap-2"><input v-model="useIntro" type="checkbox"> {{ ui.l('كارت بداية', 'Intro card') }}</label>
            <template v-if="useIntro"><input v-model="intro.title" class="input" dir="auto" :placeholder="ui.l('العنوان', 'Title')"><input v-model="intro.subtitle" class="input" dir="auto" :placeholder="ui.l('عنوان فرعي', 'Subtitle')"></template>
          </div>
          <div class="space-y-1">
            <label class="flex items-center gap-2"><input v-model="useOutro" type="checkbox"> {{ ui.l('كارت نهاية', 'Outro card') }}</label>
            <template v-if="useOutro"><input v-model="outro.title" class="input" dir="auto" :placeholder="ui.l('تابعونا...', 'Follow us...')"><input v-model="outro.subtitle" class="input" dir="auto"></template>
          </div>
          <label class="flex items-center gap-2" :class="caps?.tts ? '' : 'opacity-50'">
            <input v-model="spec.narration" type="checkbox" :disabled="!caps?.tts"> 🎙 {{ ui.l('تعليق صوتي بالـ AI', 'AI narration') }}
            <span class="text-xs text-slate-500">{{ caps?.tts ? `(${caps.tts})` : ui.l('(محتاج OPENAI_API_KEY أو GEMINI_API_KEY)', '(needs OpenAI/Gemini key)') }}</span>
          </label>
          <label class="flex items-center gap-2"><input v-model="draftQuality" type="checkbox"> ⚡ {{ ui.l('جودة سريعة للتجربة (720p)', 'Fast draft quality (720p)') }}</label>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <input v-model="title" class="input !w-72" dir="auto" :placeholder="ui.l('اسم الفيديو', 'Video name')">
          <button class="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" :disabled="!spec.design.category" :title="ui.l('اختار قالب تصميم الأول', 'Choose a design template first')" @click="saveAsPreset">⭐ {{ ui.l('احفظ كقالب', 'Save as preset') }}</button>
          <button class="btn" :disabled="busy || !spec.scenes.length" @click="render">🎬 {{ ui.l('ابدأ الرندر', 'Render') }}</button>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>
      </div>

      <!-- NEWS REEL (الكل) -->
      <div v-else-if="mode === 'reel'" class="xl:col-span-2 space-y-4">
        <div class="card space-y-3">
          <h2 class="font-semibold">📰 {{ ui.l('ريل أخبار طولي 9:16 — بداية ونهاية ثابتة + مؤثرات صوتية', 'Vertical 9:16 news reel — fixed intro/outro + SFX') }}</h2>
          <div class="flex flex-wrap gap-2">
            <button v-for="c in reelCats" :key="c.key" class="rounded-lg border px-3 py-1 flex items-center gap-1.5 text-sm" :class="reel.category === c.key ? 'ring-2 ring-offset-1' : ''" :style="reel.category === c.key ? { borderColor: c.color } : {}" @click="reel.category = c.key"><span class="inline-block w-2.5 h-2.5 rounded-sm" :style="{ background: c.color }" />{{ c.label }}</button>
          </div>
          <p class="text-sm">🎨 {{ ui.l('قالب الفئة:', 'Category template:') }} <b>{{ reelStyleHint[reel.category] }}</b> · 🎵 {{ ui.l('موسيقى خاصة بالفئة', 'own music bed') }}</p>
          <p class="text-xs text-slate-500">{{ ui.l('كل خبر: صورة + عنوان + نص قصير اختياري. البداية والنهاية واللوجو ثابتين، والشكل والحركة والموسيقى بيتغيروا حسب الفئة.', 'Each item: image + title + optional short text. Intro/outro/logo/SFX are fixed; colour follows the category.') }}</p>
        </div>
        <div class="card space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">🗞 {{ ui.l('الأخبار', 'Items') }}</h2>
            <span class="text-sm" :class="reelDuration > 180 ? 'text-red-600' : 'text-slate-500'">≈ {{ reelDuration.toFixed(1) }}s / 180s</span>
          </div>
          <div v-for="(it, i) in reel.items" :key="it.key" class="rounded-2xl border p-3 space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <b>{{ i + 1 }}</b>
              <label class="ms-auto text-slate-500">⏱</label>
              <input v-model.number="it.duration" type="number" min="3" max="20" step="0.5" class="rounded-lg border px-2 py-0.5 w-16">
              <button class="px-1" :disabled="i === 0" @click="moveItem(i, -1)">↑</button>
              <button class="px-1" :disabled="i === reel.items.length - 1" @click="moveItem(i, 1)">↓</button>
              <button class="text-red-600 px-1" @click="reel.items.splice(i, 1)">✕</button>
            </div>
            <ImageUploadField v-model="it.mediaId" :items="library" :types="['image']" @uploaded="onUploaded" />
            <input v-model="it.title" class="input text-sm" dir="auto" maxlength="160" :placeholder="ui.l('العنوان', 'Headline')">
            <textarea v-model="it.body" rows="2" class="input text-sm" dir="auto" maxlength="220" :placeholder="ui.l('نص قصير (اختياري)', 'Short text (optional)')" />
            <div v-if="reel.category === 'economy'" class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-slate-500">📈 {{ ui.l('رقم بارز (اختياري)', 'Stat (optional)') }}</span>
              <input v-model="it.stat.value" class="input !w-28" dir="ltr" maxlength="12" placeholder="4.2%">
              <select v-model="it.stat.dir" class="input !w-28"><option value="">—</option><option value="up">▲ {{ ui.l('صعود', 'Up') }}</option><option value="down">▼ {{ ui.l('هبوط', 'Down') }}</option></select>
              <input v-model="it.stat.label" class="input !w-40" dir="auto" maxlength="24" :placeholder="ui.l('وصف الرقم', 'Label')">
            </div>
          </div>
          <button class="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50" @click="addItem()">+ {{ ui.l('خبر', 'Item') }}</button>
        </div>
        <div class="card grid md:grid-cols-2 gap-4 text-sm">
          <label>{{ ui.l('الحساب في النهاية', 'Handle in outro') }}<input v-model="reel.handle" class="input mt-1" dir="ltr" placeholder="@alkol"></label>
          <label>{{ ui.l('جملة النهاية', 'Outro call to action') }}<input v-model="reel.cta" class="input mt-1" dir="auto" placeholder="تابعونا"></label>
          <div>{{ ui.l('موسيقى خلفية (اختياري — بتوطى تحت المؤثرات)', 'Music bed (optional, ducked under SFX)') }}
            <MediaPicker v-model="reelMusic" class="mt-1" :items="library" :types="['other', 'video']" :placeholder="ui.l('اختار ملف صوت', 'Pick audio')" />
            <input v-if="reelMusic" v-model.number="reelMusicVolume" type="range" min="0" max="1" step="0.05" class="w-full mt-1">
          </div>
          <div class="space-y-1">
            <label class="flex items-center gap-2"><input v-model="reel.sfx" type="checkbox"> 🔊 {{ ui.l('مؤثرات صوتية (البداية والنهاية)', 'Sound effects (intro & outro)') }}</label>
            <label class="flex items-center gap-2" :class="{ 'opacity-50': reelMusic || !reelBeds.includes(reel.category) }"><input v-model="reel.categoryMusic" type="checkbox" :disabled="!!reelMusic || !reelBeds.includes(reel.category)"> 🎵 {{ ui.l('موسيقى الفئة الهادية', 'Calm category music') }}
              <span class="text-xs text-slate-500">{{ reelMusic ? ui.l('(الموسيقى اللي اخترتها هتتشغل بدلها)', '(your music overrides it)') : !reelBeds.includes(reel.category) ? ui.l('(مش متاحة للفئة دي)', '(not available for this category)') : '' }}</span></label>
            <label class="flex items-center gap-2"><input v-model="draftQuality" type="checkbox"> ⚡ {{ ui.l('جودة سريعة للتجربة (720p)', 'Fast draft (720p)') }}</label>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <input v-model="title" class="input !w-72" dir="auto" :placeholder="ui.l('اسم الفيديو', 'Video name')">
          <button class="btn" :disabled="busy || !reelReady" @click="renderReel">🎬 {{ ui.l('ارندر الريل', 'Render reel') }}</button>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>
      </div>

      <!-- AI VIDEO -->
      <div v-else class="xl:col-span-2 space-y-4">
        <div v-for="p in caps?.aiVideo || []" :key="p.id" class="card space-y-3">
          <div class="flex items-center gap-2"><h2 class="font-semibold">{{ p.name }}</h2>
            <span v-if="!p.configured" class="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">{{ ui.l('محتاج مفتاح', 'Needs key') }}</span></div>
          <template v-if="p.configured">
            <textarea v-model="aiPrompt" rows="4" class="input" dir="auto" :placeholder="ui.l('اوصف الفيديو (يفضل بالإنجليزي)', 'Describe the video')" />
            <div class="grid md:grid-cols-3 gap-2 text-sm">
              <MediaPicker v-model="aiImage" :items="library" :types="['image']" :placeholder="ui.l('صورة بداية (اختياري)', 'Start image (optional)')" />
              <select v-model="aiAspect" class="input"><option>9:16</option><option>1:1</option><option>16:9</option></select>
              <select v-model.number="aiDuration" class="input"><option :value="5">5s</option><option :value="10">10s</option></select>
            </div>
            <button class="btn" :disabled="busy || !aiPrompt" @click="renderAi(p.id)">✨ {{ ui.l('ولّد الفيديو', 'Generate') }}</button>
            <p class="text-xs text-slate-500">{{ ui.l('بيتكلف حسب أسعار fal.ai وبياخد من دقيقة لكام دقيقة.', 'Billed by fal.ai; takes a few minutes.') }}</p>
          </template>
          <p v-else class="text-sm text-slate-600">{{ ui.l('حط FAL_KEY في .env (من fal.ai/dashboard/keys) وأعد التشغيل.', 'Set FAL_KEY in .env (fal.ai/dashboard/keys) and restart.') }}</p>
          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        </div>
      </div>

      <!-- JOBS -->
      <div class="space-y-3">
        <h2 class="font-semibold text-slate-600">{{ ui.l('الفيديوهات', 'Videos') }}</h2>
        <p v-if="!jobs?.length" class="card text-sm text-slate-500">{{ ui.l('لسه مفيش فيديوهات', 'No videos yet') }}</p>
        <div v-for="j in jobs" :key="j.id" class="card !p-3 space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <span>{{ j.kind === 'ai' ? '✨' : '🎬' }}</span><span class="font-semibold truncate flex-1" dir="auto">{{ j.title }}</span>
            <span class="text-xs rounded-full px-2 py-0.5" :class="jobCls[j.state]">{{ jobLabel(j.state) }}</span>
          </div>
          <div v-if="j.state === 'QUEUED' || j.state === 'RENDERING'">
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-brand-600 transition-all" :style="{ width: j.progress + '%' }" /></div>
            <div class="text-xs text-slate-500 mt-1">{{ j.progress }}% <span v-if="j.stage">· {{ j.stage }}</span></div>
          </div>
          <p v-if="j.error" class="text-xs text-red-600">{{ j.error }}</p>
          <template v-if="j.output">
            <video :src="j.output.url" :poster="j.output.thumbUrl || undefined" controls preload="none" class="w-full max-h-96 rounded-xl bg-black" />
            <div class="flex gap-2 text-sm">
              <NuxtLink :to="`/compose?media=${j.output.id}`" class="btn !py-1.5 flex-1">📤 {{ ui.l('انشر الفيديو ده', 'Post this video') }}</NuxtLink>
              <a :href="j.output.url" download class="rounded-xl border px-3 py-1.5">⬇</a>
            </div>
            <div class="text-xs text-slate-400">{{ j.output.width }}×{{ j.output.height }} · {{ Math.round(j.output.duration || 0) }}s · {{ (j.output.size / 1048576).toFixed(1) }}MB</div>
          </template>
          <button v-if="j.state !== 'RENDERING'" class="text-xs text-slate-400 hover:text-red-600" @click="removeJob(j)">{{ ui.l('حذف من القائمة', 'Remove') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const ui = useUiStore()
const mode = ref('local')
const { data: caps } = await useFetch('/api/video/capabilities')
const { data: libData, refresh: refreshLibrary } = await useFetch('/api/media', { default: () => [] })
const { data: jobs, refresh: refreshJobs } = await useFetch('/api/video/jobs', { default: () => [] })
const library = computed(() => libData.value)
function onUploaded (m) { libData.value = [m, ...(libData.value || [])]; refreshLibrary() }
const { data: design } = await useFetch('/api/design/templates')
const cardTemplates = computed(() => (design.value?.templates || []).filter(t => !t.needsStat && (t.categories === '*' || t.categories.includes(spec.design.category))))

let key = 0
const newScene = (o = {}) => ({ key: ++key, source: o.imagePrompt && !o.mediaId ? 'ai' : o.source || 'media', mediaId: null, imagePrompt: '', text: '', narration: '', duration: 4, ...o })
const spec = reactive({ aspect: '9:16', lang: ui.locale, transition: { type: 'fade', duration: 0.6 }, kenBurns: true, captionPosition: 'bottom', narration: false, logoMediaId: null, design: { category: '', templateId: 'type-only', source: '' }, scenes: [newScene(), newScene(), newScene()] })
const title = ref('')
const topic = ref('')
const sceneCount = ref(4)
const musicId = ref(null)
const musicVolume = ref(0.25)
const useIntro = ref(false); const intro = reactive({ title: '', subtitle: '' })
const useOutro = ref(false); const outro = reactive({ title: '', subtitle: '' })
const draftQuality = ref(false)
const busy = ref(false); const error = ref('')
const scriptBusy = ref(false); const scriptError = ref('')
const aiPrompt = ref(''); const aiImage = ref(null); const aiAspect = ref('9:16'); const aiDuration = ref(5)

const totalDuration = computed(() => {
  const d = spec.scenes.reduce((a, s) => a + (Number(s.duration) || 0), 0) + (useIntro.value ? 2.5 : 0) + (useOutro.value ? 2.5 : 0)
  const n = spec.scenes.length + (useIntro.value ? 1 : 0) + (useOutro.value ? 1 : 0)
  return Math.max(0, d - (n - 1) * (Number(spec.transition.duration) || 0))
})
const jobCls = { QUEUED: 'bg-slate-100', RENDERING: 'bg-sky-100 text-sky-800', DONE: 'bg-emerald-100 text-emerald-800', ERROR: 'bg-red-100 text-red-700' }
const jobLabel = s => ({ QUEUED: ui.l('في الطابور', 'Queued'), RENDERING: ui.l('بيترندر', 'Rendering'), DONE: ui.l('جاهز', 'Done'), ERROR: ui.l('خطأ', 'Error') }[s])

const gallery = ref(null); const presetMsg = ref('')
async function applyPreset (p) {
  const x = p.data
  spec.design.category = x.category; spec.design.templateId = x.templateId || 'type-only'; spec.design.source = x.source || ''
  spec.aspect = x.aspect || '9:16'; spec.lang = x.lang || 'ar'
  if (!spec.scenes.length) addScene()
  const first = spec.scenes[0]
  first.text = x.headline || ''
  let mediaId = x.mediaId || null
  if (!mediaId && x.starterPhoto) {
    try { const m = await $fetch('/api/design/starter-photo', { method: 'POST', body: { key: x.starterPhoto } }); mediaId = m.id; await refreshLibrary() } catch {}
  }
  if (mediaId) { first.source = 'media'; first.mediaId = mediaId }
  const ph = gallery.value?.photos?.[x.starterPhoto]
  presetMsg.value = ph && !x.mediaId ? ui.l(`اتطبق ✓ — صورة البداية من Wikimedia (${ph.author} · ${ph.license})، مش صورتك. استبدلها أو اذكر المصدر.`, `Applied ✓ — starter photo from Wikimedia (${ph.author} · ${ph.license}), not yours. Replace or credit it.`) : ui.l('اتطبق ✓', 'Applied ✓')
  mode.value = 'local'
}
async function saveAsPreset () {
  const n = prompt(ui.l('اسم القالب', 'Preset name'), (spec.scenes[0]?.text || '').slice(0, 40))
  if (!n) return
  const first = spec.scenes[0] || {}
  try {
    await gallery.value.save(n, { category: spec.design.category, templateId: spec.design.templateId, source: spec.design.source, aspect: spec.aspect, lang: spec.lang, headline: first.text || '', mediaId: first.source === 'media' ? first.mediaId : null })
    presetMsg.value = ui.l('اتحفظ كقالب ⭐', 'Saved as preset ⭐')
  } catch (e) { error.value = e.data?.statusMessage || e.message }
}
function addScene (o) { spec.scenes.push(newScene(o)) }
function move (i, d) { const s = spec.scenes.splice(i, 1)[0]; spec.scenes.splice(i + d, 0, s) }

async function makeScript () {
  scriptError.value = ''; scriptBusy.value = true
  try {
    const r = await $fetch('/api/video/script', { method: 'POST', body: { topic: topic.value, lang: spec.lang, scenes: sceneCount.value, aspect: spec.aspect } })
    spec.scenes = r.scenes.map(s => newScene({ ...s, source: 'ai' }))
    if (r.title) { title.value = r.title; if (!intro.title) intro.title = r.title }
  } catch (e) { scriptError.value = e.data?.statusMessage || e.message } finally { scriptBusy.value = false }
}

async function render () {
  error.value = ''; busy.value = true
  try {
    const body = {
      title: title.value,
      spec: {
        ...spec,
        quality: draftQuality.value ? 'draft' : 'hd',
        scenes: spec.scenes.map(s => ({ text: s.text, narration: s.narration || null, duration: s.duration, mediaId: s.source === 'media' ? s.mediaId : null, imagePrompt: s.source === 'ai' ? s.imagePrompt : '' })),
        music: musicId.value ? { mediaId: musicId.value, volume: musicVolume.value } : null,
        intro: useIntro.value ? { ...intro } : null,
        outro: useOutro.value ? { ...outro } : null
      }
    }
    await $fetch('/api/video/jobs', { method: 'POST', body })
    await refreshJobs()
  } catch (e) { error.value = e.data?.statusMessage || e.message } finally { busy.value = false }
}
// News reel (الكل): timings mirror server/lib/video/reel.js (intro 2.5s, outro 3s, 0.5s transitions).
const reelCats = [
  { key: 'sport', label: 'رياضة', color: '#00C853' }, { key: 'economy', label: 'اقتصاد', color: '#FFB300' }, { key: 'politics', label: 'سياسة', color: '#2F6BFF' },
  { key: 'trend', label: 'ترند', color: '#FF2D87' }, { key: 'health', label: 'صحة', color: '#00BFA5' }, { key: 'breaking', label: 'عاجل', color: '#FF1F1F' }
]
const newItem = () => ({ key: ++key, mediaId: null, title: '', body: '', duration: 7, stat: { value: '', dir: '', label: '' } })
const reelBeds = ['sport', 'economy', 'politics', 'trend', 'health', 'breaking'] // categories with a generated music bed (server/lib/video/music.js BEDS)
const reelStyleHint = { sport: 'حماسي — كشف السطور', economy: 'بيانات — رقم بارز + سهم', politics: 'رسمي — شريط سفلي وحركة هادية', trend: 'مرح — خط أعرض وظهور سريع', health: 'هادي — كارت فاتح بحواف ناعمة', breaking: 'عاجل — بانر أحمر كبير' }
const reel = reactive({ category: 'sport', handle: '@alkol', cta: 'تابعونا', sfx: true, categoryMusic: true, items: [newItem(), newItem(), newItem()] })
const reelMusic = ref(null); const reelMusicVolume = ref(0.25)
const reelDuration = computed(() => 2.5 + 3 + reel.items.reduce((a, it) => a + (Number(it.duration) || 7), 0) - 0.5 * (reel.items.length + 1))
const reelReady = computed(() => reel.items.some(it => it.mediaId && it.title.trim()) && reelDuration.value <= 180)
function addItem () { reel.items.push(newItem()) }
function moveItem (i, d) { const s = reel.items.splice(i, 1)[0]; reel.items.splice(i + d, 0, s) }
async function renderReel () {
  error.value = ''; busy.value = true
  try {
    const spec = { template: 'news-reel', ...reel, quality: draftQuality.value ? 'draft' : 'hd', items: reel.items.filter(it => it.mediaId && it.title.trim()).map(({ key: _k, stat, ...it }) => ({ ...it, stat: reel.category === 'economy' && stat?.value?.trim() ? stat : null })), music: reelMusic.value ? { mediaId: reelMusic.value, volume: reelMusicVolume.value } : null }
    await $fetch('/api/video/jobs', { method: 'POST', body: { title: title.value, spec } })
    await refreshJobs()
  } catch (e) { error.value = e.data?.statusMessage || e.message } finally { busy.value = false }
}
async function renderAi (provider) {
  error.value = ''; busy.value = true
  try { await $fetch('/api/video/jobs', { method: 'POST', body: { kind: 'ai', provider, prompt: aiPrompt.value, imageMediaId: aiImage.value, aspect: aiAspect.value, duration: aiDuration.value } }); await refreshJobs() } catch (e) { error.value = e.data?.statusMessage || e.message } finally { busy.value = false }
}
async function removeJob (j) { try { await $fetch(`/api/video/jobs/${j.id}`, { method: 'DELETE' }); await refreshJobs() } catch (e) { error.value = e.data?.statusMessage || e.message } }

onMounted(() => {
  const t = setInterval(() => { if (jobs.value?.some(j => j.state === 'QUEUED' || j.state === 'RENDERING')) refreshJobs() }, 2000)
  onBeforeUnmount(() => clearInterval(t))
})
</script>

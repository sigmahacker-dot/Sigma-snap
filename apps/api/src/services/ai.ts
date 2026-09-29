import { env } from '../config/env';
import { providerNotConfigured } from '../utils/errors';

export type AiLanguage = 'ur' | 'roman-ur' | 'en' | 'ar' | 'hi';

export const AI_LANGUAGES: AiLanguage[] = ['ur', 'roman-ur', 'en', 'ar', 'hi'];

export interface EffectPipeline {
  filter: string;
  overlays: string[];
  colorGrade: Record<string, number | string>;
  params?: Record<string, unknown>;
}

export interface AiProvider {
  name: string;
  caption(input: { context?: string; language: AiLanguage }): Promise<{ text: string }>;
  hashtags(input: { caption?: string; language: AiLanguage }): Promise<{ hashtags: string[] }>;
  title(input: { context?: string; language: AiLanguage }): Promise<{ title: string }>;
  script(input: {
    topic: string;
    durationSec?: number;
    language: AiLanguage;
  }): Promise<{ script: string; beats: { time: string; line: string }[] }>;
  ideas(input: {
    kind: 'story' | 'video';
    niche?: string;
    language: AiLanguage;
  }): Promise<{ ideas: string[] }>;
  effect(input: { prompt: string; language?: AiLanguage }): Promise<{ pipeline: EffectPipeline }>;
  subtitles(input: {
    assetId: string;
    durationSec?: number;
    language: AiLanguage;
  }): Promise<{ vtt: string }>;
  translate(input: { text: string; targetLang: AiLanguage }): Promise<{ text: string }>;
  background(input: { assetId: string; prompt: string }): Promise<{ spec: Record<string, unknown> }>;
  thumbnailSpec(input: { postId: string; caption?: string }): Promise<{ spec: Record<string, unknown> }>;
}

// ─── tiny deterministic picker (stable output for the same input) ───────────

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: string, n = 1): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < Math.min(n, arr.length); i++) {
    let idx = (hashStr(seed + ':' + i * 7919) + i * 131) % arr.length;
    while (used.has(idx)) idx = (idx + 1) % arr.length;
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
}

// ─── multilingual template banks (original copy, 5 languages) ───────────────

const CAPTIONS: Record<AiLanguage, string[]> = {
  en: [
    'Chasing light, catching moments. ✨',
    'A little slice of today, saved forever.',
    'Golden hour hits different here.',
    'Plot twist: this is my favorite part of the day.',
    'Collecting memories, one frame at a time.',
    'No filter needed when the vibe is this real.',
    'Small moments, big feelings.',
  ],
  'roman-ur': [
    'Roshni ka peecha, lamhon ki giraft. ✨',
    'Aaj ka chhota sa hissa, hamesha ke liye mehfooz.',
    'Golden hour yahan kuch aur hi lagta hai.',
    'Yaadein jama kar raha hoon, ek frame ek waqt mein.',
    'Chhote lamhe, gehre ehsaas.',
    'Filter ki zaroorat nahi jab vibe itni asli ho.',
  ],
  ur: [
    'روشنی کا پیچھا، لمحوں کی گرفت۔ ✨',
    'آج کا چھوٹا سا حصہ، ہمیشہ کے لیے محفوظ۔',
    'یہاں گولڈن آور کچھ اور ہی لگتا ہے۔',
    'یادیں جمع کر رہا ہوں، ایک فریم ایک وقت میں۔',
    'چھوٹے لمحے، گہرے احساس۔',
  ],
  ar: [
    'أطارد الضوء وألتقط اللحظات. ✨',
    'شريحة صغيرة من اليوم، محفوظة للأبد.',
    'الساعة الذهبية هنا مختلفة تمامًا.',
    'أجمع الذكريات، إطارًا في كل مرة.',
    'لحظات صغيرة، مشاعر كبيرة.',
  ],
  hi: [
    'रोशनी का पीछा, लम्हों की गिरफ़्त। ✨',
    'आज का छोटा सा हिस्सा, हमेशा के लिए महफ़ूज़।',
    'यहाँ गोल्डन आवर कुछ और ही लगता है।',
    'यादें जमा कर रहा हूँ, एक फ़्रेम एक बार में।',
    'छोटे लम्हे, गहरे एहसास।',
  ],
};

const HASHTAG_BANK: Record<AiLanguage, string[]> = {
  en: ['sigmasnap', 'dailymoments', 'goldenhour', 'candidvibes', 'creatorspotlight', 'behindthescenes', 'moodboard', 'visualdiary', 'explorepage', 'storytime'],
  'roman-ur': ['sigmasnap', 'rozmarra', 'goldenhourpk', 'desivibes', 'yaadein', 'candidpk', 'creatorpk', 'moodboard', 'visualdiary'],
  ur: ['sigmasnap', 'یادیں', 'گولڈن_آور', 'روزمرہ', 'تخلیق_کار'],
  ar: ['sigmasnap', 'ذكريات', 'الساعة_الذهبية', 'يوميات', 'صناع_المحتوى'],
  hi: ['sigmasnap', 'यादें', 'गोल्डन_आवर', 'रोज़मर्रा', 'क्रिएटर'],
};

const TITLES: Record<AiLanguage, string[]> = {
  en: ['A Day in Frames', 'Chasing Light', 'The Quiet Hours', 'Unfiltered', 'Moments Like These', 'Neon Reverie'],
  'roman-ur': ['Frames Mein Ek Din', 'Roshni Ka Safar', 'Khamosh Lamhe', 'Bina Filter', 'Aise Lamhe'],
  ur: ['فریموں میں ایک دن', 'روشنی کا سفر', 'خاموش لمحے', 'بغیر فلٹر'],
  ar: ['يوم في إطارات', 'مطاردة الضوء', 'الساعات الهادئة', 'بدون فلتر'],
  hi: ['फ़्रेमों में एक दिन', 'रोशनी का सफ़र', 'ख़ामोश लम्हे', 'बिना फ़िल्टर'],
};

const IDEA_BANK: Record<AiLanguage, { story: string[]; video: string[] }> = {
  en: {
    story: [
      'Poll: coffee vs chai — settle it once and for all',
      'Behind-the-scenes of your desk setup',
      'A 3-photo mini tour of your street at dusk',
      'Ask-me-anything question sticker, answer 5',
      'Before/after of today\'s skyline',
    ],
    video: [
      '60-second morning routine, shot in reverse',
      'Street food hop: 3 stalls, 3 bites, 1 verdict',
      'Teach one skill you know in under a minute',
      'Golden-hour walk with a voiceover diary entry',
      'Day-in-the-life, but only the tiny details',
    ],
  },
  'roman-ur': {
    story: [
      'Poll: chai vs coffee — aaj faisla kar lo',
      'Apne desk setup ka behind-the-scenes',
      'Shaam ko apni gali ka 3-photo tour',
      'Question sticker: 5 sawalon ke jawab do',
    ],
    video: [
      '60 second ki morning routine, reverse mein',
      'Street food tour: 3 stalls, 3 bites, 1 faisla',
      'Ek minute mein koi ek skill sikhao',
      'Golden hour walk + voiceover diary',
    ],
  },
  ur: {
    story: ['پول: چائے بمقابلہ کافی — آج فیصلہ کر لیں', 'اپنے ڈیسک کا پردے کے پیچھے منظر', 'شام کو اپنی گلی کا تصویری دورہ'],
    video: ['60 سیکنڈ کی صبح کی روٹین', 'اسٹریٹ فوڈ کا دورہ', 'ایک منٹ میں کوئی ہنر سکھائیں'],
  },
  ar: {
    story: ['استطلاع: شاي أم قهوة — لنحسمها اليوم', 'كواليس مكتبك', 'جولة مصورة في حيّك وقت الغروب'],
    video: ['روتين الصباح في ٦٠ ثانية', 'جولة طعام الشارع', 'علّم مهارة في أقل من دقيقة'],
  },
  hi: {
    story: ['पोल: चाय vs कॉफ़ी — आज फ़ैसला कर लो', 'अपने डेस्क का बिहाइंड-द-सीन्स', 'शाम को अपनी गली का फ़ोटो टूर'],
    video: ['60 सेकंड की मॉर्निंग रूटीन', 'स्ट्रीट फ़ूड टूर', 'एक मिनट में कोई स्किल सिखाओ'],
  },
};

const SCRIPT_OPENERS: Record<AiLanguage, string[]> = {
  en: ['Here\'s something nobody tells you about {topic}.', 'I tried {topic} for a week — here\'s what happened.'],
  'roman-ur': ['{topic} ke baare mein koi ye nahi batata.', 'Maine ek hafta {topic} try kiya — ye hua.'],
  ur: ['{topic} کے بارے میں کوئی یہ نہیں بتاتا۔'],
  ar: ['إليك ما لا يخبرك به أحد عن {topic}.'],
  hi: ['{topic} के बारे में कोई ये नहीं बताता।'],
};

const SCRIPT_MIDDLES: Record<AiLanguage, string[]> = {
  en: ['First, {topic} is simpler than it looks.', 'The trick is consistency, not intensity.', 'Most people quit right before it clicks.'],
  'roman-ur': ['Pehle, {topic} dikhta jitna mushkil nahi.', 'Trick consistency mein hai, intensity mein nahi.', 'Aksar log usi waqt haar maante hain jab baat banne wali hoti hai.'],
  ur: ['پہلے، {topic} جتنا مشکل لگتا ہے اتنا نہیں۔', 'اصل چال مستقل مزاجی میں ہے۔'],
  ar: ['أولًا، {topic} أبسط مما يبدو.', 'السر في الاستمرارية لا الشدة.'],
  hi: ['पहले, {topic} जितना मुश्किल लगता है उतना नहीं।', 'असल चाल निरंतरता में है।'],
};

const SCRIPT_CLOSERS: Record<AiLanguage, string[]> = {
  en: ['Save this for later — you\'ll thank yourself.', 'Follow for part two.'],
  'roman-ur': ['Ise save kar lo — baad mein kaam aayega.', 'Part two ke liye follow karo.'],
  ur: ['اسے محفوظ کر لیں — بعد میں کام آئے گا۔'],
  ar: ['احفظ هذا لوقت لاحق.', 'تابعني للجزء الثاني.'],
  hi: ['इसे सेव कर लो — बाद में काम आएगा।'],
};

// ─── effect keyword → pipeline mapping ──────────────────────────────────────

interface EffectRule {
  keywords: string[];
  pipeline: EffectPipeline;
}

const EFFECT_RULES: EffectRule[] = [
  {
    keywords: ['rainy night', 'rainy', 'rain', 'barish', 'مطر', 'بارش'],
    pipeline: {
      filter: 'noir-cool',
      overlays: ['rain', 'vignette'],
      colorGrade: { temperature: -30, tint: 10, contrast: 1.15, saturation: 0.85, shadows: '#1a2340', highlights: '#cfe6ff' },
    },
  },
  {
    keywords: ['cinematic', 'film', 'movie', 'سنیما', 'سينمائي'],
    pipeline: {
      filter: 'teal-orange',
      overlays: ['letterbox', 'film-grain'],
      colorGrade: { temperature: 5, tint: -5, contrast: 1.25, saturation: 1.05, shadows: '#0d2b33', highlights: '#ffd9a0' },
    },
  },
  {
    keywords: ['golden hour', 'sunset', 'sunrise', 'warm', 'غروب', 'سنہری'],
    pipeline: {
      filter: 'golden-warm',
      overlays: ['light-leak', 'soft-glow'],
      colorGrade: { temperature: 35, tint: 5, contrast: 1.05, saturation: 1.15, shadows: '#3a2410', highlights: '#ffe9c4' },
    },
  },
  {
    keywords: ['neon', 'cyberpunk', 'night city'],
    pipeline: {
      filter: 'neon-pop',
      overlays: ['neon-glow', 'scanlines'],
      colorGrade: { temperature: -10, tint: 15, contrast: 1.3, saturation: 1.4, shadows: '#12041f', highlights: '#7df9ff' },
    },
  },
  {
    keywords: ['vintage', 'retro', '1970s', 'old film', 'پرانا'],
    pipeline: {
      filter: 'vintage-sepia',
      overlays: ['film-grain', 'vignette', 'dust-scratches'],
      colorGrade: { temperature: 20, tint: 0, contrast: 0.95, saturation: 0.7, shadows: '#2b1d0e', highlights: '#f5e6c8' },
    },
  },
  {
    keywords: ['black and white', 'monochrome', 'noir', 'bw', 'سیاہ سفید', 'أبيض وأسود'],
    pipeline: {
      filter: 'mono-chrome',
      overlays: ['vignette'],
      colorGrade: { temperature: 0, tint: 0, contrast: 1.2, saturation: 0, shadows: '#0a0a0a', highlights: '#f2f2f2' },
    },
  },
  {
    keywords: ['dreamy', 'soft', 'ethereal', 'خواب'],
    pipeline: {
      filter: 'dream-soft',
      overlays: ['bloom', 'light-leak'],
      colorGrade: { temperature: 10, tint: 5, contrast: 0.9, saturation: 1.1, shadows: '#2a2438', highlights: '#fff4e0' },
    },
  },
  {
    keywords: ['glitch', 'static', 'distort'],
    pipeline: {
      filter: 'glitch-rgb',
      overlays: ['rgb-split', 'static-noise'],
      colorGrade: { temperature: 0, tint: 0, contrast: 1.35, saturation: 1.25, shadows: '#050505', highlights: '#ffffff' },
    },
  },
  {
    keywords: ['beach', 'tropical', 'summer'],
    pipeline: {
      filter: 'tropical-vivid',
      overlays: ['sun-flare'],
      colorGrade: { temperature: 15, tint: -8, contrast: 1.1, saturation: 1.3, shadows: '#0a2a30', highlights: '#fff8e0' },
    },
  },
  {
    keywords: ['winter', 'snow', 'cold'],
    pipeline: {
      filter: 'frost-blue',
      overlays: ['snowfall', 'frost-edge'],
      colorGrade: { temperature: -25, tint: 5, contrast: 1.05, saturation: 0.9, shadows: '#16283d', highlights: '#eef6ff' },
    },
  },
];

const DEFAULT_PIPELINE: EffectPipeline = {
  filter: 'natural',
  overlays: [],
  colorGrade: { temperature: 0, tint: 0, contrast: 1, saturation: 1, shadows: '#000000', highlights: '#ffffff' },
};

function mapPromptToPipeline(prompt: string): EffectPipeline {
  const lower = prompt.toLowerCase();
  const matched: EffectRule[] = EFFECT_RULES.filter((r) => r.keywords.some((k) => lower.includes(k)));
  if (matched.length === 0) return { ...DEFAULT_PIPELINE, params: { prompt } };
  if (matched.length === 1) return { ...matched[0].pipeline, params: { prompt, matched: matched[0].keywords.filter((k) => lower.includes(k)) } };
  // merge: first rule's filter, union overlays, average-ish colorGrade (first wins)
  const overlays = [...new Set(matched.flatMap((m) => m.pipeline.overlays))];
  return {
    filter: matched[0].pipeline.filter,
    overlays,
    colorGrade: matched[0].pipeline.colorGrade,
    params: { prompt, merged: matched.map((m) => m.pipeline.filter) },
  };
}

// ─── tiny translation dictionaries (common caption words) ──────────────────

const DICT: Record<string, Partial<Record<AiLanguage, string>>> = {
  hello: { ur: 'ہیلو', 'roman-ur': 'hello', ar: 'مرحبًا', hi: 'नमस्ते', en: 'hello' },
  love: { ur: 'محبت', 'roman-ur': 'mohabbat', ar: 'حب', hi: 'प्यार', en: 'love' },
  day: { ur: 'دن', 'roman-ur': 'din', ar: 'يوم', hi: 'दिन', en: 'day' },
  night: { ur: 'رات', 'roman-ur': 'raat', ar: 'ليل', hi: 'रात', en: 'night' },
  friend: { ur: 'دوست', 'roman-ur': 'dost', ar: 'صديق', hi: 'दोस्त', en: 'friend' },
  beautiful: { ur: 'خوبصورت', 'roman-ur': 'khoobsurat', ar: 'جميل', hi: 'सुंदर', en: 'beautiful' },
  happy: { ur: 'خوش', 'roman-ur': 'khush', ar: 'سعيد', hi: 'खुश', en: 'happy' },
  life: { ur: 'زندگی', 'roman-ur': 'zindagi', ar: 'حياة', hi: 'ज़िंदगी', en: 'life' },
  light: { ur: 'روشنی', 'roman-ur': 'roshni', ar: 'ضوء', hi: 'रोशनी', en: 'light' },
  memory: { ur: 'یاد', 'roman-ur': 'yaad', ar: 'ذكرى', hi: 'याद', en: 'memory' },
  sun: { ur: 'سورج', 'roman-ur': 'suraj', ar: 'شمس', hi: 'सूरज', en: 'sun' },
  water: { ur: 'پانی', 'roman-ur': 'paani', ar: 'ماء', hi: 'पानी', en: 'water' },
  good: { ur: 'اچھا', 'roman-ur': 'achha', ar: 'جيد', hi: 'अच्छा', en: 'good' },
  morning: { ur: 'صبح', 'roman-ur': 'subah', ar: 'صباح', hi: 'सुबह', en: 'morning' },
};

function translateLocal(text: string, target: AiLanguage): string {
  return text
    .split(/(\s+)/)
    .map((tok) => {
      const key = tok.toLowerCase().replace(/[^\p{L}]/gu, '');
      const entry = DICT[key];
      if (entry && entry[target]) {
        const m = tok.match(/^[^\p{L}]*/u)?.[0] ?? '';
        const trail = tok.match(/[^\p{L}]*$/u)?.[0] ?? '';
        return m + (entry[target] as string) + trail;
      }
      return tok;
    })
    .join('');
}

// ─── WebVTT placeholder (timing heuristic) ──────────────────────────────────

function buildVtt(durationSec: number, language: AiLanguage): string {
  const lines = [
    '[music]',
    'Welcome to this moment.',
    'Every frame tells a story.',
    'Thanks for watching.',
  ];
  const seg = durationSec / lines.length;
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec.padStart(6, '0')}`;
  };
  let vtt = 'WEBVTT\n';
  lines.forEach((l, i) => {
    vtt += `\n${fmt(i * seg)} --> ${fmt((i + 1) * seg)}\n${l}\n`;
  });
  return vtt + `\nNOTE language=${language} generator=local-ai placeholder=true\n`;
}

// ─── Local (fully offline) provider ─────────────────────────────────────────

export class LocalAiProvider implements AiProvider {
  name = 'local';

  async caption(input: { context?: string; language: AiLanguage }) {
    const seed = (input.context ?? '') + input.language;
    const [text] = pick(CAPTIONS[input.language], seed, 1);
    return { text: input.context ? `${text} — ${input.context}` : text };
  }

  async hashtags(input: { caption?: string; language: AiLanguage }) {
    const tags = pick(HASHTAG_BANK[input.language], input.caption ?? 'seed', 6);
    const fromCaption = (input.caption ?? '')
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 2)
      .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
    return { hashtags: [...new Set([...fromCaption, ...tags])].slice(0, 8) };
  }

  async title(input: { context?: string; language: AiLanguage }) {
    const [title] = pick(TITLES[input.language], (input.context ?? '') + input.language, 1);
    return { title };
  }

  async script(input: { topic: string; durationSec?: number; language: AiLanguage }) {
    const dur = input.durationSec ?? 60;
    const tpl = (arr: string[]) => pick(arr, input.topic + input.language, 1)[0].replaceAll('{topic}', input.topic);
    const opener = tpl(SCRIPT_OPENERS[input.language]);
    const middle = tpl(SCRIPT_MIDDLES[input.language]);
    const closer = tpl(SCRIPT_CLOSERS[input.language]);
    const beats = [
      { time: '0:00', line: opener },
      { time: `0:${String(Math.round(dur * 0.4)).padStart(2, '0')}`, line: middle },
      { time: `0:${String(Math.round(dur * 0.85)).padStart(2, '0')}`, line: closer },
    ];
    return { script: beats.map((b) => `[${b.time}] ${b.line}`).join('\n'), beats };
  }

  async ideas(input: { kind: 'story' | 'video'; niche?: string; language: AiLanguage }) {
    const seed = (input.niche ?? '') + input.kind + input.language;
    const ideas = pick(IDEA_BANK[input.language][input.kind], seed, 5);
    return {
      ideas: input.niche ? ideas.map((i) => `${i} (${input.niche})`) : ideas,
    };
  }

  async effect(input: { prompt: string; language?: AiLanguage }) {
    return { pipeline: mapPromptToPipeline(input.prompt) };
  }

  async subtitles(input: { assetId: string; durationSec?: number; language: AiLanguage }) {
    return { vtt: buildVtt(input.durationSec ?? 30, input.language) };
  }

  async translate(input: { text: string; targetLang: AiLanguage }) {
    return { text: translateLocal(input.text, input.targetLang) };
  }

  async background(input: { assetId: string; prompt: string }) {
    return {
      spec: {
        kind: 'background-replace',
        sourceAssetId: input.assetId,
        prompt: input.prompt,
        pipeline: mapPromptToPipeline(input.prompt),
        renderHint: 'client-side composite: segment subject, replace background per prompt',
      },
    };
  }

  async thumbnailSpec(input: { postId: string; caption?: string }) {
    const [title] = pick(TITLES.en, input.postId, 1);
    return {
      spec: {
        kind: 'canvas-composite',
        postId: input.postId,
        layers: [
          { type: 'frame', source: 'post', timeSec: 1.5 },
          { type: 'gradient', from: '#0B0B12', to: '#0B0B1200', direction: 'bottom' },
          { type: 'text', text: input.caption ?? title, position: 'bottom-left', fontSize: 48, color: '#ffffff' },
          { type: 'badge', text: 'SIGMA SNAP', position: 'top-right' },
        ],
        size: { width: 1280, height: 720 },
      },
    };
  }
}

// ─── HTTP stub provider (external model via API key) ────────────────────────

export class HttpAiProvider implements AiProvider {
  name = env.AI_PROVIDER;

  private ensureKey(): void {
    if (!env.AI_API_KEY) {
      throw providerNotConfigured(
        `AI provider "${env.AI_PROVIDER}" is not configured (AI_API_KEY missing). ` +
          'Set AI_PROVIDER=local for the offline provider.',
      );
    }
  }

  private stub(feature: string): never {
    this.ensureKey();
    throw providerNotConfigured(
      `AI provider "${env.AI_PROVIDER}" is selected but remote ${feature} is not implemented in this build. ` +
        'Use AI_PROVIDER=local for the offline provider.',
    );
  }

  async caption(input: { context?: string; language: AiLanguage }): Promise<{ text: string }> {
    this.stub('caption');
  }
  async hashtags(input: { caption?: string; language: AiLanguage }): Promise<{ hashtags: string[] }> {
    this.stub('hashtags');
  }
  async title(input: { context?: string; language: AiLanguage }): Promise<{ title: string }> {
    this.stub('title');
  }
  async script(input: {
    topic: string;
    durationSec?: number;
    language: AiLanguage;
  }): Promise<{ script: string; beats: { time: string; line: string }[] }> {
    this.stub('script');
  }
  async ideas(input: {
    kind: 'story' | 'video';
    niche?: string;
    language: AiLanguage;
  }): Promise<{ ideas: string[] }> {
    this.stub('ideas');
  }
  async effect(input: { prompt: string; language?: AiLanguage }): Promise<{ pipeline: EffectPipeline }> {
    this.stub('effect');
  }
  async subtitles(input: {
    assetId: string;
    durationSec?: number;
    language: AiLanguage;
  }): Promise<{ vtt: string }> {
    this.stub('subtitles');
  }
  async translate(input: { text: string; targetLang: AiLanguage }): Promise<{ text: string }> {
    this.stub('translate');
  }
  async background(input: { assetId: string; prompt: string }): Promise<{ spec: Record<string, unknown> }> {
    this.stub('background');
  }
  async thumbnailSpec(input: { postId: string; caption?: string }): Promise<{ spec: Record<string, unknown> }> {
    this.stub('thumbnail');
  }
}

let cached: AiProvider | null = null;

/** Resolve the AI provider from env. Defaults to the fully-offline local provider. */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  cached = env.AI_PROVIDER === 'local' ? new LocalAiProvider() : new HttpAiProvider();
  return cached;
}

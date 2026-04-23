// services/imageGenService.ts
// 图像生成服务 — 支持 Gemini (NanoBanana) 与 OpenAI Image (gpt-image-2) 两种协议

import type { ImageGenRequest, ImageGenResult, ImageModelConfig, OptimizeConfig } from '../types';
import { IMAGE_MODELS, IMAGE_OPTIMIZE_PRESETS, normalizeBaseUrl } from '../constants';

// ── 通用工具 ──────────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
  signal?: AbortSignal,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const res = await fetch(url, { ...init, signal });
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      lastError = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
    }
    if (attempt < maxRetries) {
      const delay = Math.min(2 ** attempt * 1000, 30000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError ?? new Error('Request failed after retries');
}

// ── 提示词优化（OpenAI 兼容格式） ─────────────────────────

export async function optimizePrompt(
  config: OptimizeConfig,
  rawPrompt: string,
  presetId: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('未配置提示词优化 API');
  }

  const preset = IMAGE_OPTIMIZE_PRESETS.find(p => p.id === presetId) ?? IMAGE_OPTIMIZE_PRESETS[0];

  // 规范化 baseUrl — 确保末尾无斜杠
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const body = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'user', content: `${preset.instruction}${rawPrompt}` },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });

  const res = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    },
    1,
    signal,
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`优化 API 错误 ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('提示词优化返回为空');
  return text;
}

// ── 通用常量 ──────────────────────────────────────────────

const GPT_QUALITY_MAP: Record<string, string> = { '1K': 'low', '2K': 'high', '4K': 'high' };

// ── gpt-image-2 辅助 ──────────────────────────────────────

export function mapToGptImage2Size(aspectRatio: string, sizeBucket?: string): string {
  if (!aspectRatio || aspectRatio === 'Auto') return 'auto';
  const m = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!m) return 'auto';
  const rw = parseInt(m[1], 10);
  const rh = parseInt(m[2], 10);
  if (!rw || !rh) return 'auto';

  const base = sizeBucket === '4K' ? 3840 : sizeBucket === '2K' ? 2048 : 1024;
  const align16 = (n: number) => Math.max(16, Math.round(n / 16) * 16);

  let w: number;
  let h: number;
  if (rw >= rh) {
    w = base;
    h = align16(base * rh / rw);
  } else {
    h = base;
    w = align16(base * rw / rh);
  }
  w = align16(w);

  const MAX_PX = 8_294_400;
  const MIN_PX = 655_360;
  const MAX_EDGE = 3840;

  let guard = 20;
  while ((w * h > MAX_PX || w > MAX_EDGE || h > MAX_EDGE) && guard-- > 0) {
    const scale = Math.min(MAX_EDGE / Math.max(w, h), Math.sqrt(MAX_PX / (w * h)));
    w = align16(w * scale);
    h = align16(h * scale);
  }
  guard = 20;
  while (w * h < MIN_PX && guard-- > 0) {
    w = align16(w * 1.1);
    h = align16(h * 1.1);
  }
  return `${w}x${h}`;
}

function stripDataUriPrefix(input: string): { mimeType: string; base64: string } {
  if (input.startsWith('data:')) {
    const [header, data] = input.split(',');
    const match = header.match(/data:(image\/[\w+.-]+);base64/);
    return { mimeType: match ? match[1] : 'image/png', base64: data };
  }
  return { mimeType: 'image/png', base64: input };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function mimeExt(mimeType: string): string {
  const t = mimeType.toLowerCase();
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('webp')) return 'webp';
  return 'png';
}

async function callGptImage2(
  apiKey: string,
  baseUrl: string,
  modelCfg: ImageModelConfig,
  req: ImageGenRequest,
  finalPrompt: string,
  signal: AbortSignal,
): Promise<{ mimeType: string; base64: string }> {
  const base = normalizeBaseUrl(baseUrl);
  const size = mapToGptImage2Size(req.aspectRatio, req.size);
  const quality = GPT_QUALITY_MAP[req.size || '2K'] || 'high';
  const apiModelId = modelCfg.apiModelId || 'gpt-image-2';

  const hasRefImages = req.mode === 'img2img' && (req.inputImages?.length ?? 0) > 0;

  // 多轮对话：取历史中最后一张生成图作为参考图走 edits
  const lastHistoryImage = req.history?.filter(h => h.imageData).at(-1)?.imageData;
  const shouldUseEdits = hasRefImages || (!hasRefImages && !!lastHistoryImage);

  let res: Response;
  if (shouldUseEdits) {
    const form = new FormData();
    form.append('model', apiModelId);
    form.append('prompt', finalPrompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('response_format', 'b64_json');
    form.append('n', '1');

    if (hasRefImages) {
      const imgs = (req.inputImages ?? []).slice(0, 16);
      imgs.forEach((img, idx) => {
        const { mimeType, base64 } = stripDataUriPrefix(img.data);
        const blob = base64ToBlob(base64, img.mimeType || mimeType);
        form.append('image', blob, `ref_${idx}.${mimeExt(img.mimeType || mimeType)}`);
      });
    } else if (lastHistoryImage) {
      const { mimeType, base64 } = stripDataUriPrefix(lastHistoryImage);
      const blob = base64ToBlob(base64, mimeType);
      form.append('image', blob, `prev_gen.${mimeExt(mimeType)}`);
    }
    res = await fetchWithRetry(
      `${base}${modelCfg.editsPath || '/v1/images/edits'}`,
      { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form },
      2,
      signal,
    );
  } else {
    const body: Record<string, unknown> = {
      model: apiModelId,
      prompt: finalPrompt,
      n: 1,
      response_format: 'b64_json',
      size,
      quality,
    };
    res = await fetchWithRetry(
      `${base}${modelCfg.modelPath}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      },
      2,
      signal,
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API 错误 ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const item = json?.data?.[0];
  const b64 = item?.b64_json as string | undefined;
  if (b64) return { mimeType: 'image/png', base64: b64 };

  // 兜底：部分中转返回 url
  const url = item?.url as string | undefined;
  if (url) {
    const imgRes = await fetch(url, { signal });
    if (!imgRes.ok) throw new Error(`下载生成图失败 ${imgRes.status}`);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    return { mimeType: imgRes.headers.get('content-type') || 'image/png', base64: btoa(binary) };
  }

  const snippet = JSON.stringify(json, null, 2).slice(0, 800);
  throw new Error(`GPT 响应结构异常，缺少 data[0].b64_json\n响应片段: ${snippet}`);
}

// ── 图片生成 ──────────────────────────────────────────────

export async function generateImage(
  apiKey: string,
  baseUrl: string,
  req: ImageGenRequest,
  optimizeConfig: OptimizeConfig | null,
  signal?: AbortSignal,
): Promise<ImageGenResult> {
  const start = Date.now();

  // 1. 查找模型配置
  const modelCfg = IMAGE_MODELS.find(m => m.id === req.model) ?? IMAGE_MODELS[0];

  // 2. 提示词优化（如果开启且有配置）
  let finalPrompt = req.prompt;
  let optimizedPrompt: string | undefined;

  if (req.optimizePrompt && req.optimizePresetId && optimizeConfig?.apiKey) {
    try {
      optimizedPrompt = await optimizePrompt(optimizeConfig, finalPrompt, req.optimizePresetId, signal);
      finalPrompt = optimizedPrompt;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      console.warn('[ImageGen] 提示词优化失败，使用原始提示词:', e);
    }
  }

  // 2.5 按 provider 分流
  const timeoutMs = req.size === '4K' ? 1200000 : req.size === '1K' ? 360000 : 600000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const combinedSignal = signal
    ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, controller.signal]) ?? controller.signal
    : controller.signal;

  if (modelCfg.provider === 'openai-image') {
    try {
      const { mimeType, base64 } = await callGptImage2(apiKey, baseUrl, modelCfg, req, finalPrompt, combinedSignal);
      clearTimeout(timeout);
      return {
        success: true,
        imageData: `data:${mimeType};base64,${base64}`,
        elapsed: Date.now() - start,
        optimizedPrompt,
      };
    } catch (e: unknown) {
      clearTimeout(timeout);
      if (e instanceof DOMException && e.name === 'AbortError' && signal?.aborted) throw e;
      return {
        success: false,
        elapsed: Date.now() - start,
        error: `生成失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // 3. 构建请求体 — 多轮对话 contents
  const contents: Array<Record<string, unknown>> = [];

  // 历史消息
  if (req.history?.length) {
    for (const h of req.history) {
      // user turn
      contents.push({ role: 'user', parts: [{ text: h.prompt }] });
      // model turn (with image if available)
      if (h.imageData) {
        let base64 = h.imageData;
        let mimeType = 'image/png';
        if (base64.startsWith('data:')) {
          const [header, data] = base64.split(',');
          const match = header.match(/data:(image\/\w+);base64/);
          if (match) mimeType = match[1];
          base64 = data;
        }
        contents.push({
          role: 'model',
          parts: [{ inline_data: { mime_type: mimeType, data: base64 } }],
        });
      }
    }
  }

  // 当前用户消息
  const currentParts: Array<Record<string, unknown>> = [{ text: finalPrompt }];

  if (req.mode === 'img2img' && req.inputImages?.length) {
    for (const img of req.inputImages) {
      let base64 = img.data;
      let mimeType = img.mimeType || 'image/jpeg';
      if (base64.startsWith('data:')) {
        const [header, data] = base64.split(',');
        const match = header.match(/data:(image\/\w+);base64/);
        if (match) mimeType = match[1];
        base64 = data;
      }
      currentParts.push({
        inline_data: { mime_type: mimeType, data: base64 },
      });
    }
  }

  contents.push({ role: 'user', parts: currentParts });

  const imageConfig: Record<string, string> = {};
  if (req.aspectRatio && req.aspectRatio !== 'Auto') {
    imageConfig.aspectRatio = req.aspectRatio;
  }
  if (req.size) {
    imageConfig.imageSize = req.size;
  }

  const body = JSON.stringify({
    contents,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig,
    },
  });

  // 4. 调用 API（gemini 分支沿用前面已创建的 controller/timeout/combinedSignal）
  const url = `${normalizeBaseUrl(baseUrl)}${modelCfg.modelPath}`;

  try {
    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      },
      2,
      combinedSignal,
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        elapsed: Date.now() - start,
        error: `API 错误 ${res.status}: ${errText}`,
      };
    }

    const json = await res.json();
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const inlineData = parts.find((p: Record<string, unknown>) => p.inlineData)?.inlineData as { data?: string; mimeType?: string } | undefined;
    if (!inlineData?.data) {
      return {
        success: false,
        elapsed: Date.now() - start,
        error: '响应中无图片数据',
      };
    }

    const mimeType = inlineData.mimeType || 'image/png';
    const dataUri = `data:${mimeType};base64,${inlineData.data}`;

    return {
      success: true,
      imageData: dataUri,
      elapsed: Date.now() - start,
      optimizedPrompt,
    };
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof DOMException && e.name === 'AbortError' && signal?.aborted) throw e;
    return {
      success: false,
      elapsed: Date.now() - start,
      error: `生成失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// services/imageGenService.ts
// NanoBanana 图像生成服务 — 双模型，提示词优化走 OpenAI 兼容格式

import type { ImageGenRequest, ImageGenResult, OptimizeConfig } from '../types';
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
      console.warn('[NanoBanana] 提示词优化失败，使用原始提示词:', e);
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

  if (req.mode === 'img2img' && req.inputImage) {
    let base64 = req.inputImage;
    let mimeType = req.inputImageMimeType ?? 'image/jpeg';
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

  contents.push({ role: 'user', parts: currentParts });

  const imageConfig: Record<string, string> = {
    aspectRatio: req.aspectRatio || '1:1',
  };
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

  // 4. 调用 API
  const url = `${normalizeBaseUrl(baseUrl)}${modelCfg.modelPath}`;
  const timeoutMs = req.size === '4K' ? 1200000 : req.size === '1K' ? 360000 : 600000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = signal
    ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, controller.signal]) ?? controller.signal
    : controller.signal;

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
    const inlineData = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
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

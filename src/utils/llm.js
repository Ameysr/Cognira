/**
 * llm.js - Unified LLM Provider Abstraction
 *
 * Supports both Google Gemini and DeepSeek as interchangeable backends.
 * All agents call `callLLM()` — the provider is determined by the
 * LLM_PROVIDER env var ("gemini" or "deepseek").
 *
 * Design: provider-specific logic is encapsulated in adapter functions.
 * Adding a new provider (e.g. OpenAI, Claude) only requires writing
 * one new adapter — zero changes to agents.
 */

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

let geminiClient = null;
let deepseekClient = null;
let activeProvider = null;

// ---- Initialization --------------------------------------------------------

export function initLLM({ provider, geminiApiKey, deepseekApiKey }) {
  provider = provider || process.env.LLM_PROVIDER || "gemini";

  if (provider === "gemini") {
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is required. Get one from https://aistudio.google.com/apikey");
    }
    geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  } else if (provider === "deepseek") {
    if (!deepseekApiKey) {
      throw new Error("DEEPSEEK_API_KEY is required. Get one from https://platform.deepseek.com/api_keys");
    }
    deepseekClient = new OpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: deepseekApiKey,
    });
  } else {
    throw new Error(`Unknown LLM_PROVIDER: "${provider}". Use "gemini" or "deepseek".`);
  }

  activeProvider = provider;
  return activeProvider;
}

export function getActiveProvider() {
  return activeProvider;
}

// ---- Core LLM Call ---------------------------------------------------------

/**
 * Unified LLM call. Returns { parsed, raw, tokens }.
 * Delegates to the configured provider adapter.
 */
export async function callLLM({
  systemPrompt,
  userPrompt,
  agentName = "unknown",
  currentCost = 0,
  tokenBudget = 2.0,
  model = null,
}) {
  if (!activeProvider) {
    throw new Error("LLM not initialized. Call initLLM() first.");
  }

  if (currentCost >= tokenBudget) {
    throw new Error(
      `TOKEN_BUDGET_EXCEEDED: $${currentCost.toFixed(4)} >= budget $${tokenBudget}`
    );
  }

  const adapter = activeProvider === "gemini" ? callGeminiAdapter : callDeepSeekAdapter;

  let lastError = null;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await adapter({ systemPrompt, userPrompt, agentName, model });
      return result;
    } catch (error) {
      lastError = error;
      if (error.message?.includes("TOKEN_BUDGET_EXCEEDED")) throw error;
      if (error.message?.includes("JSON_PARSE_FAILED") && attempt === MAX_RETRIES) throw error;
      if (attempt === MAX_RETRIES) throw error;

      const waitMs = Math.pow(2, attempt) * 1000;
      console.warn(`[${agentName}] Attempt ${attempt} failed: ${error.message}. Retrying in ${waitMs}ms...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

// ---- Gemini Adapter --------------------------------------------------------

async function callGeminiAdapter({ systemPrompt, userPrompt, agentName, model }) {
  const modelName = model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const fullPrompt = `${systemPrompt}\n\n---\n\nINPUT:\n${userPrompt}\n\n---\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside JSON.`;

  const response = await geminiClient.models.generateContent({
    model: modelName,
    contents: fullPrompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text || "";

  const usageMetadata = response.usageMetadata;
  const inputTokens = usageMetadata?.promptTokenCount || Math.ceil(fullPrompt.length / 4);
  const outputTokens = usageMetadata?.candidatesTokenCount || Math.ceil(rawText.length / 4);

  // Gemini 2.5 Flash pricing: $0.15/1M input, $0.60/1M output
  const cost = (inputTokens / 1_000_000) * 0.15 + (outputTokens / 1_000_000) * 0.60;

  const parsed = parseJSON(rawText, agentName);

  return {
    parsed,
    raw: rawText,
    tokens: { input: inputTokens, output: outputTokens, cost },
  };
}

// ---- DeepSeek Adapter ------------------------------------------------------

async function callDeepSeekAdapter({ systemPrompt, userPrompt, agentName, model }) {
  const modelName = model || process.env.DEEPSEEK_MODEL || "deepseek-chat";

  const combinedUserPrompt = `${userPrompt}\n\n---\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no backticks, no explanation outside JSON.`;

  const response = await deepseekClient.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: combinedUserPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const rawText = response.choices?.[0]?.message?.content || "";

  const inputTokens = response.usage?.prompt_tokens || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
  const outputTokens = response.usage?.completion_tokens || Math.ceil(rawText.length / 4);

  // DeepSeek pricing: $0.14/1M input, $0.28/1M output (cache miss)
  const cost = (inputTokens / 1_000_000) * 0.14 + (outputTokens / 1_000_000) * 0.28;

  const parsed = parseJSON(rawText, agentName);

  return {
    parsed,
    raw: rawText,
    tokens: { input: inputTokens, output: outputTokens, cost },
  };
}

// ---- Helpers ---------------------------------------------------------------

function parseJSON(rawText, agentName) {
  let cleanText = rawText.trim();
  if (cleanText.startsWith("```")) {
    cleanText = cleanText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    return JSON.parse(cleanText);
  } catch (parseError) {
    console.error(`[${agentName}] JSON parse failed:`, cleanText.slice(0, 200));
    throw new Error(`JSON_PARSE_FAILED: ${parseError.message}`);
  }
}

/**
 * Build a tokenUsage delta from a single callLLM result.
 * Agents return this delta to the state reducer — the reducer accumulates it.
 */
export function makeTokenDelta(agentName, tokens) {
  return {
    newCalls: [{
      agent: agentName,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      timestamp: Date.now(),
    }],
    addedInput: tokens.input,
    addedOutput: tokens.output,
    addedCost: tokens.cost,
  };
}

/** Empty token delta -- for when LLM call fails */
export function emptyTokenDelta(agentName) {
  return makeTokenDelta(agentName, { input: 0, output: 0, cost: 0 });
}

/**
 * Safe wrapper around callLLM -- NEVER throws (except TOKEN_BUDGET_EXCEEDED).
 * Returns { ok: true, parsed, raw, tokens } on success
 * Returns { ok: false, error, tokens } on failure
 *
 * Use this in every agent to prevent graph crashes.
 */
export async function safeCallLLM(options) {
  try {
    const result = await callLLM(options);
    return { ok: true, ...result };
  } catch (error) {
    if (error.message?.includes("TOKEN_BUDGET_EXCEEDED")) throw error;

    console.error(`[${options.agentName}] LLM call failed: ${error.message}`);
    return {
      ok: false,
      error: error.message,
      parsed: null,
      raw: "",
      tokens: { input: 0, output: 0, cost: 0 },
    };
  }
}

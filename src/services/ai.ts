/**
 * AI client abstraction.
 *
 * Rationale:
 * - The original prototype called Gemini directly from the browser with an API key.
 *   That's not safe for production.
 * - This module defines a tiny "client" contract so apps can inject their own backend proxy.
 */

export type AiClient = (prompt: string, systemInstruction?: string) => Promise<string>;

/** No-op default; callers can inject a real implementation via <visual-block-data ai-client="..."> */
export const noopAiClient: AiClient = async () => {
  return 'AI client not configured.';
};

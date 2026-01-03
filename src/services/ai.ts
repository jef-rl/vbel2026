/**
 * AI client abstraction.
 *
 * Rationale:
 * - The original prototype called Gemini directly from the browser with an API key.
 *   That's not safe for production.
 * - This module defines a tiny "client" contract so apps can inject their own backend proxy.
 */

export type AiClient = (prompt: string, systemInstruction?: string) => Promise<any>; // Return any to allow for full response

/**
 * A no-op AI client that returns a placeholder message. This is the default
 * client. Callers can inject a real implementation via the `ai-client`
 * property on the `<visual-block-data>` element.
 */
export const noopAiClient: AiClient = async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { text: 'AI client not configured. Did you forget to inject a real client?' };
};

/**
 * An AI client that calls a backend proxy to access an AI model.
 * This is the recommended approach for production.
 */
export const liveAiClient: AiClient = async (prompt, systemInstruction) => {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, systemInstruction }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('AI API error:', error);
    return { error: `AI API error: ${response.status} ${response.statusText}` };
  }

  try {
    return await response.json();
  } catch (e) {
    console.error('Error parsing AI API response:', e);
    return { error: 'Error parsing AI API response.' };
  }
};

/**
 * Creates an AI client that calls the Google AI (Gemini) API directly.
 *
 * NOTE: This is suitable for demos and testing but is NOT recommended for
 * production, as it exposes the API key in the browser.
 *
 * @param apiKey The Google AI API key.
 * @returns An AiClient function.
 */
export function createGeminiClient(apiKey: string): AiClient {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  return async (prompt: string, systemInstruction?: string) => {
    const fullPrompt = systemInstruction ? `${systemInstruction}\n\n---\n\n${prompt}` : prompt;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Gemini API error:', result);
        return { error: result.error?.message ?? 'Unknown error', fullResponse: result };
      }
      
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error('Invalid response from Gemini API:', result);
        return { error: 'Invalid response from Gemini API.', fullResponse: result };
      }
      return { text, fullResponse: result };
    } catch (e: any) {
      console.error('Error calling Gemini API:', e);
      return { error: `Error calling Gemini API: ${e.message}` };
    }
  };
}

/**
 * Creates a detailed system prompt explaining the JSON data structure for the AI.
 * @param data The block data object.
 * @returns A string to be used as a system instruction.
 */
export function createSystemPrompt(data: any): string {
  const layout = data?.layout_lg || {};
  const columns = layout.columns || 36;
  const positionExample = layout.positions?.[0] 
    ? JSON.stringify(layout.positions[0], null, 2) 
    : '{\n  "_positionID": "example_pos",\n  "_contentID": "example_content",\n  "x": 0,\n  "y": 0,\n  "w": 12,\n  "h": 4,\n  "z": 1\n}';
  const contentExample = layout.positions?.[0]?._contentID && data[layout.positions[0]._contentID]
    ? JSON.stringify(data[layout.positions[0]._contentID], null, 2)
    : '{\n  "_contentID": "example_content",\n  "type": "image",\n  "src": "...", \n  "styler": { "backgroundColor": "#F0F0F0" }\n}';


  return `You are an expert visual web designer and layout artist. You will be provided with a JSON object that describes a visual layout on a 2D grid.

First, here is how to understand the JSON data structure:

1.  **The Grid System**: The canvas is a grid with ${columns} columns. All coordinates and dimensions (x, y, w, h) are in grid units. The top-left corner is (0, 0).
2.  **Layout Data**: The core layout information is in the \`layout_lg.positions\` array. Each object in this array represents a single visual block on the canvas.
3.  **Block Properties**: Each block in the \`positions\` array is structured like this:
    \`\`\`json
    ${positionExample}
    \`\`\`
    *   \`x\`, \`y\`, \`w\`, \`h\`: The geometry of the block on the grid.
    *   \`z\`: The stacking order (z-index). Higher numbers are in front.
    *   \`_contentID\`: A reference ID that links this position to its content data.
4.  **Content Data**: The root of the JSON object contains keys that match the \`_contentID\`. These objects hold the actual content (like text or image URLs) and styling. Here's an example:
    \`\`\`json
    ${contentExample}
    \`\`\`
    * The \`styler\` property within a content object contains CSS-like style rules for that specific block. There can also be global styler objects (e.g., \`container.styler\`) that apply styles to the whole layout.

Your primary focus should be to visualize the arrangement, styles, and content, and then describe what you see in a way that a non-technical stakeholder will understand. Your goal is to help them identify the layout's purpose as quickly as possible. For example, you might describe a layout as "a classic hero banner with a main image and a call-to-action button" or "a three-column product feature grid".`;
}

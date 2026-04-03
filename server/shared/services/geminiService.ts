import { GoogleGenAI } from "@google/genai";
import type { UIElement } from '../contracts/index.ts';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.warn("API_KEY not found in environment.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const suggestSelector = async (htmlSnippet: string): Promise<Partial<UIElement>> => {
    const ai = getAiClient();
    if (!ai) return { selectorType: 'CSS', value: '' };

    const prompt = `
      Analyze this HTML snippet and suggest the best robust Playwright selector.
      Prioritize getByRole, getByTestId, then unique CSS/Text.
      
      HTML:
      ${htmlSnippet}
      
      Output JSON with keys: "selectorType" (one of: CSS, XPath, getByRole, getByText, getByTestId, getByLabel, getByPlaceholder), "value", "name" (suggested element name).
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      let text = response.text || '{}';
      text = text.replace(/^```json\n/, '').replace(/\n```$/, '').trim();
      return JSON.parse(text);
    } catch (e) {
      console.error(e);
      return { selectorType: 'CSS', value: '' };
    }
}

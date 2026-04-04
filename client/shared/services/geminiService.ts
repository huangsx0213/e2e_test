import { Project, TestStep, UIElement } from '@/shared/types';

export const generateStepsFromDescription = async (
  description: string,
  project: Project
): Promise<TestStep[]> => {
  try {
    const response = await fetch('/api/ai/generate-steps', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description, project }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("AI Generation Failed:", error);
    return [];
  }
};

export const suggestSelector = async (htmlSnippet: string): Promise<Partial<UIElement>> => {
  try {
    const response = await fetch('/api/ai/suggest-selector', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ htmlSnippet }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("AI Suggestion Failed:", error);
    return { selectorType: 'CSS', value: '' };
  }
};

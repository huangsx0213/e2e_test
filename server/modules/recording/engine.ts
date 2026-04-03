import { chromium, Browser, Page } from 'playwright';
import { suggestSelector } from '../../shared/services/geminiService.ts';

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

export async function startRecording(targetUrl: string, projectId: string, onElementRecorded: (element: any) => void) {
  if (activeBrowser) {
    await stopRecording();
  }

  activeBrowser = await chromium.launch({ headless: false });
  const context = await activeBrowser.newContext();
  activePage = await context.newPage();

  // Expose function to be called from the browser
  await activePage.exposeFunction('onElementClicked', async (htmlContext: string, pageUrl: string) => {
    try {
      console.log('Element clicked, analyzing with AI...');
      const suggestion = await suggestSelector(htmlContext);
      
      const newElement = {
        id: `el-${Date.now()}`,
        name: suggestion.name || 'RecordedElement',
        selectorType: suggestion.selectorType || 'CSS',
        value: suggestion.value,
        description: 'Recorded via Smart Inspector',
        originalHtml: htmlContext,
        pageUrl: pageUrl,
      };

      onElementRecorded(newElement);
    } catch (error) {
      console.error('Error analyzing element:', error);
    }
  });

  // Inject the Smart Inspector script
  await activePage.addInitScript(() => {
    document.addEventListener('mouseover', (e) => {
      const target = e.target as HTMLElement;
      if (target) {
        target.style.outline = '2px solid #3b82f6';
        target.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        target.style.cursor = 'crosshair';
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target as HTMLElement;
      if (target) {
        target.style.outline = '';
        target.style.backgroundColor = '';
        target.style.cursor = '';
      }
    });

    document.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const target = e.target as HTMLElement;
      if (target) {
        // Remove highlight before capturing HTML
        target.style.outline = '';
        target.style.backgroundColor = '';
        target.style.cursor = '';
        
        const htmlContext = target.outerHTML;
        const pageUrl = window.location.href;
        
        // Call the exposed Node.js function
        (window as any).onElementClicked(htmlContext, pageUrl);
        
        // Re-apply highlight
        target.style.outline = '2px solid #10b981'; // Green for success
        target.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        setTimeout(() => {
          target.style.outline = '';
          target.style.backgroundColor = '';
        }, 1000);
      }
    }, { capture: true });
  });

  await activePage.goto(targetUrl);
}

export async function stopRecording() {
  if (activeBrowser) {
    await activeBrowser.close();
    activeBrowser = null;
    activePage = null;
  }
}

export type RecorderMode = 'ui' | 'api' | 'element' | 'all';

export type LocatorRef =
  | { kind: 'getByRole'; role: string; name?: string; exact?: boolean }
  | { kind: 'getByLabel'; text: string; exact?: boolean }
  | { kind: 'getByPlaceholder'; text: string; exact?: boolean }
  | { kind: 'getByText'; text: string; exact?: boolean }
  | { kind: 'getByAltText'; text: string; exact?: boolean }
  | { kind: 'getByTitle'; text: string; exact?: boolean }
  | { kind: 'getByTestId'; text: string }
  | { kind: 'official'; selector: string }
  | { kind: 'css'; selector: string };

export type RawRecorderEvent =
  | {
      type: 'navigate';
      url: string;
      action: 'PAGE_LOAD' | 'NAVIGATE';
      previousUrl?: string | null;
      timestamp: number;
    }
  | {
      type: 'ui';
      action: 'CLICK' | 'DOUBLE_CLICK' | 'RIGHT_CLICK' | 'TYPE' | 'PRESS_KEY' | 'CHECK' | 'UNCHECK' | 'SELECT_OPTION' | 'ATTACH_FILE' | 'HOVER' | 'DRAG_AND_DROP';
      locator: LocatorRef;
      value?: string;
      secondaryLocator?: LocatorRef;
      pageUrl: string;
      timestamp: number;
      metadata?: Record<string, unknown>;
    }
  | {
      type: 'element';
      locator: LocatorRef;
      pageUrl: string;
      timestamp: number;
      metadata?: Record<string, unknown>;
    };

export type RecorderStepPayload = {
  action: string;
  locator: LocatorRef;
  locatorCandidates: LocatorRef[];
  secondaryLocator?: LocatorRef;
  value?: string;
  pageUrl: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type RecorderState = {
  isPaused: boolean;
  started: boolean;
  mode: RecorderMode;
  action?: 'START' | 'STOP' | 'PAUSE';
};

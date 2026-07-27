import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { ACList } from "../ACList";
import type { Requirement } from "../../../../shared/contracts/index";

// Mock the mutations hook to avoid real network calls
vi.mock("../../../shared/hooks/useQueryHooks", () => ({
  useRequirementMutations: () => ({
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeAC(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    projectId: "p1",
    parentId: "story-1",
    title: "AC",
    description: "Given x\nWhen y\nThen z",
    level: "ac",
    flowType: "atomic",
    priority: "MEDIUM",
    status: "DRAFT",
    tags: [],
    position: 0,
    metadata: {},
    ...overrides,
  } as Requirement;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("ACList", () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    onSaved.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders AC count in header", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACList, {
          acs: [makeAC({ id: "1" }), makeAC({ id: "2" })],
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
        })
      )
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders empty state when no ACs", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACList, {
          acs: [],
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
        })
      )
    );
    expect(screen.getByText(/No ACs yet/i)).toBeInTheDocument();
  });

  it("renders New AC button", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACList, {
          acs: [],
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
        })
      )
    );
    expect(screen.getByText(/New AC/i)).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { EpicDetailView } from "../EpicDetailView";
import type { Requirement } from "../../../../shared/contracts/index";

vi.mock("../../../shared/hooks/useQueryHooks", () => ({
  useRequirementMutations: () => ({
    update: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  }),
  useRequirements: () => ({ data: [] }),
}));

function makeEpic(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    projectId: "p1",
    parentId: null,
    title: "Epic Title",
    description: "Some epic description",
    level: "epic",
    priority: "HIGH",
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

describe("EpicDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders EPIC chip and title", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(EpicDetailView, {
          epic: makeEpic({ id: "epic-1", title: "Account Security" }),
          projectId: "p1",
          onSaved: vi.fn(),
        })
      )
    );
    // EPIC chip should be visible somewhere
    expect(screen.getByText(/^Epic$/)).toBeInTheDocument();
    // Title should be visible as input value
    expect(screen.getByDisplayValue("Account Security")).toBeInTheDocument();
  });

  it("does not render AC list section", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(EpicDetailView, {
          epic: makeEpic({ id: "epic-1" }),
          projectId: "p1",
          onSaved: vi.fn(),
        })
      )
    );
    expect(screen.queryByText(/Acceptance Criteria/i)).not.toBeInTheDocument();
  });

  it("does not render dependency editor", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(EpicDetailView, {
          epic: makeEpic({ id: "epic-1" }),
          projectId: "p1",
          onSaved: vi.fn(),
        })
      )
    );
    expect(screen.queryByText(/^Dependencies$/i)).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { ACCard } from "../ACCard";
import type { Requirement } from "../../../../shared/contracts/index";

// Mock the mutations hook to avoid real network calls
vi.mock("../../../shared/hooks/useQueryHooks", () => ({
  useRequirementMutations: () => ({
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeAC(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    projectId: "p1",
    parentId: "story-1",
    title: "AC Title",
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

describe("ACCard", () => {
  const onSaved = vi.fn();
  const onMoveUp = vi.fn();
  const onMoveDown = vi.fn();

  beforeEach(() => {
    onSaved.mockReset();
    onMoveUp.mockReset();
    onMoveDown.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders AC title and human_id", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", humanId: "AUTH-007-001", title: "First AC" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    expect(screen.getByText("AUTH-007-001")).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("shows soft warning when description is non-matching markdown", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", description: "Just free-form text without structure" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    expect(screen.getByText(/Format warning/i)).toBeInTheDocument();
  });

  it("does not show soft warning when Given/When/Then detected", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", description: "Given x\nWhen y\nThen z" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    expect(screen.queryByText(/Format warning/i)).not.toBeInTheDocument();
  });

  it("does not show warning when description is empty", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", description: "" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    expect(screen.queryByText(/Format warning/i)).not.toBeInTheDocument();
  });

  it("toggles between atomic and flow", async () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", flowType: "atomic" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    const toggle = screen.getByRole("button", { name: /toggle flow type/i });
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ flowType: "flow" }));
    });
  });

  it("renders empty placeholder when description is empty", () => {
    render(
      React.createElement(Wrapper, null,
        React.createElement(ACCard, {
          ac: makeAC({ id: "ac-1", description: "", status: "DRAFT" }),
          index: 1,
          parentStoryId: "story-1",
          projectId: "p1",
          onSaved,
          onMoveUp,
          onMoveDown,
        })
      )
    );
    expect(screen.getByText(/Empty — awaiting content/i)).toBeInTheDocument();
  });
});

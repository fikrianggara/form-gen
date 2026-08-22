// @vitest-environment jsdom
/**
 * TKT-052: component test for the UsersPanel Activate action (mirrors the
 * TKT-044 pattern — jsdom + Testing Library, runs in the normal vitest gate).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const updateUserAction = vi.fn().mockResolvedValue({});

vi.mock("@/lib/actions/dashboard", () => ({
  createUserAction: vi.fn().mockResolvedValue({}),
  updateUserAction: (...args: unknown[]) => updateUserAction(...args),
  resetPasswordAction: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/components/toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { UsersPanel, type UserRow } from "@/components/admin/UsersPanel";

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "u1",
    email: "pending@example.com",
    name: "Pending Person",
    role: "OPERATOR",
    isActive: false,
    createdAt: "2026-08-22T10:00:00.000Z",
    ...overrides,
  };
}

const pending = makeUser();
const active = makeUser({ id: "u2", email: "active@example.com", name: "Active Person", isActive: true });

beforeEach(() => {
  updateUserAction.mockClear();
});

// RTL auto-cleanup needs globals; with vitest globals:false, clean explicitly
// so renders don't accumulate across tests in this file.
afterEach(cleanup);

describe("UsersPanel — activation UX (TKT-052)", () => {
  it("shows an inactive badge for a pending registration", () => {
    render(<UsersPanel users={[pending, active]} />);
    const pendingRow = screen.getByText("Pending Person").closest("tr")!;
    const activeRow = screen.getByText("Active Person").closest("tr")!;
    expect(within(pendingRow).getByText("inactive")).toBeInTheDocument();
    expect(within(activeRow).getByText("active")).toBeInTheDocument();
  });

  it("offers a labeled Activate action for an inactive user and calls setUserActive(id, true)", async () => {
    const user = userEvent.setup();
    render(<UsersPanel users={[pending]} />);

    await user.click(screen.getByRole("button", { name: `Actions for ${pending.name}` }));
    const menuItem = screen.getByRole("button", { name: /activate/i });
    expect(menuItem).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^disable$/i })).not.toBeInTheDocument();

    // The menu item opens an inline confirm; the confirm button performs the action.
    await user.click(menuItem);
    expect(screen.getByText(/activate pending person/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^activate$/i }));

    expect(updateUserAction).toHaveBeenCalledWith({ id: pending.id, isActive: true });
  });

  it("still offers Disable for an active user (no regression)", async () => {
    const user = userEvent.setup();
    render(<UsersPanel users={[active]} />);

    await user.click(screen.getByRole("button", { name: `Actions for ${active.name}` }));
    expect(screen.getByRole("button", { name: /^disable$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument();
  });

  it("filters the table to inactive users", async () => {
    const user = userEvent.setup();
    render(<UsersPanel users={[pending, active]} />);

    await user.click(screen.getByRole("button", { name: /inactive/i }));
    expect(screen.getByText("Pending Person")).toBeInTheDocument();
    expect(screen.queryByText("Active Person")).not.toBeInTheDocument();
  });
});

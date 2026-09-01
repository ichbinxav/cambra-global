// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog.jsx";

afterEach(() => cleanup());

describe("Dialog", () => {
  it("unmounts immediately on close without an exit animation pointer lock", async () => {
    const content = (open) => React.createElement(
      Dialog,
      { open },
      React.createElement(
        DialogContent,
        null,
        React.createElement(DialogTitle, null, "Budget control"),
      ),
    );

    const { rerender } = render(content(true));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).not.toContain("data-[state=closed]");

    rerender(content(false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});

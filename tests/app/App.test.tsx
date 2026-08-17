import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("App", () => {
  it("renders_the_game_shell_when_the_app_loads", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Hex Tower 1" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Hex Tower 1 board/i)).toBeInTheDocument();
    expect(screen.queryByText(/Connecting account|Sign in to keep records/i)).not.toBeInTheDocument();
  });
});

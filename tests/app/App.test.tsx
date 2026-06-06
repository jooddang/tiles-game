import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/app/App";

describe("App", () => {
  it("renders_the_game_shell_when_the_app_loads", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Hex Tower" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Hex Tower board/i)).toBeInTheDocument();
  });
});

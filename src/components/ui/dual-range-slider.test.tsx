import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DualRangeSlider } from "./dual-range-slider";

describe("DualRangeSlider", () => {
  it("renders without crashing", () => {
    act(() => {
      render(<DualRangeSlider />);
    });
  });

  it("displays labels in the top position by default", () => {
    act(() => {
      render(
        <DualRangeSlider
          min={0}
          max={100}
          value={[10, 90]}
          label={(value) => `\$${value}`}
        />,
      );
    });
    const firstLabel = screen.getByText("$10");
    expect(firstLabel).toHaveClass("-top-7");
  });

  it("displays labels in the bottom position when specified", () => {
    act(() => {
      render(
        <DualRangeSlider
          min={0}
          max={100}
          value={[10, 90]}
          label={(value) => `\$${value}`}
          labelPosition="bottom"
        />,
      );
    });
    const firstLabel = screen.getByText("$10");
    expect(firstLabel).toHaveClass("top-4");
  });

  it("correctly reflects initial values", () => {
    act(() => {
      render(<DualRangeSlider min={0} max={100} value={[25, 75]} />);
    });
    const thumbs = screen.getAllByRole("slider");
    expect(thumbs[0]).toHaveAttribute("aria-valuenow", "25");
    expect(thumbs[1]).toHaveAttribute("aria-valuenow", "75");
  });
});

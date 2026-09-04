import React from "react";
import { render } from "@testing-library/react";
import { ImageConverter } from "./image-converter";

describe("ImageConverter", () => {
  it("renders without crashing", () => {
    render(<ImageConverter />);
  });
});

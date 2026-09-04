import { fireEvent, render, screen } from "@testing-library/react";
import CaseConverter from "./case-converter";

// Mock gtag
jest.mock("@/lib/gtag", () => ({
  event: jest.fn(),
}));

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

describe("CaseConverter", () => {
  it("renders correctly", () => {
    render(<CaseConverter ssr={true} />);
    expect(screen.getByText("Case Converter")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Type or paste your text here..."),
    ).toBeInTheDocument();
  });

  it("transforms text to uppercase", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.click(screen.getByText("UPPERCASE"));
    expect(textarea).toHaveValue("HELLO");
  });

  it("transforms text to lowercase", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "HELLO" } });
    fireEvent.click(screen.getByText("lowercase"));
    expect(textarea).toHaveValue("hello");
  });

  it("transforms text to Title Case", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.click(screen.getByText("Title Case"));
    expect(textarea).toHaveValue("Hello World");
  });

  it("transforms text to camelCase", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.click(screen.getByText("camelCase"));
    expect(textarea).toHaveValue("helloWorld");
  });

  it("transforms text to snake_case", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.click(screen.getByText("snake_case"));
    expect(textarea).toHaveValue("hello_world");
  });

  it("transforms text to kebab-case", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello world" } });
    fireEvent.click(screen.getByText("kebab-case"));
    expect(textarea).toHaveValue("hello-world");
  });

  it("clears text", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello" } });
    const clearButton = screen.getByTitle("Clear");
    fireEvent.click(clearButton);
    expect(textarea).toHaveValue("");
  });

  it("copies text", () => {
    render(<CaseConverter ssr={true} />);
    const textarea = screen.getByPlaceholderText(
      "Type or paste your text here...",
    );
    fireEvent.change(textarea, { target: { value: "hello" } });
    const copyButton = screen.getByTitle("Copy Result");
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });
});

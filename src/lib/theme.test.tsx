import { act, render, screen } from "@testing-library/react";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./theme";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

let prefersDark = false;
let listener: MatchMediaListener | undefined;

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <output>{theme}</output>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        Toggle
      </button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  prefersDark = false;
  listener = undefined;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn().mockImplementation(() => ({
      matches: prefersDark,
      addEventListener: jest.fn(
        (_type: string, nextListener: MatchMediaListener) => {
          listener = nextListener;
        },
      ),
      removeEventListener: jest.fn(),
    })),
  });
});

test("uses the system preference until a visitor selects a theme", () => {
  prefersDark = true;
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByText("dark")).toBeInTheDocument();
  expect(document.documentElement).toHaveClass("dark");

  act(() => listener?.({ matches: false } as MediaQueryListEvent));
  expect(screen.getByText("light")).toBeInTheDocument();
  expect(document.documentElement).not.toHaveClass("dark");
});

test("persists an explicit selection and ignores later system changes", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "light");
  prefersDark = true;
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByText("light")).toBeInTheDocument();
  expect(listener).toBeUndefined();

  act(() => screen.getByRole("button", { name: "Toggle" }).click());
  expect(screen.getByText("dark")).toBeInTheDocument();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
});

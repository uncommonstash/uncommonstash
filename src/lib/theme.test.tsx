import { act, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/app-bar";
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from "./theme";

type MatchMediaListener = (event: MediaQueryListEvent) => void;

let prefersDark = false;
let listener: MatchMediaListener | undefined;

function emitSystemThemeChange(matches: boolean) {
  listener?.({ matches } as MediaQueryListEvent);
}

function ThemeProbe() {
  const { preference, theme, setTheme } = useTheme();
  return (
    <>
      <output>{`${preference}:${theme}`}</output>
      <button type="button" onClick={() => setTheme("dark")}>
        Set dark
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
      removeEventListener: jest.fn(
        (_type: string, nextListener: MatchMediaListener) => {
          if (listener === nextListener) listener = undefined;
        },
      ),
    })),
  });
});

test("defaults to the System preference and follows OS changes live", () => {
  prefersDark = true;
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByText("system:dark")).toBeInTheDocument();
  expect(document.documentElement).toHaveClass("dark");

  act(() => emitSystemThemeChange(false));
  expect(screen.getByText("system:light")).toBeInTheDocument();
  expect(document.documentElement).not.toHaveClass("dark");
});

test("persists an explicit selection and ignores later system changes", () => {
  prefersDark = false;
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByText("system:light")).toBeInTheDocument();
  expect(listener).toBeDefined();

  act(() => screen.getByRole("button", { name: "Set dark" }).click());
  expect(screen.getByText("dark:dark")).toBeInTheDocument();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  expect(document.documentElement).toHaveClass("dark");
  expect(listener).toBeUndefined();

  act(() => emitSystemThemeChange(false));
  expect(screen.getByText("dark:dark")).toBeInTheDocument();
});

test("selects and persists System from the theme toggle", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  prefersDark = false;
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );

  expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  act(() => screen.getByRole("button", { name: "System" }).click());

  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  expect(document.documentElement).not.toHaveClass("dark");

  act(() => emitSystemThemeChange(true));
  expect(document.documentElement).toHaveClass("dark");
});

test("rehydrates a saved System preference", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "system");
  prefersDark = true;
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByText("system:dark")).toBeInTheDocument();
  expect(listener).toBeDefined();
});

test("falls back to System for an invalid saved preference", () => {
  localStorage.setItem(THEME_STORAGE_KEY, "midnight");
  prefersDark = true;
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );

  expect(screen.getByRole("button", { name: "System" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(document.documentElement).toHaveClass("dark");
  expect(listener).toBeDefined();
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CronformerClient } from "@/workers/cronformer/cronformer.client";
import { CronInput } from "./text-to-cron";

jest.mock("@/workers/cronformer/cronformer.client", () => ({
  CronformerClient: jest.fn(),
}));

const MockCronformerClient = jest.mocked(CronformerClient);

describe("CronInput", () => {
  beforeEach(() => {
    MockCronformerClient.mockReset();
  });

  it("keeps the first conversion in model-loading state until readiness resolves", async () => {
    let resolveReady: (() => void) | undefined;
    const ready = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        }),
    );
    const infer = jest.fn().mockResolvedValue({ cron: "0 9 * * 1-5" });
    const dispose = jest.fn();
    MockCronformerClient.mockImplementation(
      () => ({ ready, infer, dispose }) as unknown as CronformerClient,
    );

    render(<CronInput debounceMs={0} />);
    fireEvent.change(
      screen.getByPlaceholderText("e.g. every last day of the month at 2pm"),
      { target: { value: "every weekday at 9am" } },
    );

    await waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading Cronformer model…",
    );
    expect(infer).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Cronformer could not run on this device"),
    ).not.toBeInTheDocument();

    if (!resolveReady) throw new Error("Cronformer readiness did not start");
    resolveReady();

    await waitFor(() =>
      expect(infer).toHaveBeenCalledWith(
        "every weekday at 9am",
        expect.any(Function),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("0 9 * * 1-5")).toBeInTheDocument(),
    );
  });

  it("recreates the client and succeeds after a failed cold start", async () => {
    const firstClient = {
      ready: jest.fn().mockRejectedValue(new Error("WASM compile interrupted")),
      infer: jest.fn(),
      dispose: jest.fn(),
    };
    const secondClient = {
      ready: jest.fn().mockResolvedValue(undefined),
      infer: jest.fn().mockResolvedValue({ cron: "0 9 * * 1-5" }),
      dispose: jest.fn(),
    };
    MockCronformerClient.mockImplementationOnce(
      () => firstClient as unknown as CronformerClient,
    ).mockImplementationOnce(() => secondClient as unknown as CronformerClient);

    render(<CronInput debounceMs={0} />);
    fireEvent.change(
      screen.getByPlaceholderText("e.g. every last day of the month at 2pm"),
      { target: { value: "every weekday at 9am" } },
    );

    await waitFor(() =>
      expect(
        screen.getByText("Cronformer could not start. Try again in a moment."),
      ).toBeInTheDocument(),
    );
    expect(firstClient.infer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(firstClient.dispose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(secondClient.ready).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(secondClient.infer).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("0 9 * * 1-5")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("Cronformer could not start. Try again in a moment."),
    ).not.toBeInTheDocument();
  });
});

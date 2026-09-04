import type React from "react";

export function ConverterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row h-full h-[calc(100vh-4rem)] overflow-hidden">
      {children}
    </div>
  );
}

export function InputPanel({
  children,
  className = "",
  show = true,
}: {
  children: React.ReactNode;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={`flex-1 w-full md:w-1/2 p-6 md:p-12 flex flex-col bg-background border-b md:border-b-0 md:border-r ${show ? "flex" : "hidden md:flex"} ${className}`}
    >
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {children}
      </div>
    </div>
  );
}

export function OutputPanel({
  children,
  className = "",
  show = false,
}: {
  children: React.ReactNode;
  className?: string;
  show?: boolean;
}) {
  return (
    <div
      className={`flex-1 w-full md:w-1/2 bg-muted/30 p-6 md:p-12 overflow-y-auto min-h-[50vh] md:min-h-auto flex-col ${show ? "flex" : "hidden md:flex"} ${className}`}
    >
      <div className="flex flex-col max-w-2xl mx-auto w-full flex-1">
        {children}
      </div>
    </div>
  );
}

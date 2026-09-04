import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const IS_SERVER = typeof window === "undefined";

/**
 * Normalize WASM output bytes for Blob construction. Engine callbacks hand
 * back Uint8Array views over shared memory, which BlobPart rejects at the
 * type level — copying into a fresh ArrayBuffer is cheap next to a transcode.
 */
export function toBlobPart(data: Uint8Array | string): BlobPart {
  return typeof data === "string" ? data : new Uint8Array(data);
}

let printed = false;

export function printProlog() {
  if (printed) return;
  printed = true;
  console.info("UncommonStash — useful tools that run in your browser.");
}

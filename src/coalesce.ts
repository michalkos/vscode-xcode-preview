/**
 * Runs `task` one at a time. Calls made while it runs collapse into a single rerun afterwards,
 * so the task always ends up seeing the latest state without piling up work.
 */
export function coalesce(task: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | undefined;
  let again = false;

  const loop = async () => {
    try {
      do {
        again = false;
        await task();
      } while (again);
    } finally {
      running = undefined;
    }
  };

  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = loop();
    return running;
  };
}

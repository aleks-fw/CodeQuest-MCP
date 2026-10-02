/** One job at a time: a job that arrives while another runs is skipped (polling must not pile up). */
export function createGate(): { run(job: () => Promise<void>): Promise<boolean>; readonly busy: boolean } {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run(job) {
      if (busy) return false;
      busy = true;
      try {
        await job();
        return true;
      } finally {
        busy = false;
      }
    },
  };
}

const pipelineTrace: string[] = [];

export function resetPipelineTrace(): void {
  pipelineTrace.length = 0;
}

export function appendPipelineTrace(entry: string): void {
  pipelineTrace.push(entry);
}

export function getPipelineTraceEntries(): string[] {
  return [...pipelineTrace];
}

export function getPipelineTrace(): string {
  return pipelineTrace.join(" | ");
}

export function dumpPipelineTrace(marker: string): void {
  console.info(`[${marker}] PIPELINE TRACE START`);
  pipelineTrace.forEach((entry, index) => {
    console.info(`[${marker}] ${String(index + 1).padStart(2, "0")} ${entry}`);
  });
  console.info(`[${marker}] PIPELINE TRACE END`);
}

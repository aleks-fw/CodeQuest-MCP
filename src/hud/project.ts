import type { ProjectStateView } from '../engine/index.js';

export function formatProjectState(view: ProjectStateView): string {
  const { project } = view;
  return [
    `CodeQuest · ${project.name}`,
    `Root: ${project.root}`,
    `Project id: ${project.id}`,
    'Campaign data is not available in this build yet.',
  ].join('\n');
}

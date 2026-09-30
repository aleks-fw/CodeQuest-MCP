import type { ProjectView } from '../engine/index.js';

/** Temporary text until the HUD module of part B: identifies the project and gives the numbers. */
export function formatProjectState(view: ProjectView): string {
  const { project, state } = view;
  return [
    `CodeQuest · ${project.name}`,
    `Root: ${project.root}`,
    `Project id: ${project.id}`,
    `Level ${state.level} · ${state.xp} XP`,
  ].join('\n');
}

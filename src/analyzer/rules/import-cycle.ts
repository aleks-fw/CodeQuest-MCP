import type { Rule, RuleHit } from './types.js';

type Edges = ReadonlyMap<string, readonly string[]>;

interface Frame {
  node: string;
  next: number;
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const importCycleRule: Rule = {
  id: 'generic/import-cycle',
  category: 'architecture',
  severity: 'medium',
  run(ctx) {
    const nodes = [...ctx.graph.imports.keys()]
      .filter((node) => ctx.byPath.get(node)?.kind !== 'test')
      .sort(byCodePoint);
    const inside = new Set(nodes);
    const edges = new Map<string, string[]>();
    for (const node of nodes) {
      edges.set(
        node,
        (ctx.graph.imports.get(node) ?? []).filter((target) => inside.has(target)),
      );
    }
    const hits: RuleHit[] = [];
    for (const component of stronglyConnected(nodes, edges)) {
      const first = component[0];
      if (first === undefined) continue;
      const selfImport = edges.get(first)?.includes(first) ?? false;
      if (component.length < 2 && !selfImport) continue;
      const loop = shortestLoop(first, new Set(component), edges);
      hits.push({ file: first, message: `Import cycle: ${loop.join(' → ')}`, key: component.join('|') });
    }
    return hits;
  },
};

/** Tarjan's strongly connected components without recursion: long import chains must not overflow the stack. */
export function stronglyConnected(nodes: readonly string[], edges: Edges): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  const indexOf = (node: string): number => index.get(node) ?? 0;
  const lowOf = (node: string): number => low.get(node) ?? 0;

  const enter = (node: string, work: Frame[]): void => {
    const order = index.size;
    index.set(node, order);
    low.set(node, order);
    stack.push(node);
    onStack.add(node);
    work.push({ node, next: 0 });
  };

  const popComponent = (root: string): string[] => {
    const component: string[] = [];
    for (let member = stack.pop(); member !== undefined; member = stack.pop()) {
      onStack.delete(member);
      component.push(member);
      if (member === root) break;
    }
    return component.sort(byCodePoint);
  };

  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Frame[] = [];
    enter(root, work);
    while (work.length > 0) {
      const frame = work[work.length - 1] as Frame;
      const targets = edges.get(frame.node) ?? [];
      if (frame.next < targets.length) {
        const target = targets[frame.next] as string;
        frame.next += 1;
        if (!index.has(target)) {
          enter(target, work);
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(lowOf(frame.node), indexOf(target)));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(lowOf(parent.node), lowOf(frame.node)));
      if (lowOf(frame.node) === indexOf(frame.node)) components.push(popComponent(frame.node));
    }
  }
  return components;
}

/** Shortest import loop that starts and ends at `start` (breadth-first, neighbours in sorted order). */
function shortestLoop(start: string, members: ReadonlySet<string>, edges: Edges): string[] {
  const parent = new Map<string, string>();
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head] as string;
    for (const target of edges.get(node) ?? []) {
      if (target === start) {
        const back: string[] = [];
        for (let at = node; at !== start; at = parent.get(at) ?? start) back.push(at);
        return [start, ...back.reverse(), start];
      }
      if (members.has(target) && !parent.has(target)) {
        parent.set(target, node);
        queue.push(target);
      }
    }
  }
  // Unreachable for a real component; kept so the function is total.
  return [...members, start];
}

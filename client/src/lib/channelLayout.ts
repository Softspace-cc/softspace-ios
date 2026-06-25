export interface ChannelLayoutItem {
  id: string;
  type: string;
  parentId?: string | null;
  position: number;
}

export type DropPlacement = 'before' | 'after' | 'inside';

type TreeNode =
  | { kind: 'channel'; channel: ChannelLayoutItem }
  | { kind: 'category'; channel: ChannelLayoutItem; children: ChannelLayoutItem[] };

function sortByPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((a, b) => a.position - b.position);
}

export function buildChannelTree(channels: ChannelLayoutItem[]): TreeNode[] {
  const sorted = sortByPosition(channels);
  const categoryIds = new Set(sorted.filter((c) => c.type === 'CATEGORY').map((c) => c.id));
  const tree: TreeNode[] = [];

  for (const ch of sorted) {
    if (ch.type === 'CATEGORY') {
      tree.push({
        kind: 'category',
        channel: ch,
        children: sortByPosition(
          sorted.filter((c) => c.parentId === ch.id && c.type !== 'CATEGORY')
        ),
      });
    } else if (!ch.parentId || !categoryIds.has(ch.parentId)) {
      tree.push({ kind: 'channel', channel: ch });
    }
  }

  return tree;
}

export function flattenChannelTree(tree: TreeNode[]) {
  const items: { id: string; parentId: string | null; position: number }[] = [];
  let position = 0;

  for (const node of tree) {
    if (node.kind === 'category') {
      items.push({ id: node.channel.id, parentId: null, position: position++ });
      for (const child of node.children) {
        items.push({ id: child.id, parentId: node.channel.id, position: position++ });
      }
    } else {
      items.push({ id: node.channel.id, parentId: null, position: position++ });
    }
  }

  return items;
}

function cloneTree(tree: TreeNode[]): TreeNode[] {
  return tree.map((node) =>
    node.kind === 'category'
      ? { ...node, children: [...node.children] }
      : { ...node }
  );
}

type Extracted =
  | { kind: 'channel'; channel: ChannelLayoutItem }
  | { kind: 'category'; channel: ChannelLayoutItem; children: ChannelLayoutItem[] };

function extractFromTree(tree: TreeNode[], id: string): { tree: TreeNode[]; extracted: Extracted | null } {
  const next = cloneTree(tree);
  for (let i = 0; i < next.length; i++) {
    const node = next[i];
    if (node.kind === 'category') {
      if (node.channel.id === id) {
        return { tree: next.filter((_, idx) => idx !== i), extracted: node };
      }
      const childIdx = node.children.findIndex((c) => c.id === id);
      if (childIdx !== -1) {
        const [removed] = node.children.splice(childIdx, 1);
        return { tree: next, extracted: { kind: 'channel', channel: removed } };
      }
    } else if (node.channel.id === id) {
      return { tree: next.filter((_, idx) => idx !== i), extracted: node };
    }
  }
  return { tree: next, extracted: null };
}

function insertExtracted(
  tree: TreeNode[],
  extracted: Extracted,
  targetId: string,
  placement: DropPlacement
): TreeNode[] {
  const next = cloneTree(tree);

  if (placement === 'inside') {
    for (const node of next) {
      if (node.kind === 'category' && node.channel.id === targetId) {
        if (extracted.kind === 'category') return tree;
        node.children.push(extracted.channel);
        return next;
      }
    }
    return tree;
  }

  for (let i = 0; i < next.length; i++) {
    const node = next[i];

    if (node.kind === 'category' && node.channel.id === targetId) {
      if (extracted.kind === 'category') {
        const insertAt = placement === 'before' ? i : i + 1;
        next.splice(insertAt, 0, extracted);
        return next;
      }
      const insertAt = placement === 'before' ? 0 : node.children.length;
      node.children.splice(insertAt, 0, extracted.channel);
      return next;
    }

    if (node.kind === 'channel' && node.channel.id === targetId) {
      const insertAt = placement === 'before' ? i : i + 1;
      if (extracted.kind === 'category') {
        next.splice(insertAt, 0, extracted);
      } else {
        next.splice(insertAt, 0, { kind: 'channel', channel: extracted.channel });
      }
      return next;
    }

    if (node.kind === 'category') {
      for (let j = 0; j < node.children.length; j++) {
        const child = node.children[j];
        if (child.id !== targetId) continue;
        if (extracted.kind === 'category') {
          const insertAt = placement === 'before' ? i : i + 1;
          next.splice(insertAt, 0, extracted);
          return next;
        }
        const insertAt = placement === 'before' ? j : j + 1;
        node.children.splice(insertAt, 0, extracted.channel);
        return next;
      }
    }
  }

  return tree;
}

export function moveChannelLayout(
  channels: ChannelLayoutItem[],
  dragId: string,
  targetId: string,
  placement: DropPlacement
): ChannelLayoutItem[] {
  if (dragId === targetId) return channels;

  const drag = channels.find((c) => c.id === dragId);
  const target = channels.find((c) => c.id === targetId);
  if (!drag || !target) return channels;

  if (drag.type === 'CATEGORY' && placement === 'inside') return channels;

  let tree = buildChannelTree(channels);
  const { tree: without, extracted } = extractFromTree(tree, dragId);
  if (!extracted) return channels;

  tree = without;
  tree = insertExtracted(tree, extracted, targetId, placement);

  const layout = flattenChannelTree(tree);
  return channels.map((ch) => {
    const item = layout.find((l) => l.id === ch.id);
    if (!item) return ch;
    return { ...ch, position: item.position, parentId: item.parentId };
  });
}

export function applyChannelLayout<T extends ChannelLayoutItem>(
  channels: T[],
  layout: { id: string; parentId: string | null; position: number }[]
): T[] {
  return channels.map((ch) => {
    const item = layout.find((l) => l.id === ch.id);
    if (!item) return ch;
    return { ...ch, position: item.position, parentId: item.parentId };
  });
}

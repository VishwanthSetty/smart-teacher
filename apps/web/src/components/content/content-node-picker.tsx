'use client';

import { useEffect, useState } from 'react';
import type { ContentTree, ContentTreeNode, Curriculum } from '@smart-teacher/shared-types';

/**
 * Picks the place in the curriculum tree a video is filed under.
 *
 * Two selects, because the tree is only meaningful inside one curriculum: choose the
 * curriculum, then a node within it. The node list is flattened and indented rather than
 * nested, so a select can render it at any depth the schema declares.
 *
 * Only content-holding levels are offered. The API refuses the rest with a 409 anyway —
 * offering them would just be a slower way to reach the same error.
 */

interface Props {
  curricula: Curriculum[];
  /** Pre-selects the node a video is currently filed under, on the edit form. */
  defaultCurriculumId?: string;
  defaultNodeId?: string;
  /** Rendered as a hidden input under this name, so the parent form submits it. */
  name?: string;
  required?: boolean;
  // Reports both ids: callers that warn about a video changing hands need the curriculum,
  // not just the node it landed on.
  onChange?: (selection: { curriculumId: string; contentNodeId: string }) => void;
}

interface FlatNode {
  id: string;
  label: string;
  canHoldContent: boolean;
}

// Depth-first with the tree's own ordering, so the select reads top to bottom exactly as
// the builder shows it.
function flatten(nodes: ContentTreeNode[], prefix = ''): FlatNode[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${prefix}${node.title} (${node.levelName})`,
      canHoldContent: node.canHoldContent,
    },
    ...flatten(node.children, `${prefix}    `),
  ]);
}

export function ContentNodePicker({
  curricula,
  defaultCurriculumId,
  defaultNodeId,
  name = 'contentNodeId',
  required = true,
  onChange,
}: Props) {
  const [curriculumId, setCurriculumId] = useState(defaultCurriculumId ?? '');
  const [nodeId, setNodeId] = useState(defaultNodeId ?? '');
  const [nodes, setNodes] = useState<FlatNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!curriculumId) {
      setNodes([]);
      return;
    }

    // Guards against a slow response for a curriculum the user has already moved off,
    // which would otherwise overwrite the newer list.
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/curricula/${curriculumId}/tree`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load that curriculum');
        return (await response.json()) as ContentTree;
      })
      .then((tree) => {
        if (!active) return;
        setNodes(flatten(tree.nodes));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setNodes([]);
        setError(cause instanceof Error ? cause.message : 'Could not load that curriculum');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [curriculumId]);

  function selectNode(value: string, forCurriculumId = curriculumId) {
    setNodeId(value);
    onChange?.({ curriculumId: forCurriculumId, contentNodeId: value });
  }

  const hasPlaceToFile = nodes.some((node) => node.canHoldContent);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium text-ink">
        Curriculum
        <select
          value={curriculumId}
          onChange={(event) => {
            setCurriculumId(event.target.value);
            // Clearing the node is not optional: the previous selection belongs to a tree
            // that is about to be replaced, and submitting it would file the video under
            // a curriculum the operator is no longer looking at.
            selectNode('', event.target.value);
          }}
          className="field font-normal"
        >
          <option value="">Choose curriculum</option>
          {curricula.map((curriculum) => (
            <option key={curriculum.id} value={curriculum.id}>
              [{curriculum.audience === 'TEACHER' ? 'Teachers' : 'Students'}]{' '}
              {curriculum.gradeLevelName} · {curriculum.subjectName}
              {curriculum.status === 'PUBLISHED' ? '' : ' (draft)'}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm font-medium text-ink">
        Content node
        <select
          name={name}
          required={required}
          value={nodeId}
          onChange={(event) => selectNode(event.target.value)}
          disabled={!curriculumId || loading}
          className="field font-normal disabled:bg-surface-low"
        >
          <option value="">{loading ? 'Loading…' : 'Choose where it belongs'}</option>
          {nodes.map((node) => (
            // A chapter still appears, greyed, so the shape of the curriculum is legible
            // even where content cannot hang.
            <option key={node.id} value={node.id} disabled={!node.canHoldContent}>
              {node.label}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-status-danger md:col-span-2">{error}</p>}
      {!error && !loading && curriculumId && !hasPlaceToFile && (
        <p className="text-sm text-amber-700 md:col-span-2">
          This curriculum has no level that can hold videos yet. Add one in the curriculum builder
          first.
        </p>
      )}
    </div>
  );
}

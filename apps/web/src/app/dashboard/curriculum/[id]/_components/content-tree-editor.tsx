'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ContentTreeNode, CurriculumLevel } from '@smart-teacher/shared-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NodeForm } from './node-form';

interface FlatNode { id: string; title: string; depth: number; parentId: string | null }

function flatten(nodes: ContentTreeNode[]): FlatNode[] {
  return nodes.flatMap((node) => [{ id: node.id, title: node.title, depth: node.depth, parentId: node.parentId }, ...flatten(node.children)]);
}

function descendants(node: ContentTreeNode): Set<string> {
  return new Set([node.id, ...node.children.flatMap((child) => [...descendants(child)])]);
}

export function ContentTreeEditor({ curriculumId, levels, nodes }: { curriculumId: string; levels: CurriculumLevel[]; nodes: ContentTreeNode[] }) {
  const router = useRouter();
  const [addingTo, setAddingTo] = useState<string | 'root' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const all = flatten(nodes);
  const refresh = () => { setAddingTo(null); router.refresh(); };

  async function request(url: string, init: RequestInit, fallback: string) {
    setError(null);
    const response = await fetch(url, init);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.message ?? fallback);
      return false;
    }
    refresh();
    return true;
  }

  async function edit(node: ContentTreeNode) {
    const title = prompt(`Rename ${node.levelName}`, node.title);
    if (!title || title === node.title) return;
    await request(`/api/content-nodes/${node.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }, 'Could not update node');
  }

  async function remove(node: ContentTreeNode) {
    if (!confirm(`Delete ${node.title} and all of its children?`)) return;
    await request(`/api/content-nodes/${node.id}`, { method: 'DELETE' }, 'Could not delete node');
  }

  async function move(node: ContentTreeNode, parentId: string | null, position: number) {
    await request(`/api/content-nodes/${node.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, position }) }, 'Could not move node');
  }

  function Branch({ node, siblings, index }: { node: ContentTreeNode; siblings: ContentTreeNode[]; index: number }) {
    const nextLevel = levels.find((level) => level.depth === node.depth + 1);
    const excluded = descendants(node);
    return (
      <li>
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Badge variant="info">{node.levelName}</Badge><h3 className="font-semibold text-ink">{node.title}</h3></div>
              <p className="mt-1 font-mono text-xs text-ink-muted">{node.code} · {node.videoCountDeep} videos · {node.documentCountDeep} documents</p>
              {node.description ? <p className="mt-2 text-sm text-ink-muted">{node.description}</p> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" className="h-8 px-2" onClick={() => edit(node)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
              <Button variant="ghost" className="h-8 w-8 px-0" disabled={index === 0} onClick={() => move(node, node.parentId, index - 1)} aria-label="Move up"><ChevronUp className="h-4 w-4" /></Button>
              <Button variant="ghost" className="h-8 w-8 px-0" disabled={index === siblings.length - 1} onClick={() => move(node, node.parentId, index + 1)} aria-label="Move down"><ChevronDown className="h-4 w-4" /></Button>
              {nextLevel ? <Button variant="secondary" className="h-8 px-2" onClick={() => setAddingTo(node.id)}><Plus className="h-3.5 w-3.5" /> {nextLevel.name}</Button> : null}
              <Button variant="ghost" className="h-8 w-8 px-0 text-status-danger hover:bg-red-50 hover:text-status-danger" onClick={() => remove(node)} aria-label={`Delete ${node.title}`}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink-muted">Parent<select value={node.parentId ?? ''} onChange={(event) => move(node, event.target.value || null, 0)} className="field h-8 w-auto py-1 text-xs"><option value="">Tree root</option>{all.filter((candidate) => !excluded.has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{'—'.repeat(candidate.depth)} {candidate.title}</option>)}</select></label>
          {addingTo === node.id && nextLevel ? <NodeForm curriculumId={curriculumId} parentId={node.id} levelName={nextLevel.name} onSaved={refresh} onCancel={() => setAddingTo(null)} /> : null}
        </Card>
        {node.children.length > 0 ? <ol className="ml-5 mt-3 grid gap-3 border-l-2 border-brand-tint pl-4">{node.children.map((child, childIndex) => <Branch key={child.id} node={child} siblings={node.children} index={childIndex} />)}</ol> : null}
      </li>
    );
  }

  const rootLevel = levels.find((level) => level.depth === 1);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-ink">Content tree</h2><p className="text-sm text-ink-muted">Build the hierarchy learners use to navigate this curriculum.</p></div>{rootLevel ? <Button onClick={() => setAddingTo('root')}><Plus className="h-4 w-4" /> Add {rootLevel.name}</Button> : null}</div>
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-status-danger">{error}</p> : null}
      {addingTo === 'root' && rootLevel ? <NodeForm curriculumId={curriculumId} parentId={null} levelName={rootLevel.name} onSaved={refresh} onCancel={() => setAddingTo(null)} /> : null}
      {nodes.length === 0 ? <div className="rounded-card border border-dashed border-surface-border bg-white p-10 text-center text-sm text-ink-muted">The tree is empty. Add the first {rootLevel?.name.toLowerCase() ?? 'node'} to begin.</div> : <ol className="grid gap-4">{nodes.map((node, index) => <Branch key={node.id} node={node} siblings={nodes} index={index} />)}</ol>}
    </section>
  );
}

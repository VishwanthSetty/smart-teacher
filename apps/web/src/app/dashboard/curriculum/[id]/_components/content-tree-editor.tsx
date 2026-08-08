'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentTreeNode, CurriculumLevel } from '@smart-teacher/shared-types';
import { NodeForm } from './node-form';

interface FlatNode { id: string; title: string; depth: number; parentId: string | null; }
function flatten(nodes: ContentTreeNode[]): FlatNode[] { return nodes.flatMap((node) => [{ id: node.id, title: node.title, depth: node.depth, parentId: node.parentId }, ...flatten(node.children)]); }
function descendants(node: ContentTreeNode): Set<string> { return new Set([node.id, ...node.children.flatMap((child) => [...descendants(child)])]); }

export function ContentTreeEditor({ curriculumId, levels, nodes }: { curriculumId: string; levels: CurriculumLevel[]; nodes: ContentTreeNode[] }) {
  const router = useRouter(); const [addingTo, setAddingTo] = useState<string | 'root' | null>(null); const [error, setError] = useState<string | null>(null); const all = flatten(nodes);
  const refresh = () => { setAddingTo(null); router.refresh(); };
  async function request(url: string, init: RequestInit, fallback: string) { setError(null); const response = await fetch(url, init); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.message ?? fallback); return false; } refresh(); return true; }
  async function edit(node: ContentTreeNode) { const title = prompt(`Rename ${node.levelName}`, node.title); if (!title || title === node.title) return; await request(`/api/content-nodes/${node.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }, 'Could not update node'); }
  async function remove(node: ContentTreeNode) { if (!confirm(`Delete ${node.title} and all of its children?`)) return; await request(`/api/content-nodes/${node.id}`, { method: 'DELETE' }, 'Could not delete node'); }
  async function move(node: ContentTreeNode, parentId: string | null, position: number) { await request(`/api/content-nodes/${node.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, position }) }, 'Could not move node'); }

  function Branch({ node, siblings, index }: { node: ContentTreeNode; siblings: ContentTreeNode[]; index: number }) {
    const nextLevel = levels.find((level) => level.depth === node.depth + 1); const excluded = descendants(node);
    return <li className="rounded-lg border bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{node.levelName}</span><h3 className="font-medium">{node.title}</h3></div><p className="mt-1 font-mono text-xs text-gray-500">{node.code} · {node.videos.length} direct / {node.videoCountDeep} total videos</p>{node.description && <p className="mt-2 text-sm text-gray-600">{node.description}</p>}</div><div className="flex flex-wrap gap-2"><button onClick={() => edit(node)} className="rounded border px-2 py-1 text-xs">Edit</button><button disabled={index === 0} onClick={() => move(node, node.parentId, index - 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↑</button><button disabled={index === siblings.length - 1} onClick={() => move(node, node.parentId, index + 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↓</button>{nextLevel && <button onClick={() => setAddingTo(node.id)} className="rounded border px-2 py-1 text-xs">Add {nextLevel.name}</button>}<button onClick={() => remove(node)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-700">Delete</button></div></div>
      <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">Parent<select value={node.parentId ?? ''} onChange={(event) => move(node, event.target.value || null, 0)} className="rounded border px-2 py-1"><option value="">Tree root</option>{all.filter((candidate) => !excluded.has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{'—'.repeat(candidate.depth)} {candidate.title}</option>)}</select></label>
      {addingTo === node.id && nextLevel && <NodeForm curriculumId={curriculumId} parentId={node.id} levelName={nextLevel.name} onSaved={refresh} onCancel={() => setAddingTo(null)} />}
      {node.children.length > 0 && <ol className="mt-4 grid gap-3 border-l-2 border-gray-200 pl-4">{node.children.map((child, childIndex) => <Branch key={child.id} node={child} siblings={node.children} index={childIndex} />)}</ol>}
    </li>;
  }

  const rootLevel = levels.find((level) => level.depth === 1);
  return <section className="grid gap-4"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Content tree</h2>{rootLevel && <button onClick={() => setAddingTo('root')} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">Add {rootLevel.name}</button>}</div>{error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{addingTo === 'root' && rootLevel && <NodeForm curriculumId={curriculumId} parentId={null} levelName={rootLevel.name} onSaved={refresh} onCancel={() => setAddingTo(null)} />}{nodes.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">The tree is empty. Add the first {rootLevel?.name.toLowerCase() ?? 'node'} to begin.</p> : <ol className="grid gap-4">{nodes.map((node, index) => <Branch key={node.id} node={node} siblings={nodes} index={index} />)}</ol>}</section>;
}

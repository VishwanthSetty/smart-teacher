'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { Section, UserStatus } from '@smart-teacher/shared-types';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';

export function MobileStudentFilters({ sections, status, sectionId, search }: { sections: Section[]; status?: UserStatus; sectionId?: string; search?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return <div className="md:hidden"><Button variant="secondary" onClick={() => setIsOpen(true)} className="w-full"><SlidersHorizontal className="h-4 w-4" /> Filters</Button><Drawer isOpen={isOpen} title="Filter students" placement="bottom" onClose={() => setIsOpen(false)}><form action="/dashboard/students" className="space-y-4"><label><span className="field-label">Status</span><select name="status" defaultValue={status ?? ''} className="field"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="DISABLED">Disabled</option></select></label><label><span className="field-label">Section</span><select name="sectionId" defaultValue={sectionId ?? ''} className="field"><option value="">All sections</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}</select></label><label><span className="field-label">Search</span><input type="search" name="search" defaultValue={search} className="field" placeholder="Name, email, or roll number" /></label><Button type="submit" className="w-full">Apply filters</Button></form></Drawer></div>;
}

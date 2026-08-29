import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[45%_55%]">
      <section className="relative hidden overflow-hidden bg-brand-navy p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(30deg,transparent_49%,rgba(144,202,249,.35)_50%,transparent_51%),linear-gradient(150deg,transparent_49%,rgba(144,202,249,.2)_50%,transparent_51%)] [background-size:80px_80px]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue"><GraduationCap className="h-6 w-6" /></span>
          <span className="text-lg font-semibold">Smart Teacher</span>
        </div>
        <div className="relative my-auto max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">Teaching material,<br />organised.</h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-brand-soft">One calm place for schools, educators, classes, and curriculum content.</p>
        </div>
        <p className="relative text-xs text-white/50">Secure access for every school community.</p>
      </section>
      <section className="flex items-center justify-center bg-white px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </section>
    </main>
  );
}

import { Plus } from 'lucide-react';
import { proto } from '@/shared/ui/primitives';
import type { AdminGroup, Section } from '../data';
import { Btn, DataTable, PageHeader, Panel, Pill } from '../components/ui';
import { useAdmin } from '../store';

export function StructurePage() {
  const { sections, groups } = useAdmin();
  return (
    <>
      <PageHeader title="Secciones y grupos" subtitle="Cada sección es un área de la organización. Cada grupo pertenece a una sola sección."
        actions={<Btn tone="primary" onClick={() => proto('Crear secciones y grupos')}><Plus className="h-3.5 w-3.5" />Nueva sección</Btn>} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Secciones" flush>
          <DataTable label="Secciones" rows={sections} columns={[
            { header: 'Sección', cell: (s: Section) => <span className="font-semibold">{s.name}</span> },
            { header: 'Responsable', cell: (s) => s.head },
            { header: 'Miembros', cell: (s) => s.members },
            { header: 'Grupos', cell: (s) => s.groups },
            { header: 'Acciones', className: 'text-right', cell: () => <span className="flex justify-end"><Btn onClick={() => proto('Editar secciones')}>Editar</Btn></span> },
          ]} />
        </Panel>
        <Panel title="Grupos" flush>
          <DataTable label="Grupos" rows={groups} columns={[
            { header: 'Grupo', cell: (g: AdminGroup) => <span className="font-semibold">{g.name}</span> },
            { header: 'Sección', cell: (g) => g.section },
            { header: 'Miembros', cell: (g) => g.members },
            { header: 'Privacidad', cell: (g) => <Pill tone={g.privacy === 'Privado' ? 'mute' : 'info'}>{g.privacy}</Pill> },
            { header: 'Acciones', className: 'text-right', cell: () => <span className="flex justify-end"><Btn onClick={() => proto('Gestionar grupos')}>Gestionar</Btn></span> },
          ]} />
        </Panel>
      </div>
    </>
  );
}

import { describe, expect, it } from 'vitest';
import { descendantFolderIds, folderPathLabel, reparentCandidates } from '../src/services/folders';
import type { Folder } from '../src/types/api';

const folders: Folder[] = [
  { folder_id: 'root', app_id: 'app-a', parent_folder_id: null, name: 'Raiz', archived: false, created_at: '', updated_at: '' },
  { folder_id: 'moving', app_id: 'app-a', parent_folder_id: 'root', name: 'Mover', archived: false, created_at: '', updated_at: '' },
  { folder_id: 'child', app_id: 'app-a', parent_folder_id: 'moving', name: 'Filha', archived: false, created_at: '', updated_at: '' },
  { folder_id: 'grandchild', app_id: 'app-a', parent_folder_id: 'child', name: 'Neta', archived: false, created_at: '', updated_at: '' },
  { folder_id: 'other', app_id: 'app-a', parent_folder_id: null, name: 'Outra', archived: false, created_at: '', updated_at: '' },
  { folder_id: 'foreign', app_id: 'app-b', parent_folder_id: null, name: 'Outro projeto', archived: false, created_at: '', updated_at: '' },
];

describe('reparent de pastas', () => {
  it('exclui a própria pasta e todos os descendentes, mas mantém pais e irmãos do mesmo app', () => {
    expect([...descendantFolderIds(folders, 'moving')].sort()).toEqual(['child', 'grandchild', 'moving']);
    expect(reparentCandidates(folders, folders[1]).map((folder) => folder.folder_id)).toEqual(['root', 'other']);
  });

  it('monta o caminho legível da pasta sem percorrer ciclos indefinidamente', () => {
    expect(folderPathLabel(folders[3], folders)).toBe('Raiz / Mover / Filha / Neta');
    const cyclic = folders.map((folder) => folder.folder_id === 'root' ? { ...folder, parent_folder_id: 'grandchild' } : folder);
    expect(folderPathLabel(cyclic[3], cyclic)).toContain('Neta');
  });
});

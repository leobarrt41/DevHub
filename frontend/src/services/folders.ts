import type { Folder } from '../types/api';

export function descendantFolderIds(folders: Folder[], folderId: string): Set<string> {
  const ids = new Set([folderId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parent_folder_id && ids.has(folder.parent_folder_id) && !ids.has(folder.folder_id)) {
        ids.add(folder.folder_id);
        changed = true;
      }
    }
  }

  return ids;
}

export function reparentCandidates(folders: Folder[], folder: Folder): Folder[] {
  const excluded = descendantFolderIds(folders, folder.folder_id);
  return folders.filter((candidate) => candidate.app_id === folder.app_id && !excluded.has(candidate.folder_id));
}

export function folderPathLabel(folder: Folder, folders: Folder[]): string {
  const byId = new Map(folders.map((item) => [item.folder_id, item]));
  const names = [folder.name];
  const seen = new Set([folder.folder_id]);
  let parentId = folder.parent_folder_id;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent_folder_id;
  }

  return names.join(' / ');
}

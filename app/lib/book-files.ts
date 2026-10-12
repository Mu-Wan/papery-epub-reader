/** File bodies are read one at a time; metadata snapshots never own the library's bytes. */
export type BookFiles = Map<string, Blob> & {
  read?: (id: string) => Promise<Blob | undefined>;
  localIds?: Set<string>;
  stagedIds?: Map<string, string>;
};
export async function readBookFile(files: BookFiles, id: string) {
  return files.get(id) || await files.read?.(id);
}

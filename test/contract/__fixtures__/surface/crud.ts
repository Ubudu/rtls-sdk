// Not exported from index.ts: its members are reached through the client and attributed to this file.
export class CrudBase {
  list(): string[] {
    return [];
  }
  remove(id: string): string {
    return id;
  }
}

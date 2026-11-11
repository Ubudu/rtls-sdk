export class Things {
  private readonly items: string[] = [];

  list(): string[] {
    return [...this.items];
  }

  remove(id: string): void {
    this.items.splice(this.items.indexOf(id), 1);
  }

  static make(): Things {
    return new Things();
  }
}

export const handlers = {
  ping(): string {
    return 'pong';
  },
};

export const named = (x: number): number => {
  return x + 1;
};

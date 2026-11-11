import { CrudBase } from './crud';

class AssetsApi {
  list(): string[] {
    return [];
  }
  get(id: string): string {
    return id;
  }
  private secret(): void {}
  protected guarded(): void {}
  #hidden(): void {}
  /** @internal Used by the client only */
  internalOnly(): void {}
  get count(): number {
    return 1;
  }
  readonly onEvent = (name: string): string => name;
  readonly label = 'assets';
}

class RulesApi extends CrudBase {
  create(name: string): string {
    return name;
  }
}

class NotificationsApi {
  readonly rules = new RulesApi();
  send(): void {}
}

class ClientBase {
  setNamespace(ns: string): this {
    void ns;
    return this;
  }
  /**
   * @internal Used by resource classes
   */
  requireNs(): string {
    return '';
  }
  protected request(): void {}
}

export class SampleClient extends ClientBase {
  readonly assets = new AssetsApi();
  readonly notifications = new NotificationsApi();
  private readonly secretApi = new AssetsApi();
  constructor() {
    super();
    void this.secretApi;
  }
  health(): string {
    return 'OK';
  }
  get raw(): string {
    return 'raw';
  }
  static version(): string {
    return '1';
  }
}

export function createSampleClient(): SampleClient {
  return new SampleClient();
}

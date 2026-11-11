export class Base {
  baseMethod(): void {}
  static build(): Base {
    return new Base();
  }
}

export class Foo extends Base {
  constructor(public readonly x = 1) {
    super();
  }
  bar(): number {
    return this.x;
  }
  static make(): Foo {
    return new Foo();
  }
  private p(): void {}
  protected q(): void {}
  #r(): void {}
  /** @internal */
  s(): void {}
  get value(): number {
    return 1;
  }
}

/** @internal */
export class Hidden {
  m(): void {}
}

export class Plain {}

export class TypeOnlyClass {
  t(): void {}
}

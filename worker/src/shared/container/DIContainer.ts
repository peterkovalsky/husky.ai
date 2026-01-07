// Simple Dependency Injection Container
export class DIContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();

  register<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }

  registerFactory<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory);
  }

  get<T>(name: string): T {
    if (this.services.has(name)) {
      return this.services.get(name);
    }

    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!;
      const instance = factory();
      this.services.set(name, instance);
      return instance;
    }

    throw new Error(`Service ${name} not found`);
  }

  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }
}
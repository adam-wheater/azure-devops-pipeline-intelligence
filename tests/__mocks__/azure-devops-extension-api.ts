const mockClients: Record<string, any> = {};

export const CommonServiceIds = {
  ProjectPageService: "ms.vss-tfs-web.tfs-page-data-service",
  ExtensionDataService: "ms.vss-features.extension-data-service",
};

export function getClient(clientClass: any): any {
  if (!clientClass) return {};
  const name = clientClass._mockName || clientClass.name || "unknown";
  if (!mockClients[name]) {
    mockClients[name] = {};
  }
  return mockClients[name];
}

export function __setMockClient(name: string, client: any): void {
  mockClients[name] = client;
}

export function __resetMockClients(): void {
  for (const key of Object.keys(mockClients)) {
    delete mockClients[key];
  }
}

export interface IExtensionDataService {
  getExtensionDataManager(extensionId: string, accessToken: string): Promise<IExtensionDataManager>;
}

export interface IExtensionDataManager {
  getDocument(collectionName: string, id: string): Promise<any>;
  setDocument(collectionName: string, doc: any): Promise<any>;
}

export interface IProjectPageService {
  getProject(): Promise<{ name: string; id: string } | undefined>;
}

// Build types
export class BuildRestClient {
  static _mockName = "BuildRestClient";
}

export enum BuildStatus {
  None = 0,
  InProgress = 1,
  Completed = 2,
  Cancelling = 4,
  Postponed = 8,
  NotStarted = 32,
}

export enum BuildResult {
  None = 0,
  Succeeded = 2,
  PartiallySucceeded = 4,
  Failed = 8,
  Canceled = 32,
}

// Test types
export class TestRestClient {
  static _mockName = "TestRestClient";
}

import type { CozeConfig } from "coze-coding-dev-sdk";

type CozeSdkModule = typeof import("coze-coding-dev-sdk");
type ConfigurableClientConstructor<TClient> = new (
  config: InstanceType<CozeSdkModule["Config"]>,
  customHeaders?: Record<string, string>,
) => TClient;

let sdkPromise: Promise<CozeSdkModule> | null = null;

export type CozeClientFactoryParams = {
  config: CozeConfig;
  customHeaders?: Record<string, string>;
};

export async function loadCozeSdk(): Promise<CozeSdkModule> {
  if (!sdkPromise) {
    sdkPromise = import("coze-coding-dev-sdk");
  }
  return sdkPromise;
}

async function createClient<TClient>(
  params: CozeClientFactoryParams,
  resolveCtor: (sdk: CozeSdkModule) => ConfigurableClientConstructor<TClient>,
): Promise<TClient> {
  const sdk = await loadCozeSdk();
  const Client = resolveCtor(sdk);
  return new Client(new sdk.Config(params.config), params.customHeaders);
}

export async function createSearchClient(
  params: CozeClientFactoryParams,
): Promise<InstanceType<CozeSdkModule["SearchClient"]>> {
  return createClient(params, (sdk) => sdk.SearchClient);
}

export async function createFetchClient(
  params: CozeClientFactoryParams,
): Promise<InstanceType<CozeSdkModule["FetchClient"]>> {
  return createClient(params, (sdk) => sdk.FetchClient);
}

export async function createImageGenerationClient(
  params: CozeClientFactoryParams,
): Promise<InstanceType<CozeSdkModule["ImageGenerationClient"]>> {
  return createClient(params, (sdk) => sdk.ImageGenerationClient);
}

export async function createTtsClient(
  params: CozeClientFactoryParams,
): Promise<InstanceType<CozeSdkModule["TTSClient"]>> {
  return createClient(params, (sdk) => sdk.TTSClient);
}

export async function createAsrClient(
  params: CozeClientFactoryParams,
): Promise<InstanceType<CozeSdkModule["ASRClient"]>> {
  return createClient(params, (sdk) => sdk.ASRClient);
}

export function formatCozeError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    const status =
      "statusCode" in error && typeof error.statusCode === "number" ? ` (${error.statusCode})` : "";
    return `${message}${status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type GeneratedFileDeliveryResult = "shared" | "downloaded" | "cancelled";

type GeneratedFileDeliveryOptions<T> = {
  userAgent: string;
  createFile: () => T;
  canShare: (file: T) => boolean;
  share: (file: T) => Promise<void>;
  download: () => void;
};

export function isAndroidUserAgent(userAgent: string) {
  return /Android/i.test(userAgent);
}

function isCancelledShare(error: unknown) {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export async function deliverGeneratedFile<T>({
  userAgent,
  createFile,
  canShare,
  share,
  download,
}: GeneratedFileDeliveryOptions<T>): Promise<GeneratedFileDeliveryResult> {
  if (isAndroidUserAgent(userAgent)) {
    download();
    return "downloaded";
  }

  try {
    const file = createFile();
    if (canShare(file)) {
      await share(file);
      return "shared";
    }
  } catch (error) {
    if (isCancelledShare(error)) return "cancelled";
    download();
    return "downloaded";
  }

  download();
  return "downloaded";
}

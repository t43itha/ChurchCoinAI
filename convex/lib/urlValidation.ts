export const validateRedirectUrl = (
  url: string,
  fieldName: string,
  appBaseUrl?: string
) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${fieldName} is not a valid URL`);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error(`${fieldName} must use HTTP or HTTPS`);
  }

  if (appBaseUrl) {
    const allowedHost = new URL(appBaseUrl).host;
    if (parsed.host !== allowedHost) {
      throw new Error(`${fieldName} host is not allowed`);
    }
  }
};

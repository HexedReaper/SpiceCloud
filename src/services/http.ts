/**
 * Cross-origin HTTP GET that bypasses Chromium's CORS enforcement.
 *
 * SoundCloud's API sets `access-control-allow-origin: https://soundcloud.com`,
 * which blocks fetch() from Spotify's Electron renderer (different origin).
 * Node.js's https module operates at OS level and is never subject to CORS,
 * so we use it whenever window.require is available (standard in Spicetify).
 *
 * Falls back to browser fetch() only if window.require is absent.
 */

import type * as HttpsType from "https";
import type * as ZlibType from "zlib";
import type * as StreamType from "stream";

export interface HttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

function getRequire(): ((id: string) => unknown) | null {
  return (
    (window as unknown as { require?: (id: string) => unknown }).require ?? null
  );
}

// Mimic a browser User-Agent so SoundCloud doesn't reject the request.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function collectReadable(stream: StreamType.Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: unknown) =>
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer),
      ),
    );
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function nodeGet(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = 5,
): Promise<HttpResponse> {
  const req = getRequire()!;
  const https = req("https") as typeof HttpsType;
  const zlib = req("zlib") as typeof ZlibType;

  return new Promise<HttpResponse>((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            Accept: "application/json, text/html, */*",
            "Accept-Encoding": "gzip, deflate, br",
            "User-Agent": UA,
            ...headers,
          },
        },
        (res) => {
          // Follow HTTP redirects (Node.js does not do this automatically).
          const location = res.headers["location"] as string | undefined;
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            location &&
            redirectsLeft > 0
          ) {
            res.resume(); // drain to free the socket
            const next = location.startsWith("http")
              ? location
              : new URL(location, url).href;
            nodeGet(next, headers, redirectsLeft - 1)
              .then(resolve)
              .catch(reject);
            return;
          }

          const enc = (res.headers["content-encoding"] as string) ?? "";
          let stream: StreamType.Readable =
            res as unknown as StreamType.Readable;
          if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
          else if (enc.includes("deflate"))
            stream = res.pipe(zlib.createInflate());
          else if (enc.includes("br"))
            stream = res.pipe(zlib.createBrotliDecompress());

          collectReadable(stream)
            .then((buf) => {
              const body = buf.toString("utf-8");
              const status = res.statusCode ?? 0;
              resolve({
                ok: status >= 200 && status < 300,
                status,
                text: () => Promise.resolve(body),
                json: <T>() => {
                  try {
                    return Promise.resolve(JSON.parse(body) as T);
                  } catch {
                    return Promise.reject(
                      new Error(
                        `Invalid JSON (HTTP ${status}): ${body.slice(0, 100)}`,
                      ),
                    );
                  }
                },
              });
            })
            .catch(reject);
        },
      )
      .on("error", reject);
  });
}

/** GET url, returning a response-like object. Uses Node.js https when available. */
export async function httpGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  if (getRequire()) {
    return nodeGet(url, headers);
  }
  // Browser fetch fallback — CORS will likely block this in Spotify's renderer.
  const res = await fetch(url, {
    credentials: "omit",
    headers: new Headers(headers),
  });
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: <T>() => res.json() as Promise<T>,
  };
}

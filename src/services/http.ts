/**
 * Cross-origin HTTP client that bypasses Chromium's CORS enforcement.
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

function buildNodeResponse(buf: Buffer, statusCode: number): HttpResponse {
  const body = buf.toString("utf-8");
  const status = statusCode;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: <T>() => {
      try {
        return Promise.resolve(JSON.parse(body) as T);
      } catch {
        return Promise.reject(
          new Error(`Invalid JSON (HTTP ${status}): ${body.slice(0, 100)}`),
        );
      }
    },
  };
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
          const location = res.headers["location"] as string | undefined;
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            location &&
            redirectsLeft > 0
          ) {
            res.resume();
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
            .then((buf) => resolve(buildNodeResponse(buf, res.statusCode ?? 0)))
            .catch(reject);
        },
      )
      .on("error", reject);
  });
}

async function nodeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  const req = getRequire()!;
  const https = req("https") as typeof HttpsType;
  const zlib = req("zlib") as typeof ZlibType;

  return new Promise<HttpResponse>((resolve, reject) => {
    const parsed = new URL(url);
    const reqHeaders: Record<string, string | number> = {
      Accept: "application/json, */*",
      "Accept-Encoding": "gzip, deflate, br",
      "User-Agent": UA,
      ...headers,
    };
    if (body) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(body);
    }

    const request = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const enc = (res.headers["content-encoding"] as string) ?? "";
        let stream: StreamType.Readable = res as unknown as StreamType.Readable;
        if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
        else if (enc.includes("deflate"))
          stream = res.pipe(zlib.createInflate());
        else if (enc.includes("br"))
          stream = res.pipe(zlib.createBrotliDecompress());

        collectReadable(stream)
          .then((buf) => resolve(buildNodeResponse(buf, res.statusCode ?? 0)))
          .catch(reject);
      },
    );

    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

/** GET url, returning a response-like object. Uses Node.js https when available. */
export async function httpGet(
  url: string,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  if (getRequire()) return nodeGet(url, headers);
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

/** PUT or DELETE url. Uses Node.js https when available, falls back to fetch. */
export async function httpRequest(
  url: string,
  method: "PUT" | "DELETE",
  headers: Record<string, string> = {},
  body?: string,
): Promise<HttpResponse> {
  if (getRequire()) return nodeRequest(url, method, headers, body);
  const res = await fetch(url, {
    method,
    credentials: "omit",
    headers: new Headers({
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    }),
    body,
  });
  return {
    ok: res.ok,
    status: res.status,
    text: () => res.text(),
    json: <T>() => res.json() as Promise<T>,
  };
}

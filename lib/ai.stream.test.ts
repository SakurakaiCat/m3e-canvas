import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, type AiSettings } from "./ai";

const settings = (over: Partial<AiSettings> = {}): AiSettings =>
  ({ provider: "openai", baseUrl: "https://api.example.test", model: "test-model", key: "test-key", ...over });

const sseResponse = (events: string[]) =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });

afterEach(() => vi.unstubAllGlobals());

describe("streaming on the openai-compatible path", () => {
  it("requests stream and hands every delta to the callback, returning the full text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      JSON.stringify({ choices: [{ delta: { content: '{"fra' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'mes": []}' } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      "[DONE]",
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const got: string[] = [];
    const text = await complete(settings(), "s", "u", undefined, 4096, (d) => got.push(d));
    expect(text).toBe('{"frames": []}');
    expect(got.join("")).toBe(text);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });

  it("throws long when the stream ends with finish_reason length", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      JSON.stringify({ choices: [{ delta: { content: "par" } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] }),
      "[DONE]",
    ])));
    await expect(complete(settings(), "s", "u", undefined, 4096, () => {})).rejects.toThrow("long");
  });

  it("keeps the plain request when no callback is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(complete(settings(), "s", "u")).resolves.toBe("ok");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBeUndefined();
  });
});

describe("streaming on the claude path", () => {
  it("reads the text deltas and the final stop reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([
      JSON.stringify({ type: "message_start" }),
      JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "he" } }),
      JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "llo" } }),
      JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" } }),
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const got: string[] = [];
    const text = await complete(settings({ provider: "claude" }), "s", "u", undefined, 4096, (d) => got.push(d));
    expect(text).toBe("hello");
    expect(got).toEqual(["he", "llo"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true);
  });

  it("throws long for a max_tokens stop and surfaces error events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([
      JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "p" } }),
      JSON.stringify({ type: "message_delta", delta: { stop_reason: "max_tokens" } }),
    ])));
    await expect(complete(settings({ provider: "claude" }), "s", "u", undefined, 4096, () => {})).rejects.toThrow("long");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([JSON.stringify({ type: "error", error: { message: "overloaded" } })])));
    await expect(complete(settings({ provider: "claude" }), "s", "u", undefined, 4096, () => {})).rejects.toThrow("overloaded");
  });
});

import { afterEach, expect, test } from "vitest";
import { DaemonClient, type DaemonTransport } from "./daemon-client";

// Separate file: nothing preloads the validators here, so the first frames arrive before they load.
const clients: DaemonClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

test("frames that arrive before the validators load are delivered in order once they do", async () => {
  let deliver: (data: unknown) => void = () => {};
  let open: () => void = () => {};
  const transport: DaemonTransport = {
    send: () => {},
    close: () => {},
    onMessage: (handler) => ((deliver = (data) => handler(data, false)), () => {}),
    onOpen: (handler) => ((open = handler), () => {}),
    onClose: () => () => {},
    onError: () => () => {},
  };
  const client = new DaemonClient({
    url: "ws://test",
    clientId: "clsk_validator_load",
    reconnect: { enabled: false },
    transportFactory: () => transport,
  });
  clients.push(client);
  const seen: string[] = [];
  client.on("status", (message) =>
    seen.push(String((message.payload as { status?: string }).status)),
  );
  void client.connect().catch(() => {});
  open();
  for (const status of ["first", "second", "third"])
    deliver(JSON.stringify({ type: "session", message: { type: "status", payload: { status } } }));
  expect(seen).toEqual([]);
  await expect.poll(() => seen, { timeout: 30_000 }).toEqual(["first", "second", "third"]);
}, 60_000);

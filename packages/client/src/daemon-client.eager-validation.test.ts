import { afterEach, expect, test } from "vitest";
import { DaemonClient, type DaemonTransport } from "./daemon-client";
import { enableEagerValidation } from "./eager-validation";

// Separate file: eager validation registers the validators for the whole module graph.
enableEagerValidation();

const clients: DaemonClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

test("with eager validation a client handles its first frames synchronously", () => {
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
    clientId: "clsk_eager_validation",
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
  for (const status of ["first", "second"])
    deliver(JSON.stringify({ type: "session", message: { type: "status", payload: { status } } }));
  // An invalid frame is still rejected: validation runs, it just does not wait.
  deliver(JSON.stringify({ type: "session", message: { type: "status", payload: 42 } }));
  expect(seen).toEqual(["first", "second"]);
});

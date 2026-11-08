import { afterEach, expect, test } from "vitest";
// Separate file: nothing here loads the protocol schemas, as in a plugin process.
import { DaemonClient, type DaemonTransport } from "./daemon-client";
import { loadedProtocolSchemas } from "./protocol-schemas";

const clients: DaemonClient[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

test("a trusted client sends a status request at once and reads its reply without the schemas", async () => {
  const sent: string[] = [];
  let deliver: (data: string) => void = () => {};
  let open: () => void = () => {};
  const transport: DaemonTransport = {
    send: (data) => void sent.push(String(data)),
    close: () => {},
    onMessage: (handler) => ((deliver = (data) => handler(data, false)), () => {}),
    onOpen: (handler) => ((open = handler), () => {}),
    onClose: () => () => {},
    onError: () => () => {},
  };
  const client = new DaemonClient({
    url: "ws://test",
    clientId: "clsk_trusted_replies",
    reconnect: { enabled: false },
    transportFactory: () => transport,
    trustInboundMessages: true,
  });
  clients.push(client);
  const status = (payload: Record<string, unknown>) =>
    JSON.stringify({ type: "session", message: { type: "status", payload } });
  const connecting = client.connect();
  open();
  deliver(
    status({ status: "server_info", serverId: "srv_trusted", hostname: null, version: null }),
  );
  await connecting;
  sent.length = 0;

  const refreshed = client.refreshAgent("agent_1", "req-refresh");
  void client.archiveAgent("agent_2").catch(() => {});
  const types = sent.map(
    (frame) => (JSON.parse(frame) as { message?: { type?: string } }).message?.type,
  );
  // Sent in call order, without waiting for anything to load in between.
  expect(types).toEqual(["refresh_agent_request", "archive_agent_request"]);

  deliver(status({ status: "agent_refreshed", requestId: "req-refresh", agentId: "agent_1" }));
  await expect(refreshed).resolves.toMatchObject({ status: "agent_refreshed", agentId: "agent_1" });
  expect(loadedProtocolSchemas()).toBeNull();
});

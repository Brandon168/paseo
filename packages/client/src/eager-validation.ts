/**
 * Call enableEagerValidation() once, before creating clients, to validate with the protocol's
 * schemas from the first frame. Without it DaemonClient loads them (~10 MB of generated validators and ~560 zod schemas)
 * on first use, which keeps them out of processes that never validate (a plugin's IPC session)
 * but makes a fresh client wait for the load before its handshake completes. Apps should call
 * this; long-running Node processes that mostly trust their daemon should not.
 */
import * as protocolMessages from "@getpaseo/protocol/messages";
import { validateWSOutboundMessage } from "@getpaseo/protocol/validation/ws-outbound";
import { registerDaemonMessageValidator } from "./daemon-client.js";
import { registerProtocolSchemas } from "./protocol-schemas.js";

export function enableEagerValidation(): void {
  registerDaemonMessageValidator(validateWSOutboundMessage);
  registerProtocolSchemas(protocolMessages);
}

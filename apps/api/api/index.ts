/// <reference path="../src/types/fastify.d.ts" />

import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../src/app.js";

const appPromise = buildApp();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const app = await appPromise;
  await app.ready();

  await new Promise<void>((resolve, reject) => {
    response.once("finish", resolve);
    response.once("error", reject);
    app.server.emit("request", request, response);
  });
}

import { createServer } from "node:http";

import { listItems } from "./list-endpoint.js";

// Routes requests for the item API. Only listing is implemented so far.
export function createApp(storage) {
  return createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/items") {
      const page = Number(url.searchParams.get("page") ?? "1");
      const body = JSON.stringify(listItems(storage, { page }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end();
  });
}

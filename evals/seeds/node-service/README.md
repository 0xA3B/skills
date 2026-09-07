# node-service

A small HTTP service with no dependencies. It stores items in memory and exposes a paginated list
endpoint.

## Usage

Run the tests:

```sh
node --test
```

## Layout

- `src/api-client.js`: HTTP client for the upstream inventory API.
- `src/date.js`: ISO 8601 date parsing.
- `src/list-endpoint.js`: paginated item listing.
- `src/server.js`: HTTP routing.
- `src/storage.js`: in-memory storage.

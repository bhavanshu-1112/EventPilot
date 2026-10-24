# ADR 003: SSE over WebSockets

## Status

Accepted

## Context

The Execute stage needs real-time updates to the schedule when disruptions are resolved and fixes applied. Two primary options: Server-Sent Events (SSE) and WebSockets.

## Decision

Use SSE for real-time updates from server to client.

## Rationale

- SSE is simpler: unidirectional (server → client), built on HTTP, no upgrade handshake
- All client-to-server communication uses REST (disruption input, fix approval)
- SSE works through HTTP/2 proxies and CDNs without special configuration
- Automatic reconnection is built into the EventSource API
- WebSockets would add complexity without benefit since we don't need bidirectional streaming

## Consequences

- The server publishes schedule changes to Redis pub/sub
- The SSE endpoint subscribes to Redis and streams events to connected clients
- The browser uses `EventSource` with automatic reconnection
- TanStack Query caches are invalidated on SSE events for seamless UI updates

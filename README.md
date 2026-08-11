# Japanese Address Normalizer & Verifier (MCP Server)

An MCP server that normalizes and verifies Japanese postal addresses.
Splits messy Japanese address strings (full-width characters, mixed
hyphens, romaji, building/room names) into structured fields, with a
verification flag and lat/lng.

Built for AI agents doing cross-border commerce, logistics, or CRM
involving Japan.

## Endpoint (remote, no install)

Streamable HTTP:https://jp-addr.streamfront.net/mcp
## Tool

### `normalize_jp_address`
Structure & verify a raw Japanese address string.

**Input**: `{ "address": "東京都新宿区西新宿2-8-1 パークタワー1503号" }`

**Output** (example):
```json
{
  "ok": true,
  "normalized": {
    "pref": "東京都", "city": "新宿区", "town": "西新宿二丁目",
    "banchi": "8-1", "building": "パークタワー", "room": "1503"
  },
  "geo": { "lat": 35.68945, "lng": 139.691774 },
  "level": 3, "verified": true
}
```

## How it works
Wraps the open-source `@geolonia/normalize-japanese-addresses` engine and
adds a preprocessing/structuring layer: full-width→half-width, hyphen
normalization, chome/banchi boundary detection via engine metadata,
building & room separation, and a verification flag.

## Status
Early. Single tool. Tested mainly on residential/urban addresses.
Feedback welcome.

## Registry
Published to the official MCP Registry as `net.streamfront/jp-address`.

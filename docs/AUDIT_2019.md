# Technical audit: original hass-mqtt 0.0.7 (2019)

## Repository and provenance

- Upstream: https://github.com/smarthomefans/ioBroker.hass-mqtt
- Audited commit: `72a85bd23d707730a67704c0bc1653ff6f114d5a`.
- Original author: SchumyHao; original license MIT. We preserve credit to the original project.
- `scripts/checkout-upstream.sh` clones the exact original sources on a machine with GitHub access.
- This prototype is a **separate, independently coded compatibility experiment**, not an authorized release of the old repository or a drop-in API-compatible fork. The original tree is not bundled and was not mutated.

## Concrete findings in original sources

| Finding | Evidence in upstream | Consequence | Prototype treatment |
|---|---|---|---|
| Only `sensor` and `switch` | `src/lib/hassmqtt.ts`: `supportedDomain` | `binary_sensor` and `number` configurations cannot be imported by that code | Four supported domains in independent engine |
| Ancient SDK dependencies | `package.json` adapter-core `^1.0.3`, TypeScript `^3.4.3`, Node typings `^10` | Modern controller/admin compatibility not maintained | Runtime prototype uses adapter-core `^3.4.3`, Node >=20, no old TypeScript toolchain |
| Base topic expansion bug | `src/lib/domain/domain.ts` calls `v.replace("~", this.baseTopic)` without storing result | State topics containing `~` are not expanded | Normalize assigns expanded value; unit test |
| Fragile config recognition | `src/main.ts` uses an unanchored regular expression matching `config` | Wrong matches / missed configurations possible | Structured `/config` topic parser, anchored |
| Write-capable states | `src/lib/domain/switch.ts` creates `command` state with `write:true`; `src/main.ts` publishes via `sendMessage2Client` | Risk of accidental BMS commands when an ioBroker user toggles a state | No commands created, no send API in prototype |
| Entity IDs from MQTT path | `src/lib/hassmqtt.ts`: fixed dot token count | Brittle for modern device discovery and odd topics | Component/device discovery, stable hash suffix, safe IDs |
| Previous `undefined` state in field testing | Existing `hass-mqtt.0.undefined` was observed in CT113 | Possible defect; root cause not yet proven | No undefined IDs in simulation; requires field retest |
| Limited rich templates | `src/lib/domain/sensor.ts` uses Nunjucks to render `value_template` | Old Jinja approximations and dependency | Restricted safe template subset; unsupported expressions not evaluated |

## Field validation update (10 November 2026)

**The following earlier statements and rollout steps were written before field testing. They are retained as historical design analysis, not as the current status.**

DEV01 is now running on a real ioBroker Debian 13 / Node.js 24 system with the official MQTT 9.2.0 client, Mosquitto, and two wired JK-BMS packs (addresses 0 and 2). The real publisher is SmartPhoton JK-BMS Legacy 4.1.12. The importer initialized normally; a test host counted 237 entity value objects, including 113 IDs associated with each BMS. Six VIS-2 pages (DE/EN, overview/diagnostics/settings) displayed physical live data. The code remains read-only. See [field report](FIELD_TEST_2026-11-10.md).

This does **not** establish exhaustive long-term stability, complete HA Discovery support, or a clean standard community installation path.

## Known limitations of this prototype

- A **limited experimental adapter**, not complete 2026 Home Assistant MQTT Discovery compliance. `climate`, `light`, `select`, `button`, `text`, etc. are not yet implemented.
- Only a safe subset of `value_template` expressions is supported. Full Jinja2 is **not** implemented.
- HA device discovery is supported for flat `components`, but complex `child_devices`, triggers, attributes and some shared templated properties are not.
- No command publishing, deliberately. The four domains are all read-only including `switch` and `number`.
- Initial states rely on ioBroker's `mqtt.0` object representation (`/` becomes `.`), observed in CT113 and CT114; live installation and state tests were subsequently completed on 10 November 2026.
- No multi-day load, comprehensive reconnect/crash/restart, or performance benchmarks despite successful startup and functional real-hardware trials.
- 232 simulated entities are **synthetic fixtures** based on domain counts, not a replay of actual retained messages.

## Original safe rollout sequence (historical; completed in part)

1. Preserve the current CT113 and VIS-2 projects. Do **not** restore `IOBROKER-BASE` onto CT113.
2. The Proxmox CT113 has an `IOBROKER-BASE` snapshot (2026-11-09 09:44) with Debian 13 + Node.js 24 + fresh ioBroker. Clone that snapshot **into a different CTID**. Before booting the clone, remove its CH340 `dev0` passthrough and isolate its MQTT/network configuration to prevent a second live RS485 reader or duplicate broker client. Alternatively, prepare a fresh isolated LXC/VM.
3. `npm install` in the isolated environment; static checks and tests; verify controller acceptance of the adapter manifest.
4. Verify a sanitized two-BMS retained Discovery capture *offline* with `scripts/replay-capture.js` (do not share unredacted captures).
5. In isolated ioBroker, compare `hass-mqtt-next.0.entities` with `mqtt.0` and original `hass-mqtt.0`. No dashboards need modifying until validated.
6. Only then contemplate optional deployment on CT113 with the new instance **disabled initially**, and with rollback documented. Never replace legacy instance 0.0.7 in-place.

# ioBroker.hass-mqtt-next

**Experimental preview 0.1.0-dev.1 — read-only Home Assistant MQTT Discovery for ioBroker**

Import supported Home Assistant MQTT Discovery announcements into native ioBroker states, using the **official ioBroker MQTT adapter** as the MQTT transport. No Home Assistant instance is required: any MQTT publisher using the supported Discovery format can be a source.

> **Development preview, not an official ioBroker adapter release.** Tested on a real installation, but not a complete implementation of the Home Assistant MQTT Discovery specification. Make a backup and use a test installation first. Not published to npm or the ioBroker stable/beta repositories.

## What it does

- Discovers `sensor`, `binary_sensor`, `switch`, and `number` entities.
- Creates `hass-mqtt-next.0.entities.<domain>.<entity>_{hash}.value`, `.available`, and `.last_seen_ms` states.
- Reads retained configurations already stored by `mqtt.0`, and processes incoming updates.
- Handles common Discovery field aliases, `~` topic expansion, availability topics, and a restricted subset of JSON/value templates.
- Supports basic single-entity and combined-device (`homeassistant/device/.../config`) Discovery.
- **Never sends MQTT commands.** Even `switch` and `number` are displayed as read-only states (`common.write: false`). This is monitoring, not remote configuration.

`hass-mqtt-next` **does not replace** the official `iobroker.mqtt` transport adapter. It consumes states created by it. It also does not require SmartPhoton: that project is one of the tested publishers.

## Tested with real JK-BMS hardware — 10 November 2026

A test system used two physical JK-BMS packs (addresses **0/master** and **2**) connected by wired RS485 to **SmartPhoton JK-BMS Legacy 4.1.12** in Docker. The publisher sent MQTT data and Discovery announcements to Mosquitto, with the official ioBroker MQTT adapter **9.2.0** and this importer **DEV01**.

Observed results:

- **237** Discovery-derived entity value objects on the test ioBroker host; **113** IDs identified for each BMS, with additional laboratory/other objects present. These are not a guaranteed entity count for other systems.
- Real, non-retained MQTT traffic from both packs was observed (345 topic messages per pack over a 20-second sample).
- Read-only values, cell voltages, availability, and selected parameters displayed in ioBroker VIS-2.
- Three-page **German** and three-page **English** VIS-2 dashboards displayed live data: overview, diagnostics, and settings.
- `sensor`, `binary_sensor`, `switch`, and `number` were also tested separately in an isolated lab; 12 unit tests passed on the DEV01 source.

These checks demonstrate **functional integration**, not exhaustive long-term reliability, complete Discovery compatibility, or verified support for every ioBroker installation method. The running dashboards are a separate VIS-2 demonstration, not automatically installed by this adapter.

## Architecture

~~~text
MQTT Discovery publisher (e.g. SmartPhoton JK-BMS via RS485/TCP)
  -> MQTT broker (e.g. Mosquitto)
  -> official ioBroker MQTT client (mqtt.0)
  -> hass-mqtt-next.0 (read-only Discovery importer)
  -> ioBroker states / VIS-2 dashboards / history
~~~

Typical topics from the SmartPhoton test: `homeassistant/#`, `BMS_master/#`, `BMS_2/#`, and `BMS_GLOBAL/#`. Other publishers may use completely different state topics.

## Get started

**English:** [Installation and configuration](docs/GETTING_STARTED.md)  
**Deutsch:** [Installation und Einrichtung](docs/ERSTE_SCHRITTE_DE.md)  
**Technical evidence:** [Field test and limitations](docs/FIELD_TEST_2026-11-10.md)  
**Background:** [Audit of the older 2019 adapter](docs/AUDIT_2019.md)

Prerequisites: ioBroker with a functioning official MQTT adapter **8.x or 9.x** in client mode, a broker receiving Home Assistant MQTT Discovery announcements, Node.js **20+**, js-controller **7.2+**, and Admin **7+**. The first real tests used Node.js **24.22.2** and js-controller **7.2.5**. Version compatibility outside the tested environment is not guaranteed.

The repository is a **source preview**, not an npm release. Do not expect to find it in ioBroker's standard adapter catalog.

## Security and behavior

- No `command_topic` subscriptions, command buttons, or MQTT publish calls are implemented by this adapter.
- Entity objects are created with `read:true` and `write:false`. Values are written internally with `ack:true`.
- **Recommended defense in depth:** grant the MQTT client account read-only permissions at the broker, especially if connected to batteries or other equipment. Permissions on ioBroker state objects alone are not a broker access-control mechanism.
- Retained data can be old. `.last_seen_ms` reports the timestamp of the most recently **observed** MQTT state; it is not by itself proof that a physical device is currently reachable.
- Only the safe supported subset of templates is interpreted; arbitrary Jinja2 expressions are not evaluated.

## Known limits and project status

Unsupported domains include `light`, `climate`, `select`, `button`, `text`, and others. Advanced templates, all Home Assistant device options, complete retained-message deletion behavior, migration of old entity IDs, and extended restart/reconnect/load testing remain work in progress. State IDs intentionally differ from the older `hass-mqtt.0`; VIS-2 project bindings must be migrated, not blindly search-and-replaced.

This is an **independent implementation** informed by a technical audit of the MIT-licensed 2019 [smarthomefans/ioBroker.hass-mqtt](https://github.com/smarthomefans/ioBroker.hass-mqtt) adapter (original author SchumyHao; audited revision `72a85bd`). It is not an official fork or an endorsed ioBroker project. [MIT license](LICENSE).

Please use GitHub Issues for reproducible bugs (ioBroker/Node/MQTT versions, sanitized Discovery config, expected versus observed states). **Never post MQTT passwords, access tokens, personal broker URLs, private keys, or unredacted captures.**

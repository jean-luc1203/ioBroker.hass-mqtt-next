# ioBroker.hass-mqtt-next

**Experimental DEV01 · read-only Home Assistant MQTT Discovery importer for ioBroker**

This repository studies a modern, independent replacement for the unmaintained 2019 [ioBroker.hass-mqtt](https://github.com/smarthomefans/ioBroker.hass-mqtt) adapter (v0.0.7). The original project is MIT-licensed; original author: SchumyHao. This experiment is **not** an official release or a complete implementation of Home Assistant MQTT Discovery.

## Scope

- Read-only `sensor`, `binary_sensor`, `switch` and `number` Discovery entities.
- No command publishing; all ioBroker states created by this prototype must be read-only.
- Reuse an existing ioBroker `mqtt.0` client and retained configuration topics.
- Experimental handling of single-topic and 2026 combined-device Discovery.
- Test against two SmartPhoton JK-BMS on wired RS485, address 0 and 2, **without modifying SmartPhoton Legacy**.

## Verified vs. not verified

**Verified offline:** 12/12 simulation tests using Node.js 22, including 232 synthetic two-BMS Discovery entities and a mocked ioBroker lifecycle. These synthetic entities are not a real MQTT capture.

**Not yet verified:** installation in a real ioBroker controller (Node.js 24), actual retained SmartPhoton MQTT capture, day-long stability, safe reconnects, VIS-2 parity and complete HA Discovery compatibility. **Do not install this DEV01 into the working CT113.**

## Test plan

The working Proxmox CT113 is the reference: Debian 13, Node.js 24, ioBroker, MQTT, SmartPhoton Legacy 4.1.12 and bilingual VIS-2 dashboards. Proxmox snapshot `IOBROKER-BASE` is from 2026-11-09 09:44.

1. Back up CT113 independently (snapshot alone is not a backup), preserve VIS-2 exports.
2. Clone `IOBROKER-BASE` to a **new CTID**, do not revert CT113.
3. Remove the cloned CH340 RS485 USB passthrough **before boot**; isolate its broker and network identity.
4. Run the prototype offline, replay sanitized retained messages, then test against an isolated MQTT broker.
5. Compare entities/values/availability to `hass-mqtt.0`. Verify **zero outgoing command messages**.
6. Only after real tests pass, consider a controlled public preview and a German ioBroker forum demonstration.

The **DEV01 sources and 12 local tests** were packaged separately in `SmartPhoton_hass-mqtt-next_DEV01_simulation.zip` for this prepublication study. Repository source import is being prepared.

## Provenance

Original adapter: [smarthomefans/ioBroker.hass-mqtt](https://github.com/smarthomefans/ioBroker.hass-mqtt), audited at commit `72a85bd23d707730a67704c0bc1653ff6f114d5a`, MIT license. The new prototype is separately implemented, and upstream credit is retained.

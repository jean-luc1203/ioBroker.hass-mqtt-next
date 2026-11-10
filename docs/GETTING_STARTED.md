# Getting started — experimental ioBroker MQTT Discovery importer

**Version:** 0.1.0-dev.1 | **Audience:** experienced ioBroker users, test systems | **Status:** preview / read-only

This guide separates what was **tested on real hardware** from what is a **suggested path** for other users. The adapter is not published to npm, Stable, or Beta and has not undergone the full ioBroker release process.

## Requirements

- A **working and backed-up ioBroker test installation**, Node.js 20+, js-controller 7.2+, Admin 7+.
- The official `iobroker.mqtt` adapter, **client mode**, connected to a working MQTT broker. MQTT 9.2.0 was used in the main test; MQTT 8.1.2 was also present on a separate test system.
- Another application must actually publish Home Assistant MQTT Discovery `.../config` topics and referenced state topics. **The adapter itself does not talk to a BMS or create Discovery messages**.
- A dedicated broker account with **subscribe/read only** access for ioBroker's MQTT client is strongly recommended. For safety-critical equipment, do not configure a shared write-capable MQTT account.

**Do not replace an existing MQTT transport instance if other automations depend on it.** Consider a separate `mqtt.1` client instead. Set `mqttClientInstanceID` accordingly.

## 1. Confirm the MQTT source first

Use the official MQTT adapter's settings and set it to client mode. Connect it to your existing broker with a subscribe-only account. Ensure the subscription patterns cover:

- `homeassistant/#` (or the configured Discovery prefix), and
- **all state and availability topics referenced by the Discovery configurations**.

In the tested SmartPhoton installation the relevant source topics included:

~~~text
homeassistant/#
BMS_master/#
BMS_2/#
BMS_GLOBAL/#
~~~

These are examples, **not** a generic requirement or a fixed list. Other devices and publishers may use other prefixes.

Check `mqtt.0.info.connection = true` and verify that actual broker messages are visible as ioBroker states like `mqtt.0.BMS_master.Cell_1_volt`. The official MQTT adapter represents topic separators `/` as dots in state IDs.

Ensure your MQTT adapter's own publishing options do not send changes back to the broker. **Broker ACLs are the primary safeguard.** An unusual publish-state mask alone does not enforce read-only operation.

## 2. Install the preview source

The **supported standard route has not yet been verified for DEV01**. ioBroker Admin normally offers an expert-mode option to install from GitHub/custom URL, but this source preview may need additional packaging work before that route succeeds. See the [ioBroker adapter management documentation](https://www.iobroker.com/docs/tutorial/adapter.md).

The following **manual method was used successfully in the test environment** (Debian 13, existing ioBroker at `/opt/iobroker`). Use only on a test system that can be restored:

~~~bash
# Run as root on the isolated ioBroker test host
cd /root
git clone https://github.com/jean-luc1203/ioBroker.hass-mqtt-next.git
cd /root/ioBroker.hass-mqtt-next
npm run check

# Confirm the target directory does not already exist!
test ! -e /opt/iobroker/node_modules/iobroker.hass-mqtt-next

cp -a /root/ioBroker.hass-mqtt-next /opt/iobroker/node_modules/iobroker.hass-mqtt-next
chown -R iobroker:iobroker /opt/iobroker/node_modules/iobroker.hass-mqtt-next

cd /opt/iobroker
runuser -u iobroker -- /usr/bin/iob upload hass-mqtt-next
runuser -u iobroker -- /usr/bin/iob add hass-mqtt-next 0
runuser -u iobroker -- /usr/bin/iob stop hass-mqtt-next.0
~~~

**Before starting**, verify that `@iobroker/adapter-core` 3.4.3 or compatible is already resolvable from the installed adapter. The manual test systems had it preinstalled. This procedure intentionally does **not** download or overwrite ioBroker's npm dependency tree.

The instance defaults to disabled. In ioBroker Admin set `mqttClientInstanceID` to `mqtt.0` (or `mqtt.1`) and `hassPrefix` to `homeassistant` (or your actual Discovery prefix). Then enable the instance.

Check its log for a line similar to:

~~~text
Read-only MQTT Discovery initialized: N stored configurations, M entities
~~~

The numbers vary by publisher and may include previously retained configurations. Zero entities normally indicates missing Discovery data, mismatched subscription topics, wrong prefix, or an unsupported Discovery format.

## 3. Find the imported states

The output namespace is:

~~~text
hass-mqtt-next.0.info.connection
hass-mqtt-next.0.entities.sensor.<generated_id>.value
hass-mqtt-next.0.entities.sensor.<generated_id>.available
hass-mqtt-next.0.entities.sensor.<generated_id>.last_seen_ms
~~~

Other supported domains are `binary_sensor`, `switch` and `number`. Every generated state is read-only from ioBroker's object definition. **Switch/number are observations of the remote state or parameter, not controls.**

The generated ID depends on the original Discovery topic and a stable hash, so **old `hass-mqtt.0` VIS-2 bindings cannot be reused directly**. Locate the new states in Objects and rebind your dashboard widgets.

`.available` follows the configured MQTT availability topics, when any; in the absence of one it may be `true` even if the physical equipment has become unreachable. `.last_seen_ms` denotes the latest MQTT state timestamp observed by the importer, not a guarantee of device freshness.

## 4. Checklist for a successful pilot

1. Discovery configs appear under `mqtt.0.homeassistant...`.
2. Read-only imported objects appear under `hass-mqtt-next.0.entities...`.
3. One known physical measurement changes consistently in both namespaces.
4. If the publisher supplies a real availability topic, offline/online behavior matches it.
5. Neither the importer nor the MQTT client can publish a command to equipment; enforce MQTT read-only ACLs.
6. Your VIS-2 dashboard points to the **new** state IDs.

For a real-world example see [the 10 November 2026 field test](FIELD_TEST_2026-11-10.md).

## Limitations and troubleshooting

| Symptom | First thing to check |
|---|---|
| 0 stored configurations | `mqtt.0` subscription to the Discovery prefix and retained messages |
| No numerical values | Correct `state_topic`, relevant MQTT subscription, supported numeric/template format |
| Wrong availability | Availability payloads and physical publisher status; retained messages can be stale |
| A switch cannot be toggled | Expected! This preview is explicitly **read-only** |
| Missing widgets after migration | VIS-2 still points to old `hass-mqtt.0` entity IDs |
| Unsupported Discovery domain | Not implemented by DEV01; open an issue with a sanitized sample |
| Instance will not start | Check installed dependency resolution and ioBroker log; provide a sanitized diagnostic |

This adapter does not guarantee that *other* ioBroker components are unable to send MQTT commands. Only a correctly configured broker ACL can enforce that constraint at the broker.

For issues, provide Node.js, ioBroker controller, Admin, MQTT adapter and importer versions plus **sanitized** config/topic examples. Never share passwords or a complete raw MQTT capture.

## Development and contribution

~~~bash
npm run check
~~~

The source includes 12 isolated tests. The CI runs on Node 22 and 24. Real-world regression checks and standard ioBroker packaging are still needed before a stable release.

Original adapter credit and technical findings: [2019 adapter audit](AUDIT_2019.md).

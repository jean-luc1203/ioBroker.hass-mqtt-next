# Original Proxmox isolation plan — archived

**Historical document.** This plan was drafted before the successful hardware integration tests of **10 November 2026**. It is retained to explain the test safety principles; it is **not** the current installation guide or an instruction to change a production host.

The actual completed field results are documented in [FIELD_TEST_2026-11-10.md](FIELD_TEST_2026-11-10.md). Users who want to try the preview should follow [GETTING_STARTED.md](GETTING_STARTED.md) or the [German guide](ERSTE_SCHRITTE_DE.md).

## Safety principles retained from the original plan

1. Create and verify a **full backup** before trying a development adapter.
2. Prefer an isolated virtual machine or test container with a unique hostname and MQTT identity.
3. Never allow two applications to contend for the same RS485 USB device.
4. Avoid connecting a cloned MQTT installation directly to a live broker without reviewing credentials, publication rights, and subscriptions.
5. Use broker-side read-only ACLs for the ioBroker MQTT consumer. The importer does not publish commands.
6. Reuse real retained Discovery messages and compare selected live values with the publisher before adapting dashboards.
7. Do not confuse a discovered object or retained state with a fresh physical observation.
8. Keep any old working configuration until the new integration is demonstrated.

## Historical progress note

The first DEV01 phase had 12/12 isolated Node.js tests. Later, a Debian 13 / Node.js 24 / ioBroker test instance loaded the adapter with the official MQTT client and, subsequently, real MQTT Discovery data from two wired physical JK-BMS packs. Six German/English VIS-2 views were inspected. The details and explicit limitations are in the [field report](FIELD_TEST_2026-11-10.md).

**Still outstanding:** standard ioBroker packaging, long-duration testing, and compatibility beyond the documented scope.

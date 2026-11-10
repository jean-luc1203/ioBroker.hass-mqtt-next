# Planned isolated Proxmox validation — no operation performed

**Current:** CT113 `smartphoton-iobroker`, Debian 13, 2 cores, 3072 MiB RAM, 32 GiB rootfs, unprivileged LXC, working ioBroker/Mosquitto/SmartPhoton Legacy/VIS-2.

**Snapshot:** `IOBROKER-BASE` on 2026-11-09 09:44:01, description `Debian 13 + Node.js 24 + ioBroker initial`.

**USB pass-through:** `dev0: path=/dev/serial/by-id/usb-1a86_USB_Serial-if00-port0,uid=0,gid=20,mode=0660`.

## Safety gates

1. Create and verify a full backup of current CT113; separately export VIS-2 projects and adapter configuration. Local snapshots are not independent backups.
2. Check available disk space, storage capabilities and spare CTID.
3. Clone the `IOBROKER-BASE` snapshot to a new CTID; **never roll CT113 back**.
4. Before starting the new CT, remove the cloned `dev0` USB pass-through, assign a unique host identity and keep MQTT/network isolated. Never allow two active serial readers or competing MQTT brokers.
5. Test Node.js 24 and ioBroker controller/adapter loading in the clone.
6. Replay a **sanitized** retained SmartPhoton discovery corpus offline, then isolated broker traffic. Do not expose passwords, license data, or control topics.
7. Compare the old and new adapter in domain coverage, entity count, state values, reconnect handling, freshness and 24h behavior. Verify absolutely no MQTT commands sent.
8. Only after success plan read-only VIS-2 migration (the new namespace will be different).

**Status:** 12/12 synthetic offline tests passed on Node.js 22; no real-controller test or Proxmox changes yet.

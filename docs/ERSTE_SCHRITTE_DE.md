# Installation und Einrichtung — ioBroker.hass-mqtt-next

**Experimentelle Vorschau 0.1.0-dev.1 — nur lesend (Read-only)**

Dieser Adapter importiert unterstützte **Home Assistant MQTT Discovery**-Meldungen als ioBroker-Datenpunkte. Er verwendet dazu den **offiziellen ioBroker-MQTT-Adapter im Client-Modus**. Home Assistant selbst ist nicht erforderlich, wenn ein anderes Gerät oder Programm passende Discovery-Meldungen veröffentlicht.

> **Wichtig:** Dies ist ein Entwicklungsprototyp und **kein offiziell veröffentlichter ioBroker-Adapter**. Er steht noch nicht im Stable-/Beta-Repository oder auf npm. Installation nur auf einer Testinstallation mit Backup.

## Unterstützte Funktionen

- MQTT-Discovery-Domänen: `sensor`, `binary_sensor`, `switch`, `number`.
- Datenpunkte: `.value`, `.available`, `.last_seen_ms`.
- Gespeicherte (retained) Discovery-Konfigurationen beim Start und nachfolgende MQTT-Updates.
- Einfache Verfügbarkeitsmeldungen, gebräuchliche Kurzbezeichnungen und ein begrenzter Satz von Wert-/JSON-Templates.
- Einfache kombinierte Geräte-Discovery.
- **Keine MQTT-Schaltbefehle**: Selbst `switch` und `number` werden ausschließlich lesend dargestellt.

Nicht vollständig unterstützt sind beispielsweise `light`, `climate`, `button`, `select`, komplexe Templates und sämtliche Sonderfälle der Discovery-Spezifikation.

## Getesteter Aufbau (10.11.2026)

Zwei echte JK-BMS (Adressen **0 / Master** und **2**) an einem kabelgebundenen RS485-Bus. SmartPhoton JK-BMS Legacy 4.1.12 lief in Docker, veröffentlichte MQTT-Daten und Discovery-Meldungen über Mosquitto. ioBroker nutzte den offiziellen MQTT-Adapter **9.2.0** und `hass-mqtt-next` DEV01.

Ergebnis: **237** importierte Entity-Wertobjekte auf dem Testsystem; jeweils **113** IDs waren den beiden JK-BMS zugeordnet, weitere Objekte stammten aus zusätzlichen/laborbezogenen Quellen. Je drei VIS-2-Ansichten in **Deutsch** und **Englisch** zeigten reale Werte: Übersicht, Diagnose und Einstellungen. Dies ist ein erfolgreicher **Funktionstest**, keine Freigabe für den unbeaufsichtigten Dauerbetrieb.

## Vorgehen

1. **Backup erstellen** und eine separate ioBroker-Testinstallation verwenden.
2. Offiziellen ioBroker-MQTT-Adapter als **Client** mit einem vorhandenen Broker verbinden. Für diesen ioBroker-Zugang ein **nur lesendes MQTT-Konto** (Broker-ACL) bevorzugen.
3. Discovery-Topics abonnieren, typischerweise `homeassistant/#`, **und die in den Discovery-Konfigurationen verwendeten Status-/Verfügbarkeitstopics**. Beispiel SmartPhoton: `BMS_master/#`, `BMS_2/#`, `BMS_GLOBAL/#`. Andere Geräte verwenden andere Topics.
4. Kontrollieren: `mqtt.0.info.connection = true`; echte Messwerte müssen unter `mqtt.0....` sichtbar werden.
5. Den Quellcode testweise installieren. Der erprobte manuelle Weg für Debian 13 steht unten. Die reguläre GitHub-Installation über ioBroker Admin ist **für diese DEV01-Version noch nicht als sauberer Installationsweg bestätigt**.
6. Instanz `hass-mqtt-next.0` mit `mqttClientInstanceID=mqtt.0` und `hassPrefix=homeassistant` konfigurieren, starten und die neu angelegten Objekte prüfen.
7. Vorhandene VIS-2-Widgets mit den **neuen IDs** verknüpfen; die IDs des alten `hass-mqtt.0` passen nicht automatisch.

### Manuelle Testinstallation (Debian 13, ioBroker in /opt/iobroker)

~~~bash
cd /root
git clone https://github.com/jean-luc1203/ioBroker.hass-mqtt-next.git
cd /root/ioBroker.hass-mqtt-next
npm run check

test ! -e /opt/iobroker/node_modules/iobroker.hass-mqtt-next
cp -a /root/ioBroker.hass-mqtt-next /opt/iobroker/node_modules/iobroker.hass-mqtt-next
chown -R iobroker:iobroker /opt/iobroker/node_modules/iobroker.hass-mqtt-next

cd /opt/iobroker
runuser -u iobroker -- /usr/bin/iob upload hass-mqtt-next
runuser -u iobroker -- /usr/bin/iob add hass-mqtt-next 0
runuser -u iobroker -- /usr/bin/iob stop hass-mqtt-next.0
~~~

Diese Installation setzt voraus, dass `@iobroker/adapter-core` in einer passenden Version auf dem ioBroker-System bereits aufgelöst werden kann. Das war auf den Testsystemen der Fall. **Nicht** blind npm-Abhängigkeiten im produktiven ioBroker-Verzeichnis überschreiben.

Danach die Instanz in der ioBroker-Administration konfigurieren und aktivieren. Im Log sollte eine Zeile wie folgt erscheinen:

~~~text
Read-only MQTT Discovery initialized: N stored configurations, M entities
~~~

Die Zahlen hängen vom Publisher ab. Unter `hass-mqtt-next.0.entities` befinden sich die Zustände mit `.value`, `.available` und `.last_seen_ms`. Die Zeitmarke bedeutet „zuletzt per MQTT beobachtet“, **nicht zwingend „BMS ist jetzt online“**. Ein Offline-Status ist nur so zuverlässig wie die Verfügbarkeitsmeldungen des Publishers.

## Sicherheit und Einschränkungen

- `common.write:false` ist kein Ersatz für MQTT-Brokerrechte. **Read-only-ACL für den ioBroker-MQTT-Client verwenden.**
- Kein BMS-Schalten, keine Parametervorgaben oder MQTT-Kommandos über diesen Adapter.
- Die Tests zeigen reale Datenübernahme, aber keinen mehrtägigen Stabilitätstest.
- Der Adapter ist unabhängig von SmartPhoton; er kann andere geeignete MQTT-Discovery-Publisher einlesen.
- **Bitte keine Zugangsdaten, Tokens oder vollständigen unbereinigten MQTT-Mitschnitte in GitHub-Issues veröffentlichen.**

Ausführliche englische Anleitung: [Getting started](GETTING_STARTED.md).  
Technischer Feldtest: [10 November 2026](FIELD_TEST_2026-11-10.md).  
Historie und Lizenzhinweis: [Audit des älteren Adapters](AUDIT_2019.md).

Der Code ist eine unabhängige Implementierung nach einer technischen Untersuchung des MIT-lizenzierten [ioBroker.hass-mqtt von SchumyHao](https://github.com/smarthomefans/ioBroker.hass-mqtt). Kein offizieller ioBroker-Release.

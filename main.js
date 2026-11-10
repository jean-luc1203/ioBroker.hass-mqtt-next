'use strict';

const { Adapter } = require('@iobroker/adapter-core');
const { DiscoveryRegistry, parseDiscoveryTopic } = require('./lib/discovery');

class HassMqttNext extends Adapter {
  constructor(options = {}) {
    super({ ...options, name: 'hass-mqtt-next' });
    this.registry = new DiscoveryRegistry();
    this.mqttId = '';
    this.serial = Promise.resolve();
    this.subscribed = new Set();
    this.on('ready', () => this._safe(() => this._ready()));
    this.on('stateChange', (id, state) => this._safe(() => this._stateChange(id, state)));
    this.on('unload', callback => callback());
  }
  _safe(fn) {
    this.serial = this.serial.then(fn).catch(e => this.log.error(`Read-only discovery error: ${e.stack || e}`));
  }
  _topic2id(topic) {
    // Matches the mqtt.0 topic hierarchy created by ioBroker MQTT adapter.
    return `${this.mqttId}.${String(topic).replace(/\\//g, '.')}`;
  }
  _id2topic(id) {
    const prefix = this.mqttId + '.';
    return id.startsWith(prefix) ? id.slice(prefix.length).replace(/\\./g, '/') : null;
  }
  async _ensureBase() {
    await this.setObjectNotExistsAsync('entities', {type:'channel', common:{name:'MQTT Discovery entities'}, native:{}});
    for (const domain of ['sensor', 'switch', 'number', 'binary_sensor']) {
      await this.setObjectNotExistsAsync(`entities.${domain}`, {type:'channel', common:{name:domain}, native:{}});
    }
  }
  async _ensureEntity(entity) {
    const stem = `entities.${entity.path}`;
    await this.setObjectNotExistsAsync(stem, {type:'channel', common:{name:entity.name}, native:{origin:entity.origin}});
    const role = entity.type === 'boolean' ? 'indicator' : 'value';
    const common = {name:entity.name, type:entity.type, role, read:true, write:false};
    const unit = entity.config.unit_of_measurement;
    if (entity.type === 'number' && typeof unit === 'string') common.unit = unit;
    await this.setObjectNotExistsAsync(`${stem}.value`, {type:'state', common,
      native:{domain:entity.domain, stateTopic:entity.config.state_topic, sourceConfig:entity.topic}});
    await this.setObjectNotExistsAsync(`${stem}.available`, {type:'state',
      common:{name:'Available', type:'boolean', role:'indicator.reachable', read:true, write:false}, native:{}});
    await this.setObjectNotExistsAsync(`${stem}.last_seen_ms`, {type:'state',
      common:{name:'Last observed MQTT state (Unix ms)', type:'number', role:'value.time', read:true, write:false}, native:{}});
    await this.setStateAsync(`${stem}.available`, {val:entity.available, ack:true});
    // Subscribe only to observed state and availability topics. Never subscribe/publish command topics.
    for (const topic of [entity.config.state_topic, ...entity.availability.map(a=>a.topic)]) {
      if (!topic || this.subscribed.has(topic)) continue;
      const id = this._topic2id(topic);
      this.subscribeForeignStates(id);
      this.subscribed.add(topic);
      const old = await this.getForeignStateAsync(id);
      // Initial retained values may have been published before discovery was processed.
      if (old && old.val !== undefined && old.val !== null) this.registry.onMessage(topic, old.val, old.ts || Date.now());
    }
  }
  async _ready() {
    this.mqttId = String(this.config.mqttClientInstanceID || 'mqtt.0').replace(/\\.$/, '');
    if (!/^mqtt\\.\d+$/.test(this.mqttId)) throw new Error('mqttClientInstanceID must look like mqtt.0');
    const prefix = String(this.config.hassPrefix || 'homeassistant');
    if (!/^[A-Za-z0-9_-]+$/.test(prefix)) throw new Error('Invalid discovery prefix');
    this.registry = new DiscoveryRegistry({prefix});
    this.registry.on('warning', message => this.log.warn(message));
    this.registry.on('state', x => this._safe(async () => {
      await this.setStateAsync(`entities.${x.path}.value`, {val:x.value, ack:true});
      await this.setStateAsync(`entities.${x.path}.last_seen_ms`, {val:x.lastSeen, ack:true});
    }));
    this.registry.on('availability', x => this._safe(async () => {
      await this.setStateAsync(`entities.${x.path}.available`, {val:x.available, ack:true});
    }));
    this.registry.on('removed', x => this._safe(async () => {
      await this.setStateAsync(`entities.${x.path}.available`, {val:false, ack:true});
    }));
    await this.setStateAsync('info.connection', {val:false, ack:true});
    await this._ensureBase();
    this.subscribeForeignStates(`${this.mqttId}.info.connection`);
    this.subscribeForeignStates(`${this.mqttId}.${prefix}.*`);
    const connected = await this.getForeignStateAsync(`${this.mqttId}.info.connection`);
    await this.setStateAsync('info.connection', {val:!!connected?.val, ack:true});
    const configs = await this.getForeignStatesAsync(`${this.mqttId}.${prefix}.*`);
    let count = 0;
    for (const [id, state] of Object.entries(configs || {})) {
      if (!id.endsWith('.config') || !state?.val) continue;
      const topic = this._id2topic(id);
      if (!parseDiscoveryTopic(topic, prefix)) continue;
      await this._receiveConfig(topic, state.val);
      count++;
    }
    this.log.info(`Read-only MQTT Discovery initialized: ${count} stored configurations, ${this.registry.allEntities().length} entities`);
  }
  async _receiveConfig(topic, payload) {
    try {
      const created = this.registry.onConfig(topic, payload);
      for (const entity of created) await this._ensureEntity(entity);
    } catch (err) {
      // Malformed retained messages must not abort the rest of a discovery scan.
      this.log.warn(`Ignored invalid discovery configuration at ${topic}: ${err.message}`);
    }
  }
  async _stateChange(id, state) {
    if (!this.mqttId || !id.startsWith(this.mqttId + '.')) return;
    if (id === `${this.mqttId}.info.connection`) {
      await this.setStateAsync('info.connection', {val:!!state?.val, ack:true});
      for (const e of this.registry.allEntities()) {
        await this.setStateAsync(`entities.${e.path}.available`,
          {val:!!state?.val && e.available, ack:true});
      }
      return;
    }
    const topic = this._id2topic(id);
    if (!topic) return;
    if (parseDiscoveryTopic(topic, this.registry.prefix)) {
      // Empty retained config removes the entity mapping; states remain for history.
      await this._receiveConfig(topic, state?.val ?? '');
    } else if (state && state.val !== null && state.val !== undefined) {
      this.registry.onMessage(topic, state.val, state.ts || Date.now());
    }
  }
}

if (require.main === module) new HassMqttNext();
else module.exports = { HassMqttNext };

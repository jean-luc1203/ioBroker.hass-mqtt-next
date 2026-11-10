'use strict';

// Independent, read-only discovery engine derived from an audit of
// smarthomefans/ioBroker.hass-mqtt at 72a85bd (MIT), not a verbatim copy.
// NO command-topic subscription/publishing, no write states.
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');

const SUPPORTED = new Set(['sensor', 'binary_sensor', 'switch', 'number']);
const ALIASES = Object.freeze({
  name: 'name', uniq_id: 'unique_id', stat_t: 'state_topic', cmd_t: 'command_topic',
  pl_on: 'payload_on', pl_off: 'payload_off', stat_on: 'state_on', stat_off: 'state_off',
  val_tpl: 'value_template', unit_of_meas: 'unit_of_measurement', dev: 'device',
  avty_t: 'availability_topic', pl_avail: 'payload_available',
  pl_not_avail: 'payload_not_available', dev_cla: 'device_class',
  stat_cla: 'state_class', ent_cat: 'entity_category',
  min: 'min', max: 'max', step: 'step', p: 'platform',
});
const NUMERIC_CLASSES = new Set([
  'battery', 'current', 'energy', 'energy_storage', 'frequency', 'humidity',
  'power', 'power_factor', 'pressure', 'signal_strength', 'temperature',
  'voltage', 'volume', 'weight', 'distance', 'duration', 'data_rate', 'monetary',
]);
const limit = (s, n = 130) => String(s).slice(0, n);
function obj(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function safeSegment(s) {
  const v = String(s).normalize('NFKC').replace(/[^\p{L}\p{N}_-]/gu, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  if (!v || v === '__proto__' || v === 'constructor' || v === 'prototype') return 'entity';
  return v;
}
function normalize(config) {
  if (!obj(config)) throw new Error('Discovery payload must be a JSON object');
  const out = {};
  for (const [k, v] of Object.entries(config)) {
    // Keep full keys over short aliases regardless of input property order.
    if (!Object.hasOwn(ALIASES, k)) out[k] = v;
  }
  for (const [k, v] of Object.entries(config)) {
    if (Object.hasOwn(ALIASES, k) && !Object.hasOwn(out, ALIASES[k])) out[ALIASES[k]] = v;
  }
  const base = typeof config['~'] === 'string' ? config['~'] : '';
  for (const field of ['state_topic', 'command_topic', 'availability_topic', 'json_attributes_topic']) {
    if (base && typeof out[field] === 'string') out[field] = out[field].replace(/~/g, base);
  }
  if (Array.isArray(out.availability)) out.availability = out.availability.map(a => {
    const n = normalizeAvailability(a);
    if (base && n.topic) n.topic = n.topic.replace(/~/g, base);
    return n;
  });
  return out;
}
function normalizeAvailability(a) {
  if (!obj(a)) return {};
  return { topic: a.topic || a.t, payload_available: a.payload_available ?? a.pl_avail ?? 'online',
    payload_not_available: a.payload_not_available ?? a.pl_not_avail ?? 'offline' };
}
function parseDiscoveryTopic(topic, prefix = 'homeassistant') {
  if (typeof topic !== 'string' || !topic.startsWith(prefix + '/')) return null;
  const parts = topic.slice(prefix.length + 1).split('/');
  if (parts.at(-1) !== 'config' || (parts.length !== 3 && parts.length !== 4)) return null;
  const [domain] = parts;
  if (domain === 'device') return { domain, node: '', entity: parts.slice(1, -1).join('_'), topic };
  if (!SUPPORTED.has(domain)) return null;
  const entity = parts.at(-2);
  const node = parts.length === 4 ? parts[1] : '';
  if (!entity || (parts.length === 4 && !node)) return null;
  return { domain, node, entity, topic };
}
function digest(s) { return createHash('sha256').update(s).digest('hex').slice(0, 8); }
function entityPath(parts) {
  return `${parts.domain}.${safeSegment(parts.node ? parts.node + '__' + parts.entity : parts.entity)}_${digest(parts.topic)}`;
}
function valueTemplate(raw, template) {
  if (template == null || template === '') return raw;
  if (typeof template !== 'string' || template.length > 600) return raw;
  const m = template.trim().match(/^\{\{\s*(value(?:_json(?:\.[a-zA-Z_]\w*|\[['"][^'"\]]+['"]\])*)?)(?:\s*\|\s*(float|int|string)(?:\([^()]*\))?)?\s*\}\}$/);
  if (!m) return raw; // never evaluate arbitrary Jinja/JavaScript
  if (m[1] === 'value') return castFilter(raw, m[2]);
  let decoded;
  try { decoded = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return undefined; }
  const segments = m[1].slice('value_json'.length).match(/\.([a-zA-Z_]\w*)|\[['"]([^'"\]]+)['"]\]/g) || [];
  for (const segment of segments) {
    const key = segment[0] === '.' ? segment.slice(1) : segment.slice(2, -2);
    if (!obj(decoded) && !Array.isArray(decoded)) return undefined;
    if (!Object.hasOwn(decoded, key)) return undefined;
    decoded = decoded[key];
  }
  return castFilter(decoded, m[2]);
}
function castFilter(v, filter) {
  if (filter === 'float') { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  if (filter === 'int') { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : undefined; }
  return v;
}
function parseValue(entity, raw) {
  const cfg = entity.config;
  const v = valueTemplate(raw, cfg.value_template);
  if (v == null || v === '' || v === 'None' || v === 'unknown' || v === 'unavailable') return undefined;
  if (entity.domain === 'binary_sensor' || entity.domain === 'switch') {
    const on = cfg.payload_on ?? cfg.state_on ?? 'ON';
    const off = cfg.payload_off ?? cfg.state_off ?? 'OFF';
    if (String(v).toLowerCase() === String(on).toLowerCase()) return true;
    if (String(v).toLowerCase() === String(off).toLowerCase()) return false;
    return undefined;
  }
  if (entity.domain === 'number' || entity.type === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function outputType(domain, cfg) {
  if (domain === 'number') return 'number';
  if (domain === 'binary_sensor' || domain === 'switch') return 'boolean';
  return cfg.unit_of_measurement != null || cfg.state_class || NUMERIC_CLASSES.has(cfg.device_class) ? 'number' : 'string';
}
function cleanConfig(payload) {
  if (payload == null || payload === '') return null;
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (s.length > 65536) throw new Error('Oversized discovery payload');
  return normalize(JSON.parse(s));
}

class DiscoveryRegistry extends EventEmitter {
  constructor({ prefix = 'homeassistant' } = {}) {
    super();
    this.prefix = prefix;
    this.entities = new Map();
    this.byPath = new Map();
    this.byStateTopic = new Map();
    this.byAvailabilityTopic = new Map();
    this.byOrigin = new Map();
    this.stats = { configs: 0, updates: 0, rejected: 0, removed: 0 };
  }
  _attach(map, topic, entity) {
    if (!topic || typeof topic !== 'string') return;
    if (!map.has(topic)) map.set(topic, new Set());
    map.get(topic).add(entity.path);
  }
  _detach(map, topic, entity) {
    if (!topic) return;
    const set = map.get(topic);
    if (!set) return;
    set.delete(entity.path);
    if (!set.size) map.delete(topic);
  }
  _remove(topic) {
    const old = this.entities.get(topic);
    if (!old) return;
    this._detach(this.byStateTopic, old.config.state_topic, old);
    for (const a of old.availability) this._detach(this.byAvailabilityTopic, a.topic, old);
    this.entities.delete(topic);
    this.byPath.delete(old.path);
    this.stats.removed++;
    this.emit('removed', old);
  }
  _add(parts, config, origin) {
    if (!config.state_topic || typeof config.state_topic !== 'string') {
      this.stats.rejected++; this.emit('warning', `Missing state_topic: ${parts.topic}`); return null;
    }
    const old = this.entities.get(parts.topic);
    if (old) this._remove(parts.topic);
    const availability = Array.isArray(config.availability) ? config.availability.filter(a => a.topic)
      : (config.availability_topic ? [{topic: config.availability_topic,
        payload_available: config.payload_available ?? 'online', payload_not_available: config.payload_not_available ?? 'offline'}] : []);
    const entity = {
      topic: parts.topic, origin, path: entityPath(parts), domain: parts.domain,
      name: limit(config.name || parts.entity), config, type: outputType(parts.domain, config),
      availability, status: new Map(), lastSeen: null, available: availability.length ? false : true,
    };
    this.entities.set(parts.topic, entity);
    this.byPath.set(entity.path, entity);
    this._attach(this.byStateTopic, config.state_topic, entity);
    for (const a of availability) this._attach(this.byAvailabilityTopic, a.topic, entity);
    this.stats.configs++;
    this.emit('entity', entity);
    return entity;
  }
  onConfig(topic, payload) {
    const parsed = parseDiscoveryTopic(topic, this.prefix);
    if (!parsed) return [];
    const cfg = cleanConfig(payload);
    const origins = this.byOrigin.get(topic) || [];
    for (const child of origins) this._remove(child);
    this.byOrigin.delete(topic);
    if (cfg == null) { if (parsed.domain !== 'device') this._remove(topic); return []; }
    if (parsed.domain !== 'device') {
      const created = this._add(parsed, cfg, topic);
      return created ? [created] : [];
    }
    // HA combined discovery: <prefix>/device/<device_id>/config with components.
    const components = cfg.components ?? cfg.cmps;
    if (!obj(components)) { this.stats.rejected++; this.emit('warning', 'No components in device discovery'); return []; }
    const children = []; const paths = [];
    for (const [componentId, raw] of Object.entries(components)) {
      if (!obj(raw)) continue;
      const domain = raw.platform ?? raw.p;
      if (!SUPPORTED.has(domain)) continue;
      const childTopic = `${this.prefix}/${domain}/${safeSegment(parsed.entity)}/${safeSegment(componentId)}/config`;
      const childCfg = normalize({...cfg, ...raw});
      delete childCfg.components; delete childCfg.cmps;
      const created = this._add({domain, node: parsed.entity, entity: componentId, topic:childTopic}, childCfg, topic);
      if (created) {children.push(created); paths.push(childTopic);}
    }
    this.byOrigin.set(topic, paths);
    return children;
  }
  onMessage(topic, raw, time = Date.now()) {
    const updates = [];
    for (const path of this.byStateTopic.get(topic) || []) {
      const entity = this.byPath.get(path);
      if (!entity) continue;
      const value = parseValue(entity, raw);
      if (value === undefined) continue;
      entity.lastSeen = time;
      const update = {path, domain:entity.domain, value, available:entity.available, lastSeen:time, topic};
      updates.push(update);
      this.stats.updates++;
      this.emit('state', update);
    }
    for (const path of this.byAvailabilityTopic.get(topic) || []) {
      const entity = this.byPath.get(path);
      if (!entity) continue;
      const entry = entity.availability.find(a => a.topic === topic);
      if (!entry) continue;
      entity.status.set(topic, String(raw) === String(entry.payload_available));
      const mode = entity.config.availability_mode || 'latest';
      const values = [...entity.status.values()];
      entity.available = mode === 'all' ? values.length === entity.availability.length && values.every(Boolean)
        : mode === 'any' ? values.some(Boolean) : entity.status.get(topic);
      this.emit('availability', { path, available:entity.available });
    }
    return updates;
  }
  allEntities() { return [...this.entities.values()]; }
}
module.exports = { DiscoveryRegistry, parseDiscoveryTopic, parseValue, valueTemplate, normalize, safeSegment };

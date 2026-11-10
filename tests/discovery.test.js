'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {DiscoveryRegistry, normalize, parseDiscoveryTopic, valueTemplate} = require('../lib/discovery');
function configFor(prefix, domain, name, extras = {}) {
  return JSON.stringify({name, unique_id:`${prefix}_${name}`, state_topic:`${prefix}/${name}`, ...extras});
}

test('Discovery parser handles 2 or 3 path components but not other topics', () => {
  assert.equal(parseDiscoveryTopic('homeassistant/sensor/master/voltage/config').node, 'master');
  assert.equal(parseDiscoveryTopic('homeassistant/sensor/voltage/config').entity, 'voltage');
  assert.equal(parseDiscoveryTopic('homeassistant/sensor/x/state'), null);
  assert.equal(parseDiscoveryTopic('homeassistant/text/x/config'), null);
});
test('short aliases and base topic (~) are expanded without mutating input', () => {
  const original = { '~': 'BMS_2', stat_t:'~/Cell_1_volt', unit_of_meas:'V', name:'Cell 1' };
  const n = normalize(original);
  assert.equal(n.state_topic, 'BMS_2/Cell_1_volt');
  assert.equal(n.unit_of_measurement, 'V');
  assert.equal(original.stat_t, '~/Cell_1_volt');
});
test('sensor numeric and signed values, binary sensor and switch, number all READ only', () => {
  const r = new DiscoveryRegistry();
  const seen = [];
  r.on('state', e => seen.push(e));
  r.onConfig('homeassistant/sensor/master/volt/config', configFor('BMS_master','sensor','voltage',{unit_of_measurement:'V'}));
  r.onConfig('homeassistant/binary_sensor/master/alarm/config', configFor('BMS_master','binary_sensor','alarm',{payload_on:'ON', payload_off:'OFF'}));
  r.onConfig('homeassistant/switch/master/charge/config', configFor('BMS_master','switch','charge',{command_topic:'BMS_master/control/charge/set'}));
  r.onConfig('homeassistant/number/master/limit/config', configFor('BMS_master','number','limit',{command_topic:'BMS_master/control/limit/set',min:2,max:4}));
  assert.equal(r.allEntities().length, 4);
  r.onMessage('BMS_master/voltage', '-53.17', 10);
  r.onMessage('BMS_master/alarm', 'OFF', 11);
  r.onMessage('BMS_master/charge', 'ON', 12);
  r.onMessage('BMS_master/limit', '3.45', 13);
  assert.deepEqual(seen.map(x=>x.value), [-53.17, false, true, 3.45]);
  // Incoming command topic must never become a read state.
  assert.deepEqual(r.onMessage('BMS_master/control/charge/set', 'OFF'), []);
  assert.deepEqual(r.onMessage('BMS_master/control/limit/set', '9'), []);
});
test('multiple states sharing a topic all update; no undefined object', () => {
  const r = new DiscoveryRegistry();
  const seen = [];
  r.on('state', x => seen.push(x));
  for (const [name, domain] of [['status','sensor'],['statusAlarm','binary_sensor']]) {
    r.onConfig(`homeassistant/${domain}/bms_2/${name}/config`, JSON.stringify({name,state_topic:'BMS_2/shared',...(domain==='sensor'?{}:{payload_on:'ON'})}));
  }
  assert.equal(r.onMessage('BMS_2/shared','ON').length,2);
  assert.equal(seen.every(x=>typeof x.path === 'string' && !x.path.includes('undefined')),true);
});
test('JSON template safely supports simple expressions and rejects arbitrary evaluation', () => {
  assert.equal(valueTemplate('{"voltage":3.327}', '{{ value_json.voltage }}'), 3.327);
  assert.equal(valueTemplate('{"a":{"i":"2"}}', '{{ value_json.a.i | float }}'), 2);
  assert.equal(valueTemplate('35', '{{ value | float }}'), 35);
  assert.equal(valueTemplate('x', '{{ process.exit() }}'), 'x');
});
test('retained config deletion removes mapping, retains no command writes', () => {
  const r = new DiscoveryRegistry();
  const cfgTopic='homeassistant/sensor/master/current/config';
  r.onConfig(cfgTopic, JSON.stringify({name:'Current',state_topic:'BMS_master/current',unit_of_measurement:'A'}));
  assert.equal(r.allEntities().length,1);
  r.onConfig(cfgTopic,'');
  assert.equal(r.allEntities().length,0);
  assert.equal(r.onMessage('BMS_master/current','10').length,0);
});
test('availability can mark states offline, and retained values alone do not prove freshness', () => {
  const r = new DiscoveryRegistry();
  const changes=[];
  r.on('availability', x=>changes.push(x));
  r.onConfig('homeassistant/sensor/master/soc/config',JSON.stringify({name:'SOC', state_topic:'BMS_master/soc',unit_of_measurement:'%',availability_topic:'BMS_master/availability'}));
  const e=r.allEntities()[0];
  assert.equal(e.available,false);
  r.onMessage('BMS_master/availability','online');
  assert.equal(e.available,true);
  r.onMessage('BMS_master/availability','offline');
  assert.equal(e.available,false);
  r.onMessage('BMS_master/soc','87',1794236348000);
  assert.equal(e.lastSeen,1794236348000);
  assert.deepEqual(changes.map(x=>x.available),[true,false]);
});
test('2026 combined device discovery with component IDs and removal', () => {
  const r = new DiscoveryRegistry();
  const topic='homeassistant/device/jk0/config';
  const payload={device:{identifiers:['JK-0']},origin:{name:'SmartPhoton'},components:{
    voltage:{p:'sensor',stat_t:'BMS_master/voltage',unit_of_meas:'V',name:'Voltage'},
    alarm:{p:'binary_sensor',stat_t:'BMS_master/alarm',pl_on:'ON'},
    unsupported:{p:'light',stat_t:'BMS_master/light'}
  }};
  assert.equal(r.onConfig(topic,JSON.stringify(payload)).length,2);
  assert.equal(r.allEntities().length,2);
  assert.equal(r.onMessage('BMS_master/voltage','53.1')[0].value,53.1);
  r.onConfig(topic,'');
  assert.equal(r.allEntities().length,0);
});
test('malformed oversized configs rejected, and prototypes do not pollute', () => {
  const r = new DiscoveryRegistry();
  assert.throws(()=>r.onConfig('homeassistant/sensor/x/config','{bad'));
  assert.throws(()=>r.onConfig('homeassistant/sensor/x/config','x'.repeat(65537)));
  r.onConfig('homeassistant/sensor/__proto__/config',JSON.stringify({name:'Test',state_topic:'BMS_2/test'}));
  assert.ok(r.allEntities()[0].path.includes('sensor.'));
  assert.equal({}.polluted,undefined);
});
test('simulated two BMS: 65 sensor, 8 switch, 10 binary_sensor, 33 number each', () => {
  const r = new DiscoveryRegistry();
  const counts={sensor:65,switch:8,binary_sensor:10,number:33};
  let emitted=0;
  r.on('state',()=>emitted++);
  for (const pack of ['BMS_master','BMS_2']) for (const [domain,n] of Object.entries(counts)) {
    for(let i=0;i<n;i++) {
      const entity=`${domain}_${i}`;
      const topic=`${pack}/${domain}/${entity}`;
      r.onConfig(`homeassistant/${domain}/${pack}/${entity}/config`, JSON.stringify({name:entity,state_topic:topic,
        ...(domain==='sensor'?{unit_of_measurement:'V'}:{}),
        ...(domain==='number'||domain==='switch'?{command_topic:`${pack}/control/${entity}/set`}:{})}));
      const val=domain==='switch'||domain==='binary_sensor'?'ON':'3.325';
      r.onMessage(topic,val,100+i);
    }
  }
  assert.equal(r.allEntities().length,232);
  assert.equal(emitted,232);
  assert.deepEqual([...r.entities.values()].reduce((acc,e)=>(acc[e.domain]=(acc[e.domain]||0)+1,acc),{}),
    {sensor:130,switch:16,binary_sensor:20,number:66});
  assert.equal(new Set(r.allEntities().map(x=>x.path)).size,232);
});

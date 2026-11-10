'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

class MockAdapter extends EventEmitter {
  constructor(opts) {
    super();
    this.namespace = `${opts.name}.0`;
    this.config = {mqttClientInstanceID:'mqtt.0',hassPrefix:'homeassistant'};
    this.objects = new Map(); this.states = new Map(); this.foreign = new Map(); this.subscriptions = [];
    this.log = {info(){},warn(){},error(e){throw new Error(String(e));}};
    this.writes = []; this.publishes = [];
  }
  setObjectNotExistsAsync(id,obj){
    if (!this.objects.has(id)) this.objects.set(id,obj);
    return Promise.resolve();
  }
  setStateAsync(id, val){
    assert.equal(val.ack,true, `Unacknowledged write ${id}`);
    assert.ok(!id.includes('.command'), `Command state prohibited: ${id}`);
    this.states.set(id,val); this.writes.push({id,val}); return Promise.resolve();
  }
  getForeignStateAsync(id){return Promise.resolve(this.foreign.get(id) || null);}
  getForeignStatesAsync(pattern){
    const pre=pattern.slice(0,-1);
    return Promise.resolve(Object.fromEntries([...this.foreign].filter(([id])=>id.startsWith(pre))));
  }
  subscribeForeignStates(id){this.subscriptions.push(id);}
  sendTo(){this.publishes.push('sendTo'); throw new Error('MQTT publishing forbidden');}
  setForeignState(){this.publishes.push('setForeignState'); throw new Error('MQTT publishing forbidden');}
}
const origLoad = Module._load;
Module._load = function(request,parent,isMain) {
  if(request === '@iobroker/adapter-core') return {Adapter:MockAdapter};
  return origLoad.call(this,request,parent,isMain);
};
const {HassMqttNext}=require('../main');
Module._load=origLoad;

async function drain(a) {
  for (let i=0;i<5;i++) { await a.serial; await new Promise(resolve=>setImmediate(resolve)); }
}
function addForeign(a,topic, val, ts=1000) {a.foreign.set('mqtt.0.'+topic.replace(/\//g,'.'),{val,ts,ack:true});}

test('adapter startup hydrates retained configs and measurements with no command states or publications',async()=>{
  const a=new HassMqttNext();
  addForeign(a,'info/connection',true);
  addForeign(a,'homeassistant/sensor/master/cell1/config', JSON.stringify({name:'Master Cell 1',state_topic:'BMS_master/Cell_1_volt',unit_of_measurement:'V'}));
  addForeign(a,'homeassistant/sensor/bms_2/cell1/config', JSON.stringify({name:'BMS 2 Cell 1',state_topic:'BMS_2/Cell_1_volt',unit_of_measurement:'V'}));
  addForeign(a,'homeassistant/switch/bms_2/charge/config', JSON.stringify({name:'BMS 2 Charge', state_topic:'BMS_2/Switch_Charge',command_topic:'BMS_2/control/charging_switch/set'}));
  addForeign(a,'homeassistant/number/bms_2/limit/config', JSON.stringify({name:'BMS 2 Limit', state_topic:'BMS_2/control/max_charge_current/state',command_topic:'BMS_2/control/max_charge_current/set'}));
  addForeign(a,'homeassistant/binary_sensor/bms_2/alarm/config',JSON.stringify({name:'Alarm', state_topic:'BMS_2/alarm/active'}));
  addForeign(a,'BMS_master/Cell_1_volt',3.327,1100);
  addForeign(a,'BMS_2/Cell_1_volt','3.322',1200);
  addForeign(a,'BMS_2/Switch_Charge','ON',1200);
  addForeign(a,'BMS_2/control/max_charge_current/state','150',1200);
  addForeign(a,'BMS_2/alarm/active','OFF',1200);
  a.emit('ready');
  await drain(a);
  const entities=a.registry.allEntities();
  assert.equal(entities.length,5);
  for (const e of entities) {
    const id=`entities.${e.path}.value`;
    assert.ok(a.objects.has(id),`Missing ${id}`);
    assert.equal(a.objects.get(id).common.write,false);
    assert.ok(a.states.has(id),`Missing value in ${id}`);
    assert.ok(a.objects.has(`entities.${e.path}.last_seen_ms`));
  }
  assert.deepEqual(entities.map(e=>a.states.get(`entities.${e.path}.value`).val),[3.327,3.322,true,150,false]);
  assert.deepEqual(a.states.get('info.connection'),{val:true,ack:true});
  assert.equal(a.publishes.length,0);
  assert.equal(a.subscriptions.some(s=>s.includes('/set')),false);
  assert.equal([...a.objects.keys()].some(s=>s.includes('undefined')),false);
  assert.equal(a.writes.some(x=>x.id.includes('.command')),false);
});
test('late config followed by state update does not create a command, and empty config makes unavailable',async()=>{
  const a=new HassMqttNext(); addForeign(a,'info/connection',true);
  a.emit('ready'); await drain(a);
  const topic='homeassistant/number/bms_2/voltage/config';
  const id='mqtt.0.'+topic.replace(/\//g,'.');
  a.emit('stateChange',id,{val:JSON.stringify({state_topic:'BMS_2/control/cell_soc0_voltage/state',command_topic:'BMS_2/control/cell_soc0_voltage/set',name:'SOC 0% voltage'})});
  await drain(a);
  a.emit('stateChange','mqtt.0.BMS_2.control.cell_soc0_voltage.state',{val:2.7,ts:100000});
  await drain(a);
  const path=a.registry.allEntities()[0].path;
  assert.equal(a.states.get(`entities.${path}.value`).val,2.7);
  a.emit('stateChange',id,{val:''}); await drain(a);
  assert.equal(a.registry.allEntities().length,0);
  assert.equal(a.states.get(`entities.${path}.available`).val,false);
  assert.equal(a.publishes.length,0);
});

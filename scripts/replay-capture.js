#!/usr/bin/env node
'use strict';
// Offline replay; accepts lines produced by mosquitto_sub -v, NEVER publishes.
const fs = require('node:fs');
const { DiscoveryRegistry, parseDiscoveryTopic } = require('../lib/discovery');
const file = process.argv[2];
if (!file) {console.error('Usage: node scripts/replay-capture.js <mosquitto_sub_-v.txt>'); process.exit(2);}
const r = new DiscoveryRegistry();
let invalid=0, messages=0, configLines=0, updates=0;
const retained = new Map();
const configs=[];
const domains={};
const text=fs.readFileSync(file,'utf8');
for (const line of text.split(/\r?\n/)) {
  const p=line.indexOf(' ');
  if (p<0) continue;
  const topic=line.slice(0,p), val=line.slice(p+1);
  if (parseDiscoveryTopic(topic)) {configs.push([topic,val]); configLines++;}
  else if (topic.startsWith('BMS_') || topic.startsWith('jkbms/')) {retained.set(topic,val); messages++;}
}
for (const [topic,payload] of configs) {
  try {r.onConfig(topic,payload);} catch(e) {invalid++;}
}
for (const [topic,payload] of retained) updates+=r.onMessage(topic,payload).length;
for (const e of r.allEntities()) domains[e.domain]=(domains[e.domain]||0)+1;
console.log(JSON.stringify({
  kind:'OFFLINE_SIMULATION_NO_MQTT_WRITES',configMessages:configLines,
  entities:r.allEntities().length,domains,observedDataTopics:messages,
  liveOrRetainedValuesMatched:updates,invalidConfigs:invalid,
  caveat:'A text capture cannot prove freshness or production compatibility; no network used.'
},null,2));

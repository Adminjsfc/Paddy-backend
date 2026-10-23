import mqtt from 'mqtt';
import fs from 'node:fs';
import { pool } from "./config/database.js";
import { transaction } from "./utils/transaction.js";
import { normalizeMqtt, ingestPacket } from "./services/gps.service.js";
if (!process.env.MQTT_URL) throw new Error('Set MQTT_URL before starting the optional worker');
const client = mqtt.connect(process.env.MQTT_URL, {
  clientId: process.env.MQTT_CLIENT_ID || 'sfc-cmr-gps-worker',
  clean: false,
  protocolVersion: 4,
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 5000,
  keepalive: 60,
  rejectUnauthorized: true,
  ...(process.env.MQTT_CA_FILE ? {
    ca: fs.readFileSync(process.env.MQTT_CA_FILE)
  } : {})
});
client.on('connect', () => client.subscribe(process.env.MQTT_TOPIC || 'gps/+/data', {
  qos: 1
}, err => {
  if (err) console.error(JSON.stringify({
    event: 'MQTT_SUBSCRIBE_ERROR',
    code: err.code
  }));else console.log(JSON.stringify({
    event: 'MQTT_CONNECTED'
  }));
}));
// MQTT.js invokes this hook before PUBACK; complete durable SQL processing before callback.
client.handleMessage = async (packet, done) => {
  try {
    if (packet.payload.length > 256 * 1024) throw new Error('Packet too large');
    const normalized = normalizeMqtt(JSON.parse(packet.payload.toString()));
    await transaction(connection => ingestPacket(connection, normalized));
    done();
  } catch (e) {
    console.error(JSON.stringify({
      event: 'MQTT_PACKET_FAILED',
      code: e.code || e.name
    }));
    if (e.status || e.name === 'ZodError' || e instanceof SyntaxError || e.message === 'Packet too large') done();else {
      client.end(true);
      process.exitCode = 1;
      await pool.end();
    } // No PUBACK on database failure; supervisor reconnects.
  }
};
client.on('error', err => console.error(JSON.stringify({
  event: 'MQTT_ERROR',
  code: err.code
})));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => client.end(false, {}, async () => {
  await pool.end();
  process.exit(0);
}));

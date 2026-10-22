import type { L10n } from '@/i18n/locale';

export type MqttLang = 'js' | 'python' | 'java' | 'go' | 'cli';
export type MqttScenario = 'subscribe' | 'publish' | 'secure';

export interface MqttSnippetGroup {
  label: string;
  install: L10n;
  snippets: Record<MqttScenario, string>;
}

export const MQTT_SCENARIOS: Array<{ id: MqttScenario; label: L10n }> = [
  { id: 'subscribe', label: { zh: '连接 · 订阅 · 收消息', en: 'Connect · subscribe · receive' } },
  { id: 'publish', label: { zh: '发布消息', en: 'Publish messages' } },
  { id: 'secure', label: { zh: 'TLS 与认证', en: 'TLS & authentication' } },
];

export const MQTT_LANGS: MqttLang[] = ['js', 'python', 'java', 'go', 'cli'];

export const MQTT_SNIPPETS: Record<MqttLang, MqttSnippetGroup> = {
  js: {
    label: 'mqtt.js',
    install: { zh: 'npm install mqtt', en: 'npm install mqtt' },
    snippets: {
      subscribe: `import mqtt from 'mqtt';

const client = mqtt.connect('mqtt://broker.example.com:1883', {
  clientId: 'web-client',
  username: 'alice',
  password: 'secret',
  clean: true,
  keepalive: 60,
  reconnectPeriod: 2000, // auto reconnect
});

client.on('connect', () => client.subscribe('home/+/temperature', { qos: 1 }));
client.on('message', (topic, payload) => console.log(topic, payload.toString()));`,
      publish: `// QoS 0 JSON message, not retained
client.publish(
  'home/kitchen/temperature',
  JSON.stringify({ value: 26.5, unit: 'C', ts: Date.now() }),
  { qos: 0, retain: false },
);

// Retained status message: new subscribers get it immediately
client.publish('home/ledger/status', 'online', { qos: 1, retain: true });

client.end(false); // graceful close, sends DISCONNECT`,
      secure: `// Browser pages over HTTPS must use WSS (path is usually /mqtt)
const client = mqtt.connect('wss://broker.example.com:8084/mqtt', {
  clientId: 'web-client',
  username: 'alice',
  password: 'secret',
});

// Node.js over TLS with a custom CA
import fs from 'node:fs';

const secure = mqtt.connect('mqtts://broker.example.com:8883', {
  ca: fs.readFileSync('ca.crt'),
  // cert: fs.readFileSync('client.crt'), // mTLS client certificate
  // key: fs.readFileSync('client.key'),
  rejectUnauthorized: true,
});`,
    },
  },
  python: {
    label: 'Python · paho-mqtt',
    install: { zh: 'pip install paho-mqtt（2.x）', en: 'pip install paho-mqtt (2.x)' },
    snippets: {
      subscribe: `import paho.mqtt.client as mqtt

def on_connect(client, userdata, flags, reason_code, properties=None):
    print('connected:', reason_code)
    client.subscribe('home/+/temperature', qos=1)

def on_message(client, userdata, msg):
    print(msg.topic, msg.payload.decode())

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='py-client')
client.username_pw_set('alice', 'secret')
client.on_connect = on_connect
client.on_message = on_message
client.connect('broker.example.com', 1883, keepalive=60)
client.loop_forever()`,
      publish: `import json

# QoS 0 telemetry
client.publish(
    'home/kitchen/temperature',
    json.dumps({'value': 26.5, 'unit': 'C'}),
    qos=0,
    retain=False,
)

# Retained status message
client.publish('home/ledger/status', 'online', qos=1, retain=True)
client.disconnect()`,
      secure: `import ssl

# TLS on port 8883, verify broker with its root CA
client.tls_set(ca_certs='ca.crt', tls_version=ssl.PROTOCOL_TLSv1_2)
# client.tls_set(certfile='client.crt', keyfile='client.key')  # mTLS
client.connect('broker.example.com', 8883, keepalive=60)`,
    },
  },
  java: {
    label: 'Java · Eclipse Paho',
    install: { zh: 'org.eclipse.paho:org.eclipse.paho.client.mqttv3', en: 'org.eclipse.paho:org.eclipse.paho.client.mqttv3' },
    snippets: {
      subscribe: `MqttAsyncClient client = new MqttAsyncClient(
    "tcp://broker.example.com:1883", "java-client", new MemoryPersistence());

MqttConnectOptions options = new MqttConnectOptions();
options.setUserName("alice");
options.setPassword("secret".toCharArray());
options.setCleanSession(true);
options.setKeepAliveInterval(60);

client.setCallback(new MqttCallbackExtended() {
    @Override public void connectComplete(boolean reconnect, String serverURI) {
        try { client.subscribe("home/+/temperature", 1); } catch (MqttException ignored) {}
    }
    @Override public void messageArrived(String topic, MqttMessage msg) {
        System.out.println(topic + ": " + new String(msg.getPayload()));
    }
    @Override public void connectionLost(Throwable cause) {}
    @Override public void deliveryComplete(IMqttDeliveryToken token) {}
});
client.connect(options).waitForCompletion();`,
      publish: `MqttMessage message = new MqttMessage("{\\"value\\": 26.5}".getBytes());
message.setQos(0);
message.setRetained(false);
client.publish("home/kitchen/temperature", message);

// Retained status message
MqttMessage status = new MqttMessage("online".getBytes());
status.setQos(1);
status.setRetained(true);
client.publish("home/ledger/status", status);

client.disconnect().waitForCompletion();`,
      secure: `// Import the CA into a truststore first:
// keytool -importcert -alias broker -file ca.crt -keystore truststore.jks

MqttAsyncClient client = new MqttAsyncClient(
    "ssl://broker.example.com:8883", "java-client", new MemoryPersistence());
options.setSocketFactory(trustAllSslSocketFactory); // SSLContext built from the truststore`,
    },
  },
  go: {
    label: 'Go · paho.mqtt.golang',
    install: { zh: 'go get github.com/eclipse/paho.mqtt.golang', en: 'go get github.com/eclipse/paho.mqtt.golang' },
    snippets: {
      subscribe: `opts := MQTT.NewClientOptions()
opts.AddBroker("tcp://broker.example.com:1883")
opts.SetClientID("go-client")
opts.SetUsername("alice")
opts.SetPassword("secret")
opts.SetKeepAlive(60 * time.Second)

opts.OnConnect = func(c MQTT.Client) {
    c.Subscribe("home/+/temperature", 1, func(_ MQTT.Client, m MQTT.Message) {
        fmt.Printf("%s: %s\\n", m.Topic(), m.Payload())
    })
}

client := MQTT.NewClient(opts)
if token := client.Connect(); token.Wait() && token.Error() != nil {
    panic(token.Error())
}
select {} // block main goroutine`,
      publish: `// QoS 0 telemetry
token := client.Publish("home/kitchen/temperature", 0, false, \`{"value": 26.5}\`)
token.Wait()

// Retained status message
client.Publish("home/ledger/status", 1, true, "online")

client.Disconnect(250) // 250 ms quiet period, sends DISCONNECT`,
      secure: `roots := x509.NewCertPool()
pem, err := os.ReadFile("ca.crt")
if err != nil { panic(err) }
roots.AppendCertsFromPEM(pem)

opts.SetTLSConfig(&tls.Config{
    RootCAs:    roots,
    ServerName: "broker.example.com", // must match the certificate
})
opts.AddBroker("tls://broker.example.com:8883")`,
    },
  },
  cli: {
    label: 'CLI · mosquitto',
    install: { zh: 'mosquitto-clients（apt / brew install）', en: 'mosquitto-clients (apt / brew install)' },
    snippets: {
      subscribe: `# Subscribe with a wildcard topic and QoS 1; prints each payload
mosquitto_sub -h broker.example.com -p 1883 \\
  -t 'home/+/temperature' -q 1 -u alice -P secret -v`,
      publish: `# Publish a JSON message with QoS 0
mosquitto_pub -h broker.example.com -p 1883 \\
  -t 'home/kitchen/temperature' -q 0 \\
  -m '{"value": 26.5, "unit": "C"}'

# Publish a retained status message (-r)
mosquitto_pub -h broker.example.com -p 1883 \\
  -t 'home/ledger/status' -q 1 -r -m 'online'`,
      secure: `# TLS on 8883, verifying the broker with its root CA
mosquitto_sub -h broker.example.com -p 8883 --cafile ca.crt -t 'home/#' -v

# mTLS with a client certificate
mosquitto_pub -h broker.example.com -p 8883 --cafile ca.crt \\
  --cert client.crt --key client.key -t 'test/topic' -m 'hello'`,
    },
  },
};

const { ethers } = require('ethers');
const { WebSocket } = require('ws');

class HivagoraAgentSDK {
  constructor(config) {
    this.config = config;
    this.wallet = new ethers.Wallet(config.privateKey);
    this.did = `did:hivagora:${this.wallet.address.toLowerCase()}`;
    this.name = `🤖 ${config.name}`;
    this.ws = null;
    this.handlers = new Map();
  }

  async connect() {
    const timestamp = Date.now();
    const message = `Login to Hivagora at ${timestamp}`;
    const signature = await this.wallet.signMessage(message);

    const response = await fetch(`http://localhost:4000/agent/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: this.wallet.address,
        signature,
        message
      })
    });

    const { token } = await response.json();
    this.ws = new WebSocket(`ws://localhost:4000?token=${token}`);

    return new Promise((resolve, reject) => {
      this.ws.on('open', () => {
        console.log(`${this.name} connected to hub as ${this.did}`);
        resolve(true);
      });
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (this.handlers.has('message')) {
          this.handlers.get('message').forEach(h => h(msg));
        }
      });
    });
  }

  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
  }

  broadcast(content) {
    const msg = { type: 'broadcast', from: this.did, content };
    this.ws.send(JSON.stringify(msg));
    console.log(`${this.name} [Broadcast]:`, content);
  }

  sendDirect(to, type, content) {
    const msg = { type, from: this.did, to, content };
    this.ws.send(JSON.stringify(msg));
    console.log(`${this.name} -> ${to.slice(0, 15)}... [${type}]:`, content);
  }

  // --- Multi-party Escrow Helpers ---
  
  proposeBundle(targetDids, content) {
    targetDids.forEach(did => {
      this.sendDirect(did, 'propose_bundle', content);
    });
  }

  acceptBundle(orchestratorDid, dealId) {
    this.sendDirect(orchestratorDid, 'join_bundle', { dealId, status: 'joined' });
  }
}

module.exports = { HivagoraAgentSDK };

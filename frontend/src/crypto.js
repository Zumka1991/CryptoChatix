// E2E Encryption using Web Crypto API (RSA-OAEP + AES-GCM)

export class CryptoManager {
  constructor() {
    this.keyPair = null;
    this.peerPublicKeys = new Map(); // userId -> CryptoKey
  }

  // Generate RSA key pair for this user
  async generateKeyPair() {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    return this.keyPair;
  }

  // Export public key to JWK format for sharing
  async exportPublicKey() {
    if (!this.keyPair) {
      throw new Error('Key pair not generated');
    }

    const jwk = await window.crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    return JSON.stringify(jwk);
  }

  // Import peer's public key from JWK
  async importPeerPublicKey(userId, publicKeyJwk) {
    const jwk = JSON.parse(publicKeyJwk);
    const publicKey = await window.crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    );

    this.peerPublicKeys.set(userId, publicKey);
    return publicKey;
  }

  // Encrypt message for a specific user
  async encryptMessage(userId, message) {
    const peerPublicKey = this.peerPublicKeys.get(userId);
    if (!peerPublicKey) {
      throw new Error(`Public key not found for user: ${userId}`);
    }

    // Generate random AES key for this message
    const aesKey = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Encrypt message with AES
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoder.encode(message)
    );

    // Export AES key
    const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

    // Encrypt AES key with recipient's RSA public key
    const encryptedAesKey = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      peerPublicKey,
      rawAesKey
    );

    // Combine everything: encryptedAesKey + iv + encryptedData
    const payload = {
      key: this.arrayBufferToBase64(encryptedAesKey),
      iv: this.arrayBufferToBase64(iv),
      data: this.arrayBufferToBase64(encryptedData)
    };

    return JSON.stringify(payload);
  }

  // Decrypt received message
  async decryptMessage(encryptedPayload) {
    if (!this.keyPair) {
      throw new Error('Key pair not generated');
    }

    const payload = JSON.parse(encryptedPayload);

    // Decrypt AES key with our RSA private key
    const encryptedAesKey = this.base64ToArrayBuffer(payload.key);
    const rawAesKey = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      this.keyPair.privateKey,
      encryptedAesKey
    );

    // Import AES key
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      rawAesKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt message data
    const iv = this.base64ToArrayBuffer(payload.iv);
    const encryptedData = this.base64ToArrayBuffer(payload.data);

    const decryptedData = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }

  // Helper: ArrayBuffer to Base64
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Helper: Base64 to ArrayBuffer
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

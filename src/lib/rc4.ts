function rc4Bytes(key: Uint8Array, data: Uint8Array): Uint8Array {
  const state = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) state[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }

  const output = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + 1) & 0xff;
    b = (b + state[a]) & 0xff;
    [state[a], state[b]] = [state[b], state[a]];
    output[i] = data[i] ^ state[(state[a] + state[b]) & 0xff];
  }
  return output;
}

/** RC4 对称加解密（同一函数双向）。密钥与明文按 UTF-8 字节处理。 */
export function rc4(key: string | Uint8Array, data: string | Uint8Array): Uint8Array {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (keyBytes.length === 0) throw new Error('RC4 密钥不能为空');
  return rc4Bytes(keyBytes, dataBytes);
}

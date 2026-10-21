import "expo-sqlite/localStorage/install";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import aesjs from "aes-js";

// La sesión se guarda cifrada: lo cifrado va en localStorage (expo-sqlite) y la clave, en el llavero del celular
// (SecureStore no guarda valores largos como una sesión entera). Cada vez que se guarda, la clave es nueva.
export class EncryptedStorage {
  async getItem(name: string) {
    const data = localStorage.getItem(name);
    if (!data) return null;
    const key = await SecureStore.getItemAsync(name);
    if (!key) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(key), new aesjs.Counter(1));
    return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(data)));
  }

  async setItem(name: string, value: string) {
    const key = Crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
    const data = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(name, aesjs.utils.hex.fromBytes(key));
    localStorage.setItem(name, aesjs.utils.hex.fromBytes(data));
  }

  async removeItem(name: string) {
    localStorage.removeItem(name);
    await SecureStore.deleteItemAsync(name);
  }
}

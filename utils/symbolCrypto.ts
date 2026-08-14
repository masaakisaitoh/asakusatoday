import { PrivateKey, PublicKey, Signature } from 'symbol-sdk'
import { KeyPair, Network, Verifier } from 'symbol-sdk/symbol'

const NETWORK = Network.TESTNET
const textEncoder = new TextEncoder()

export interface SymbolAccount {
  privateKey: string
  publicKey: string
  address: string
}

function toSymbolAccount(privateKey: PrivateKey): SymbolAccount {
  const keyPair = new KeyPair(privateKey)
  const address = NETWORK.publicKeyToAddress(keyPair.publicKey)
  return {
    privateKey: keyPair.privateKey.toString(),
    publicKey: keyPair.publicKey.toString(),
    address: address.toString()
  }
}

export function generateAccount(): SymbolAccount {
  return toSymbolAccount(PrivateKey.random())
}

export function importAccount(privateKeyHex: string): SymbolAccount {
  return toSymbolAccount(new PrivateKey(privateKeyHex))
}

export function signMessage(privateKeyHex: string, message: string): string {
  const keyPair = new KeyPair(new PrivateKey(privateKeyHex))
  const signature = keyPair.sign(textEncoder.encode(message))
  return signature.toString()
}

export function verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean {
  const verifier = new Verifier(new PublicKey(publicKeyHex))
  return verifier.verify(textEncoder.encode(message), new Signature(signatureHex))
}

export function deriveAddress(publicKeyHex: string): string {
  return NETWORK.publicKeyToAddress(new PublicKey(publicKeyHex)).toString()
}

import { generateAccount, importAccount, signMessage, type SymbolAccount } from '../utils/symbolCrypto'

export function useAccount() {
  async function createNewAccount(): Promise<SymbolAccount> {
    return generateAccount()
  }

  async function importExistingAccount(privateKeyHex: string): Promise<SymbolAccount> {
    return importAccount(privateKeyHex)
  }

  async function loginWithAccount(account: SymbolAccount): Promise<{ userName: string }> {
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const signature = signMessage(account.privateKey, nonce)
    const result = await $fetch('/api/auth/verify', {
      method: 'POST',
      body: { address: account.address, publicKey: account.publicKey, signature, nonce }
    })
    await refreshNuxtData('current-user')
    return result
  }

  return { createNewAccount, importExistingAccount, loginWithAccount }
}

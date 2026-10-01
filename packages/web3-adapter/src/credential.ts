/** Minimal optional credential boundary: no wallet addresses, content or reading history. */
export interface MinimalReaderCredential {
  readonly id: string
  readonly season: string
  readonly credentialType: "READER_STAMP"
}

export interface CredentialDeliveryPolicy {
  readonly externalWritesEnabled: false
  readonly explicitConsent: true
  readonly transferable: false
  readonly sponsoredTransaction: false
  readonly gasCeiling: 0
  readonly signerCustody: "NONE"
  readonly revocationRegistry: "OFF_CHAIN"
}

export interface CredentialAdapter {
  deliver(
    credential: MinimalReaderCredential,
    policy: CredentialDeliveryPolicy
  ): Promise<{ status: "DISABLED"; publicCopyDeletable: false }>
}

/** This build has no external transport and cannot enqueue signing or sponsored transactions. */
export const offChainOnlyCredentialAdapter: CredentialAdapter = {
  async deliver(credential, policy) {
    if (
      !/^[-0-9a-f]{36}$/iu.test(credential.id) ||
      !/^[0-9]{4}$/u.test(credential.season) ||
      credential.credentialType !== "READER_STAMP" ||
      Object.keys(credential).some((key) => !["id", "season", "credentialType"].includes(key)) ||
      policy.externalWritesEnabled !== false ||
      policy.explicitConsent !== true ||
      policy.transferable !== false ||
      policy.sponsoredTransaction !== false ||
      policy.gasCeiling !== 0 ||
      policy.signerCustody !== "NONE" ||
      policy.revocationRegistry !== "OFF_CHAIN"
    ) {
      throw new Error("Credential delivery policy is not supported")
    }
    return { status: "DISABLED", publicCopyDeletable: false }
  }
}

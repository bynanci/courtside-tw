// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface only; no network, contract deployment or signer activation is authorized here.
/// @dev Implementations MUST reject conflicting reuse of an idempotencyKey; a same-digest retry is a no-op.
interface IPublicationRegistry {
    function attest(bytes32 idempotencyKey, bytes32 manifestDigest, bytes32 cidDigest,
        bytes16 snapshotId, uint32 schemaVersion, uint64 publishedAt) external;
    function digestOf(bytes32 idempotencyKey) external view returns (bytes32);
}

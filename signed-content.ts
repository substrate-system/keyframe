/**
 * Signed Content Library
 *
 * Creates verifiable, timestamped content signatures using:
 * - Ed25519 keypairs for signing
 * - C2PA manifest format for content provenance
 * - RFC 3161 TSA for trusted timestamps
 * - Merkle-list structure for revision history
 *
 * Note on C2PA: @contentauth/c2pa-web is for reading/validating existing C2PA data.
 * Creating and signing C2PA manifests requires c2pa-node (server-side).
 * This library creates C2PA-compliant manifest structures for text/markdown,
 * and can validate C2PA data from images using c2pa-web.
 */

import type { createC2pa } from '@contentauth/c2pa-web'

// ============================================================================
// Types
// ============================================================================

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface ContentSignature {
  /** Hash of the content (SHA-256) */
  contentHash: string;
  /** Ed25519 signature of the content hash */
  signature: string;
  /** Public key that created the signature */
  publicKey: string;
  /** ISO 8601 timestamp (claimed, not verified) */
  timestamp: string;
}

export interface TimestampedSignature extends ContentSignature {
  /** RFC 3161 timestamp token (base64) */
  tsaToken: string;
  /** Verified timestamp from TSA */
  verifiedTimestamp: string;
}

export interface ContentRevision {
  /** The markdown content */
  content: string;
  /** Signature for this revision */
  signature: TimestampedSignature;
  /** Hash of previous revision (null for first revision) */
  previousHash: string | null;
}

export interface SignedContent {
  /** Current content */
  content: string;
  /** Chain of all revisions (merkle-list) */
  revisions: ContentRevision[];
  /** C2PA manifest (when available) */
  c2paManifest?: C2PAManifest;
}

// ============================================================================
// Crypto Utilities
// ============================================================================

/**
 * Generate an Ed25519 keypair
 */
export async function generateKeypair (): Promise<Keypair> {
    const keypair = await crypto.subtle.generateKey(
        {
            name: 'Ed25519',
        },
        true,
        ['sign', 'verify']
    )

    const publicKey = await crypto.subtle.exportKey('raw', keypair.publicKey)
    const privateKey = await crypto.subtle.exportKey('pkcs8', keypair.privateKey)

    return {
        publicKey: new Uint8Array(publicKey),
        privateKey: new Uint8Array(privateKey),
    }
}

/**
 * Hash content using SHA-256
 */
export async function hashContent (content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return bufferToHex(new Uint8Array(hashBuffer))
}

/**
 * Sign content hash with Ed25519 private key
 */
export async function signHash (
    hash: string,
    privateKey: Uint8Array
): Promise<string> {
    const key = await crypto.subtle.importKey(
        'pkcs8',
        privateKey,
        {
            name: 'Ed25519',
        },
        false,
        ['sign']
    )

    const encoder = new TextEncoder()
    const signature = await crypto.subtle.sign(
        'Ed25519',
        key,
        encoder.encode(hash)
    )

    return bufferToHex(new Uint8Array(signature))
}

/**
 * Verify a signature
 */
export async function verifySignature (
    hash: string,
    signature: string,
    publicKey: Uint8Array
): Promise<boolean> {
    const key = await crypto.subtle.importKey(
        'raw',
        publicKey,
        {
            name: 'Ed25519',
        },
        false,
        ['verify']
    )

    const encoder = new TextEncoder()
    const signatureBytes = hexToBuffer(signature)

    return await crypto.subtle.verify(
        'Ed25519',
        key,
        signatureBytes,
        encoder.encode(hash)
    )
}

// ============================================================================
// RFC 3161 TSA Integration
// ============================================================================

export interface TSAConfig {
  /** TSA endpoint URL */
  url: string;
  /** Optional: specific hash algorithm OID */
  hashAlgorithm?: string;
  /** Optional: policy OID */
  policyOID?: string;
}

/**
 * Request an RFC 3161 timestamp from a TSA
 */
export async function requestTimestamp (
    hash: string,
    config: TSAConfig
): Promise<{ token: string; timestamp: Date }> {
    // Create TimeStampReq (simplified - would use ASN.1 encoding in production)
    const request = createTimeStampRequest(hash, config)

    const response = await fetch(config.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/timestamp-query',
        },
        body: request,
    })

    if (!response.ok) {
        throw new Error(`TSA request failed: ${response.status}`)
    }

    const tokenBuffer = await response.arrayBuffer()
    const token = bufferToBase64(new Uint8Array(tokenBuffer))

    // Parse the timestamp from the token
    const timestamp = parseTimestampToken(new Uint8Array(tokenBuffer))

    return { token, timestamp }
}

/**
 * Create a TimeStampReq (ASN.1 DER encoded)
 * Note: This is a simplified version. Production code should use a proper ASN.1 library
 */
function createTimeStampRequest (hash: string, config: TSAConfig): Uint8Array {
    // In production, use an ASN.1 library like @peculiar/asn1-schema
    // This is a placeholder that would construct proper DER encoding
    const hashBytes = hexToBuffer(hash)

    // Construct TimeStampReq structure:
    // TimeStampReq ::= SEQUENCE {
    //   version INTEGER,
    //   messageImprint MessageImprint,
    //   reqPolicy TSAPolicyId OPTIONAL,
    //   nonce INTEGER OPTIONAL,
    //   certReq BOOLEAN DEFAULT FALSE,
    //   extensions [0] IMPLICIT Extensions OPTIONAL
    // }

    // For now, return the hash as placeholder
    // Real implementation would use proper ASN.1 encoding
    return hashBytes
}

/**
 * Parse timestamp from TimeStampResp token
 * Note: This is a simplified version. Production code should use a proper ASN.1 library
 */
function parseTimestampToken (token: Uint8Array): Date {
    // In production, parse the CMS SignedData structure to extract TSTInfo
    // TSTInfo contains genTime which is the verified timestamp

    // For now, return current time as placeholder
    // Real implementation would parse ASN.1 DER structure
    return new Date()
}

// ============================================================================
// Core Signing Functions
// ============================================================================

/**
 * Sign content and return signature
 */
export async function signContent (
    content: string,
    keypair: Keypair
): Promise<ContentSignature> {
    const contentHash = await hashContent(content)
    const signature = await signHash(contentHash, keypair.privateKey)

    return {
        contentHash,
        signature,
        publicKey: bufferToHex(keypair.publicKey),
        timestamp: new Date().toISOString(),
    }
}

/**
 * Sign content with TSA timestamp
 */
export async function signContentWithTimestamp (
    content: string,
    keypair: Keypair,
    tsaConfig: TSAConfig
): Promise<TimestampedSignature> {
    const basicSig = await signContent(content, keypair)

    // Get TSA timestamp for the content hash
    const { token, timestamp } = await requestTimestamp(
        basicSig.contentHash,
        tsaConfig
    )

    return {
        ...basicSig,
        tsaToken: token,
        verifiedTimestamp: timestamp.toISOString(),
    }
}

// ============================================================================
// C2PA Integration
// ============================================================================

export interface C2PAManifest {
  claim_generator: string;
  title: string;
  assertions: Array<{
    label: string;
    data: any;
  }>;
  signature: {
    alg: string;
    value: string;
  };
}

/**
 * Create C2PA-compliant manifest structure for signed content
 *
 * Note: This creates the manifest JSON structure but does not embed it in media.
 * For embedding in images/video, use c2pa-node on the server side.
 */
export async function createC2PAManifest (
    content: string,
    signature: TimestampedSignature,
    metadata?: {
    title?: string;
    author?: string;
    description?: string;
  }
): Promise<C2PAManifest> {
    // Create C2PA-compliant manifest structure
    const manifest: C2PAManifest = {
        claim_generator: 'signed-content-library/1.0',
        title: metadata?.title || 'Signed Content',

        // C2PA Standard Assertions
        assertions: [
            // Hash assertion - proves integrity of content
            {
                label: 'c2pa.hash.data',
                data: {
                    alg: 'sha256',
                    hash: signature.contentHash,
                    name: 'content.md',
                },
            },
            // Actions assertion - records creation/edits
            {
                label: 'c2pa.actions',
                data: {
                    actions: [
                        {
                            action: 'c2pa.created',
                            when: signature.verifiedTimestamp,
                            digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
                        },
                    ],
                },
            },
            // Schema.org structured data
            {
                label: 'stds.schema-org.CreativeWork',
                data: {
                    '@context': 'https://schema.org',
                    '@type': 'CreativeWork',
                    author: metadata?.author || signature.publicKey.substring(0, 16) + '...',
                    dateCreated: signature.verifiedTimestamp,
                    description: metadata?.description,
                },
            },
            // Custom assertion for our Ed25519 signature + TSA token
            {
                label: 'org.nichoth.signature',
                data: {
                    publicKey: signature.publicKey,
                    signature: signature.signature,
                    timestamp: signature.timestamp,
                    tsaToken: signature.tsaToken,
                    verifiedTimestamp: signature.verifiedTimestamp,
                },
            },
        ],

        // Signature info
        signature: {
            alg: 'ed25519',
            value: signature.signature,
        },
    }

    return manifest
}

/**
 * Validate C2PA manifest from an image using @contentauth/c2pa-web
 *
 * This reads and validates existing C2PA data embedded in images/media.
 */
export async function validateC2PAFromImage (
    imageBlob: Blob,
    c2paInstance: Awaited<ReturnType<typeof createC2pa>>
): Promise<{
  valid: boolean;
  manifest: any;
  errors: string[];
}> {
    try {
    // Create reader from blob
        const reader = await c2paInstance.reader.fromBlob(imageBlob.type, imageBlob)

        // Get manifest store
        const manifestStore = await reader.manifestStore()

        // Get active manifest
        const activeManifest = manifestStore?.activeManifest

        // Get validation status
        const validationStatus = manifestStore?.validationStatus || []
        const errors = validationStatus
            .filter((status: any) => status.code !== 'claimSignature.validated')
            .map((status: any) => status.explanation || status.code)

        // Free memory
        await reader.free()

        return {
            valid: errors.length === 0,
            manifest: activeManifest,
            errors,
        }
    } catch (error) {
        return {
            valid: false,
            manifest: null,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        }
    }
}

/**
 * Sign content in C2PA format
 *
 * Creates a C2PA-compliant manifest structure with Ed25519 signature and TSA timestamp.
 * The manifest can be:
 * - Embedded in HTML as JSON-LD metadata
 * - Served separately as verification data
 * - Used with c2pa-node to embed in images (server-side)
 */
export async function signContentC2PA (
    content: string,
    keypair: Keypair,
    tsaConfig: TSAConfig,
    metadata?: {
    title?: string;
    author?: string;
    description?: string;
  }
): Promise<{ signature: TimestampedSignature; manifest: C2PAManifest }> {
    const signature = await signContentWithTimestamp(content, keypair, tsaConfig)
    const manifest = await createC2PAManifest(content, signature, metadata)

    return { signature, manifest }
}

// ============================================================================
// Merkle-List / Revision Chain
// ============================================================================

/**
 * Create initial signed content
 */
export async function createSignedContent (
    content: string,
    keypair: Keypair,
    tsaConfig: TSAConfig,
    metadata?: {
    title?: string;
    author?: string;
    description?: string;
  }
): Promise<SignedContent> {
    const signature = await signContentWithTimestamp(content, keypair, tsaConfig)
    const manifest = await createC2PAManifest(content, signature, metadata)

    const revision: ContentRevision = {
        content,
        signature,
        previousHash: null,
    }

    return {
        content,
        revisions: [revision],
        c2paManifest: manifest,
    }
}

/**
 * Add a new revision to signed content
 */
export async function addRevision (
    signedContent: SignedContent,
    newContent: string,
    keypair: Keypair,
    tsaConfig: TSAConfig
): Promise<SignedContent> {
    const lastRevision = signedContent.revisions[signedContent.revisions.length - 1]
    const previousHash = lastRevision.signature.contentHash

    // Sign new content with reference to previous
    const signature = await signContentWithTimestamp(newContent, keypair, tsaConfig)

    const revision: ContentRevision = {
        content: newContent,
        signature,
        previousHash,
    }

    return {
        content: newContent,
        revisions: [...signedContent.revisions, revision],
        c2paManifest: await createC2PAManifest(newContent, signature),
    }
}

/**
 * Verify the entire revision chain
 */
export async function verifyChain (
    signedContent: SignedContent,
    publicKey: Uint8Array
): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    for (let i = 0; i < signedContent.revisions.length; i++) {
        const revision = signedContent.revisions[i]

        // Verify content hash
        const computedHash = await hashContent(revision.content)
        if (computedHash !== revision.signature.contentHash) {
            errors.push(`Revision ${i}: Content hash mismatch`)
        }

        // Verify signature
        const valid = await verifySignature(
            revision.signature.contentHash,
            revision.signature.signature,
            publicKey
        )
        if (!valid) {
            errors.push(`Revision ${i}: Invalid signature`)
        }

        // Verify chain linkage
        if (i > 0) {
            const prevHash = signedContent.revisions[i - 1].signature.contentHash
            if (revision.previousHash !== prevHash) {
                errors.push(`Revision ${i}: Chain linkage broken`)
            }
        } else {
            if (revision.previousHash !== null) {
                errors.push(`Revision ${i}: First revision should have null previousHash`)
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize signed content to JSON
 */
export function serializeSignedContent (signedContent: SignedContent): string {
    return JSON.stringify(signedContent, null, 2)
}

/**
 * Parse signed content from JSON
 */
export function parseSignedContent (json: string): SignedContent {
    return JSON.parse(json)
}

/**
 * Export signed content with embedded manifest
 */
export function exportWithManifest (signedContent: SignedContent): {
  content: string;
  manifest: any;
  chainProof: any;
} {
    return {
        content: signedContent.content,
        manifest: signedContent.c2paManifest,
        chainProof: {
            revisions: signedContent.revisions.map(r => ({
                contentHash: r.signature.contentHash,
                signature: r.signature.signature,
                timestamp: r.signature.verifiedTimestamp,
                previousHash: r.previousHash,
            })),
        },
    }
}

// ============================================================================
// Utilities
// ============================================================================

function bufferToHex (buffer: Uint8Array): string {
    return Array.from(buffer)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

function hexToBuffer (hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
}

function bufferToBase64 (buffer: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i])
    }
    return btoa(binary)
}

function base64ToBuffer (base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes
}

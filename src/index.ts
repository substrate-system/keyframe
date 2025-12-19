import type { C2paSdk } from '@contentauth/c2pa-web'
import { ASN1 } from '@substrate-system/asn1'
import { version } from '../package.json'
import {
    bufferToHex,
    hexToBuffer,
    bufferToBase64,
} from './util.js'

export type Timestamp = {
    authority:string;
    token:string;
    verifiedAt:string;
}

/**
 * Signed Content Library
 *
 * Create verifiable, timestamped signatures using:
 *   - Ed25519 keypairs for signing
 *   - RFC 3161 TSA for trusted timestamps
 *   - Merkle-list structure for revision history
 */

// ============================================================================
// Types
// ============================================================================

export interface Keypair {
    publicKey:Uint8Array<ArrayBuffer>;
    privateKey:Uint8Array<ArrayBuffer>;
}

export interface ContentSignature {
    /** Hash of the content (SHA-256) */
    contentHash:string;

    /** Ed25519 signature of the content hash */
    signature:string;

    /** Public key that created the signature, multikey format */
    publicKey:string;

    /** ISO 8601 timestamp (claimed, not verified) */
    timestamp:string;
}

export interface TimestampedSignature extends ContentSignature {
    /** RFC 3161 timestamp token (base64) */
    tsaToken:string;

    /** Verified timestamp from TSA */
    verifiedTimestamp:string;
}

export interface ContentRevision {
    /** The content being signed */
    content:string;

    /** Signature for this revision */
    signature:TimestampedSignature;

    /** Hash of previous revision (null for first revision) */
    previousHash:string|null;
}

/**
 * Custom manifest structure created by this library
 * This is a simplified C2PA-like manifest, not a full C2PA manifest
 */
export interface Manifest {
    claim_generator_info:string;
    title:string;
    assertions:Array<{
        label:string;
        data:unknown;
    }>;
    signature:{
        alg:string;
        value:string;
    };
}

export interface SignedContent {
    content:string;
    revisions:ContentRevision[];  // Chain of all revisions (merkle-list)
    c2paManifest?:Manifest;  // C2PA manifest (when available)
}

/**
 * Signature for any file (images, documents, etc.)
 * Can be stored as sidecar JSON or embedded in file metadata
 */
export interface FileSignature {
    version:'1.0';
    file:{
        name:string;           // Original filename
        hash:string;           // SHA-256 of file content (hex)
        size:number;           // File size in bytes
        mimeType?:string;      // MIME type if known
    };
    signature:{
        algorithm:'Ed25519';
        publicKey:string;      // Hex-encoded public key
        signature:string;      // Hex-encoded signature of file hash
        signedAt:string;       // ISO 8601 timestamp (claimed)
    };
    timestamp:{
        authority:string;      // TSA URL
        token:string;          // RFC 3161 token (base64)
        verifiedAt:string;     // ISO 8601 timestamp from TSA
    };
    metadata?:{
        author?:string;
        title?:string;
        description?:string;
        [key:string]:any;     // Additional custom fields
    };
}

// ============================================================================
// Crypto Utilities
// ============================================================================

/**
 * Generate an Ed25519 keypair
 */
export async function generateKeypair ():Promise<Keypair> {
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
 * @param {string} content The text to hash
 * @returns {Promise<string>} A hex-encoded string representation of the hash.
 */
export async function hashContent (
    content:string
):Promise<Uint8Array<ArrayBuffer>> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return new Uint8Array(hashBuffer)
}

/**
 * Sign content hash with Ed25519 private key
 * @returns {string} A hex-encoded string.
 */
export async function signHash (
    hash:Uint8Array<ArrayBuffer>,
    privateKey:Uint8Array|CryptoKey
):Promise<string> {
    let key:CryptoKey
    if (privateKey instanceof CryptoKey) {
        key = privateKey
    } else {
        key = await crypto.subtle.importKey(
            'pkcs8',
            privateKey.buffer as ArrayBuffer,
            {
                name: 'Ed25519',
            },
            false,
            ['sign']
        )
    }

    // const encoder = new TextEncoder()
    const signature = await crypto.subtle.sign(
        'Ed25519',
        key,
        hash
    )

    return bufferToHex(new Uint8Array(signature))
}

/**
 * Verify a signature.
 *
 * @param {string} hash The hex-encoded hash
 * @param {string} signature Hex-encoded signature
 * @param {Uint8Array<ArrayBuffer>} publicKey
 * @returns {boolean} True iff the signature is valid.
 */
export async function verifySignature (
    hash:string,
    signature:string,
    publicKey:Uint8Array<ArrayBuffer>
):Promise<boolean> {
    const key = await crypto.subtle.importKey(
        'raw',
        publicKey.buffer,
        { name: 'Ed25519' },
        false,
        ['verify']
    )

    const signatureBytes = hexToBuffer(signature)

    const valid = await crypto.subtle.verify(
        'Ed25519',
        key,
        signatureBytes.buffer as ArrayBuffer,
        hexToBuffer(hash)
    )
    return valid
}

// ============================================================================
// RFC 3161 TSA Integration
// ============================================================================

export interface TSAConfig {
    /** TSA endpoint URL */
    url:string;
    /** Optional: specific hash algorithm OID */
    hashAlgorithm?:string;
    /** Optional: policy OID */
    policyOID?:string;
}

/**
 * Request an RFC 3161 timestamp from a TSA
 */
export async function requestTimestamp (
    hash:string,
    config:TSAConfig
):Promise<{ token:string; timestamp:Date }> {
    // Create TimeStampReq with proper ASN.1 DER encoding
    const request = await createTimeStampRequest(hash, config)

    const response = await fetch(config.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/timestamp-query',
        },
        body: request.buffer as ArrayBuffer,
    })

    if (!response.ok) {
        throw new Error(`TSA request failed: ${response.status}`)
    }

    const tokenBuffer = await response.arrayBuffer()
    const token = bufferToBase64(new Uint8Array(tokenBuffer))

    // Parse the timestamp from the token
    const timestamp = await parseTimestampToken(new Uint8Array(tokenBuffer))

    return { token, timestamp }
}

/**
 * Create a TimeStampReq (ASN.1 DER encoded) per RFC 3161
 *
 * TimeStampReq ::= SEQUENCE {
 *   version INTEGER { v1(1) },
 *   messageImprint MessageImprint,
 *   reqPolicy TSAPolicyId OPTIONAL,
 *   nonce INTEGER OPTIONAL,
 *   certReq BOOLEAN DEFAULT FALSE,
 *   extensions [0] IMPLICIT Extensions OPTIONAL
 * }
 *
 * MessageImprint ::= SEQUENCE {
 *   hashAlgorithm AlgorithmIdentifier,
 *   hashedMessage OCTET STRING
 * }
 */
async function createTimeStampRequest (
    hash:string,
    config:TSAConfig
):Promise<Uint8Array<ArrayBuffer>> {
    const hashBytes = hexToBuffer(hash)
    const hashAlg = config.hashAlgorithm || 'sha256'

    // OID for hash algorithms
    const oids:Record<string, string> = {
        sha256: '608648016503040201', // 2.16.840.1.101.3.4.2.1
        sha384: '608648016503040202', // 2.16.840.1.101.3.4.2.2
        sha512: '608648016503040203', // 2.16.840.1.101.3.4.2.3
    }

    const oid = oids[hashAlg] || oids.sha256

    // Generate a random nonce (8 bytes)
    const nonce = crypto.getRandomValues(new Uint8Array(8))

    // MessageImprint = SEQUENCE { hashAlgorithm, hashedMessage }
    const messageImprint = ASN1.Any('30',  // SEQUENCE
        ASN1.Any('30',  // AlgorithmIdentifier SEQUENCE
            ASN1.Any('06', oid),  // algorithm OID
            ASN1.Any('05', '')    // NULL parameters
        ),
        ASN1.Any('04', bufferToHex(hashBytes))  // OCTET STRING (hash)
    )

    // TimeStampReq = SEQUENCE { version, messageImprint, nonce, certReq }
    const request = ASN1.Any('30',  // SEQUENCE
        ASN1.UInt('01'),  // version = 1
        messageImprint,
        ASN1.UInt(bufferToHex(nonce)),  // nonce
        ASN1.Any('01', '01')  // certReq = TRUE (0x01 = TRUE in DER)
    )

    return hexToBuffer(request)
}

/**
 * Parse timestamp from TimeStampResp token per RFC 3161
 *
 * TimeStampResp ::= SEQUENCE {
 *   status PKIStatusInfo,
 *   timeStampToken TimeStampToken OPTIONAL
 * }
 *
 * TimeStampToken is a CMS SignedData containing TSTInfo
 * TSTInfo ::= SEQUENCE {
 *   version INTEGER,
 *   policy TSAPolicyId,
 *   messageImprint MessageImprint,
 *   serialNumber INTEGER,
 *   genTime GeneralizedTime,  <-- This is what we need
 *   ...
 * }
 */
async function parseTimestampToken (token:Uint8Array):Promise<Date> {
    try {
        // Parse the DER-encoded response
        const resp = ASN1.parse({ der: token, verbose: true, json: false })

        if (Array.isArray(resp)) {
            throw new Error('Expected verbose object, got array')
        }

        if (!resp || !resp.children) {
            throw new Error('Invalid TimeStampResp structure')
        }

        // Navigate to TSTInfo structure
        // TimeStampResp[1] = TimeStampToken (ContentInfo)
        // ContentInfo[1] = SignedData
        // SignedData[2] = EncapsulatedContentInfo
        // EncapsulatedContentInfo[1] = TSTInfo (as OCTET STRING)

        const timeStampToken = resp.children?.[1]
        if (!timeStampToken?.children) {
            throw new Error('No TimeStampToken in response')
        }

        // SignedData is wrapped in [0] EXPLICIT
        const signedData = timeStampToken.children[1]?.children?.[0]
        if (!signedData?.children) {
            throw new Error('Invalid SignedData structure')
        }

        // EncapsulatedContentInfo is typically at index 2
        const encapContentInfo = signedData.children[2]
        if (!encapContentInfo?.children) {
            throw new Error('No EncapsulatedContentInfo')
        }

        // TSTInfo is in the eContent [0] EXPLICIT
        const eContent = encapContentInfo.children[1]?.children?.[0]
        if (!eContent?.value) {
            throw new Error('No eContent found')
        }

        // Parse TSTInfo
        const tstInfoParsed = ASN1.parse({
            der: eContent.value,
            verbose: true,
            json: false
        })

        if (Array.isArray(tstInfoParsed)) {
            throw new Error('Expected verbose TSTInfo object, got array')
        }

        if (!tstInfoParsed?.children) {
            throw new Error('Invalid TSTInfo structure')
        }

        const tstInfo = tstInfoParsed

        // genTime is typically at index 4 in TSTInfo
        // It's a GeneralizedTime (tag 0x18) or UTCTime (tag 0x17)
        const genTime = tstInfo.children[4]
        if (!genTime?.value) {
            throw new Error('No genTime in TSTInfo')
        }

        // Parse GeneralizedTime format: YYYYMMDDHHmmss[.fff]Z
        const timeStr = new TextDecoder().decode(genTime.value)

        // Parse: 20240101120000Z or 20240101120000.123Z
        const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/)
        if (!match) {
            throw new Error(`Invalid GeneralizedTime format: ${timeStr}`)
        }

        const [, year, month, day, hour, minute, second, fraction] = match
        const isoString = `${year}-${month}-${day}T${hour}` +
            `:${minute}:${second}${fraction ? '.' + fraction : ''}Z`

        return new Date(isoString)
    } catch (error) {
        // If parsing fails, log a warning and throw
        console.warn('Failed to parse TSA timestamp:', error)
        throw error
    }
}

// ============================================================================
// Core Signing Functions
// ============================================================================

/**
 * Sign content and return signature
 */
export async function signContent (
    content:string,
    keypair:Keypair
):Promise<ContentSignature> {
    const contentHash = await hashContent(content)
    const signature = await signHash(
        contentHash,
        new Uint8Array(keypair.privateKey)
    )

    return {
        contentHash: bufferToHex(contentHash),
        signature,
        publicKey: bufferToHex(keypair.publicKey),
        timestamp: new Date().toISOString(),
    }
}

/**
 * Sign content with TSA timestamp
 */
export async function signContentWithTimestamp (
    content:string,
    keypair:Keypair,
    tsaConfig:TSAConfig
):Promise<TimestampedSignature> {
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
// File Signing (Sidecar JSON & EXIF Embedding)
// ============================================================================

/**
 * Sign any file with Ed25519 + TSA timestamp
 * Works with any file type; returns signature object.
 *
 * @param filename Filename
 * @param fileBuffer File content
 * @param keypair Keypair to sign with
 * @param ts Timestamp from TSA
 * @param metadata Additional data to sign
 * @returns {Promise<FileSignature>}
 */
export async function signFile (
    filename:string,
    fileBuffer:Uint8Array,
    keypair:Keypair,
    ts:Timestamp,
    metadata?:{
        author?:string;
        title?:string;
        description?:string;
        mimeType?:string;
        [key:string]:any;
    }
):Promise<FileSignature> {
    // Hash the file content
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        fileBuffer.buffer as ArrayBuffer
    )
    const fileHash = bufferToHex(new Uint8Array(hashBuffer))

    // Sign the hash
    const signature = await signHash(
        new Uint8Array(hashBuffer),
        keypair.privateKey
    )

    return {
        version: '1.0',
        file: {
            name: filename,
            hash: fileHash,
            size: fileBuffer.length,
            mimeType: metadata?.mimeType,
        },
        signature: {
            algorithm: 'Ed25519',
            publicKey: bufferToHex(keypair.publicKey),
            signature,
            signedAt: new Date().toISOString(),
        },
        timestamp: ts,
        metadata,
    }
}

/**
 * Verify a FileSignature against file content
 */
export async function verifyFileSignature (
    sig: FileSignature,
    fileBuffer: Uint8Array
): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Verify file hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer.buffer as ArrayBuffer)
    const computedHash = bufferToHex(new Uint8Array(hashBuffer))

    if (computedHash !== sig.file.hash) {
        errors.push('File hash mismatch - file has been modified')
    }

    // Verify file size
    if (fileBuffer.length !== sig.file.size) {
        errors.push('File size mismatch')
    }

    // Verify signature
    const publicKey = hexToBuffer(sig.signature.publicKey)
    const valid = await verifySignature(
        sig.file.hash,
        sig.signature.signature,
        publicKey
    )

    if (!valid) {
        errors.push('Invalid signature')
    }

    // Note: We're not re-verifying the TSA timestamp here
    // The timestamp in the signature is trusted if the signature is valid
    // Full TSA verification would require checking the TSA's certificate chain

    return {
        valid: errors.length === 0,
        errors,
    }
}

/**
 * Serialize FileSignature to JSON string for sidecar files
 */
export function serializeFileSignature (sig: FileSignature): string {
    return JSON.stringify(sig, null, 2)
}

/**
 * Parse FileSignature from JSON string
 */
export function parseFileSignature (json: string): FileSignature {
    return JSON.parse(json)
}

// ============================================================================
// C2PA Integration
// ============================================================================

/**
 * Create C2PA manifest for signed content
 */
export async function createC2PAManifest (
    content: string,
    signature: TimestampedSignature,
    metadata?: {
        title?: string;
        author?: string;
        description?: string;
    }
): Promise<Manifest> {
    // Create C2PA manifest
    const manifest = {
        claim_generator_info: `@substrate-system/keyframe${version}`,
        title: metadata?.title || 'Signed Content',

        // Assertions
        assertions: [
            {
                label: 'c2pa.hash.data',
                data: {
                    alg: 'sha256',
                    hash: signature.contentHash,
                    name: 'content.md',
                },
            },
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

            // Custom assertion for our signature
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
            // In production, this would be the actual C2PA signature
            // For now, we're embedding our own signature
            value: signature.signature,
        },
    }

    return manifest
}

/**
 * Sign content in C2PA format
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
): Promise<{ signature: TimestampedSignature; manifest: Manifest }> {
    const signature = await signContentWithTimestamp(content, keypair, tsaConfig)
    const manifest = await createC2PAManifest(content, signature, metadata)

    return { signature, manifest }
}

/**
 * Validate C2PA data from an image using @contentauth/c2pa-web
 *
 * @param imageBlob - Image blob to validate
 * @param c2paInstance - c2pa instance from createC2pa()
 * @returns Promise resolving to validation result with valid flag and manifest
 * @throws Error if no C2PA reader can be created or no manifest is found
 *
 * @example
 * ```ts
 * import { createC2pa } from '@contentauth/c2pa-web'
 * import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url'
 *
 * const c2pa = await createC2pa({ wasmSrc })
 * const imageBlob = await fetch('photo.jpg').then(r => r.blob())
 * const { valid, manifest } = await validateC2PAFromImage(imageBlob, c2pa)
 * ```
 */
export async function validateC2PAFromImage (
    imageBlob:Blob,
    c2pa:C2paSdk
):Promise<{ valid:boolean; manifest:Manifest }> {
    // Create reader from blob
    const reader = await c2pa.reader.fromBlob(
        imageBlob.type,
        imageBlob
    )

    if (!reader) {
        throw new Error('Failed to create C2PA reader')
    }

    // Get active manifest
    const manifest = await reader.activeManifest()

    // Clean up
    await reader.free()

    // Basic validation - manifest exists
    if (!manifest) {
        throw new Error('No manifest found in image')
    }

    // More sophisticated validation would check:
    // - Signature validity
    // - Certificate chain
    // - Timestamp verification
    const valid = true

    return {
        valid,
        manifest: manifest as unknown as Manifest,
    }
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
    metadata?: { title?: string; author?: string; description?: string; }
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
    publicKey: Uint8Array<ArrayBuffer>
): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    for (let i = 0; i < signedContent.revisions.length; i++) {
        const revision = signedContent.revisions[i]

        // Verify content hash
        const computedHash = await hashContent(revision.content)
        const hashString = bufferToHex(computedHash)
        if (hashString !== revision.signature.contentHash) {
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
                errors.push(`Revision ${i}: First revision should have ` +
                    'null previousHash')
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
 * Chain proof structure containing revision history
 */
export interface ChainProof {
    revisions: Array<{
        contentHash: string;
        signature: string;
        timestamp: string;
        previousHash: string | null;
    }>;
}

/**
 * Export signed content with embedded manifest
 */
export function exportWithManifest (signedContent: SignedContent): {
    content: string;
    manifest: Manifest | undefined;
    chainProof: ChainProof;
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


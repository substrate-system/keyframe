import { load, remove, dump, insert } from '@substrate-system/exif'
import { UserComment } from '@substrate-system/exif/tags/exif-ifd'
import {
    Artist,
    ImageDescription,
    Software
} from '@substrate-system/exif/tags/image-ifd'
import { readFile, writeFile } from 'node:fs/promises'
import {
    type Keypair,
    type FileSignature,
    type Timestamp,
    signFile,
    verifyFileSignature,
    serializeFileSignature,
    parseFileSignature,
} from '../index.js'
import { version } from '../../package.json'

/**
 * Node-specific file operations for keyframe
 */

export type {
    Keypair,
    FileSignature,
    ContentSignature,
    TimestampedSignature,
    ContentRevision,
    SignedContent,
} from '../index.js'

export {
    generateKeypair,
    hashContent,
    signHash,
    verifySignature,
    requestTimestamp,
    signContent,
    signContentWithTimestamp,
    signFile,
    verifyFileSignature,
    serializeFileSignature,
    parseFileSignature,
    createC2PAManifest,
    signContentC2PA,
    validateC2PAFromImage,
    createSignedContent,
    addRevision,
    verifyChain,
    serializeSignedContent,
    parseSignedContent,
    exportWithManifest,
} from '../index.js'

// ============================================================================
// File I/O Wrapper Functions
// ============================================================================

/**
 * Sign a file from the filesystem and return signature as sidecar JSON
 *
 * @param filepath - Path to the file to sign
 * @param keypair - Ed25519 keypair for signing
 * @param timestamp - Timestamp data from TSA
 * @param metadata - Optional metadata to include
 * @returns The file signature object
 */
export async function signFileFromPath (
    filepath:string,
    keypair:Keypair,
    timestamp:Timestamp,
    metadata?:Partial<{
        author:string;
        title:string;
        description:string;
        mimeType:string;
        [key:string]:any;
    }>
):Promise<FileSignature> {
    const fileBuffer = await readFile(filepath)
    const filename = filepath.split('/').pop() || filepath

    return signFile(
        filename,
        new Uint8Array(fileBuffer),
        keypair,
        timestamp,
        metadata
    )
}

/**
 * Verify a file signature from filesystem
 *
 * @param filepath - Path to the file to verify
 * @param signaturePath - Path to the .sig JSON file
 * @returns Verification result
 */
export async function verifyFileFromPath (
    filepath: string,
    signaturePath: string
): Promise<{ valid: boolean; signature: FileSignature; errors: string[] }> {
    const fileBuffer = await readFile(filepath)
    const sigJson = await readFile(signaturePath, 'utf-8')
    const signature = parseFileSignature(sigJson)

    const result = await verifyFileSignature(signature, new Uint8Array(fileBuffer))

    return {
        ...result,
        signature,
    }
}

/**
 * Sign a file and save signature as sidecar JSON
 *
 * @param filepath - Path to file to sign
 * @param outputPath - Optional path for .sig file (defaults to filepath + '.sig')
 * @param keypair - Ed25519 keypair
 * @param timestamp - Timestamp data from TSA
 * @param metadata - Optional metadata
 */
export async function signAndSaveSidecar (
    filepath: string,
    keypair: Keypair,
    timestamp: {
        authority: string;
        token: string;
        verifiedAt: string;
    },
    outputPath?: string,
    metadata?: {
        author?: string;
        title?: string;
        description?: string;
        mimeType?: string;
        [key: string]: any;
    }
): Promise<{ signature: FileSignature; sidecarPath: string }> {
    const signature = await signFileFromPath(filepath, keypair, timestamp, metadata)
    const sidecarPath = outputPath || filepath + '.sig'

    await writeFile(sidecarPath, serializeFileSignature(signature))

    return { signature, sidecarPath }
}

// ============================================================================
// JPEG EXIF Embedding
// ============================================================================

/**
 * Sign a JPEG image and embed signature in EXIF metadata
 * Returns the modified JPEG buffer with embedded signature
 */
export async function signJpegWithExif (
    jpegBuffer:Uint8Array,
    filename:string,
    keypair:Keypair,
    timestamp:{
        authority:string;
        token:string;
        verifiedAt:string;
    },
    metadata?:{
        author?:string;
        title?:string;
        description?:string;
    }
):Promise<Uint8Array> {
    // Load existing EXIF or create new if none
    let exifObj: Record<string, any>
    try {
        exifObj = load(jpegBuffer)
    } catch (_err) {
        exifObj = {
            '0th': {},
            Exif: {},
            GPS: {},
            Interop: {},
            '1st': {},
            thumbnail: null,
        }
    }

    // Strip EXIF to get "clean" image for signing
    // This ensures signature is valid regardless of EXIF data changes
    const cleanJpegBuffer = remove(jpegBuffer)

    // Create file signature over the CLEAN image
    const sig = await signFile(
        filename,
        cleanJpegBuffer,
        keypair,
        timestamp,
        { ...metadata, mimeType: 'image/jpeg' }
    )

    // Add signature data to EXIF UserComment
    exifObj.Exif[UserComment] = JSON.stringify(sig)

    // Add metadata to standard EXIF fields (updating existing if present)
    if (metadata?.author) {
        exifObj['0th'][Artist] = metadata.author
    }
    if (metadata?.title) {
        exifObj['0th'][ImageDescription] = metadata.title
    }
    if (metadata?.description) {
        // If description is provided, embed sig in it (legacy/human readable support)
        // detailed machine readable sig is in UserComment
        exifObj['0th'][ImageDescription] = (metadata.title ? metadata.title + '\n\n' : '') +
            metadata.description
    }

    // Add software tag
    exifObj['0th'][Software] =
        `@substrate-system/keyframe v${version}`

    // Dump EXIF to binary
    const exifBytes = dump(exifObj)

    // Insert EXIF into CLEAN JPEG
    // We insert into clean JPEG to avoid duplicate EXIF segments or corruption
    const signedJpeg = insert(exifBytes, cleanJpegBuffer)
    return signedJpeg
}

/**
 * Extract and verify FileSignature from JPEG EXIF metadata
 */
export async function verifyJpegExif (
    jpegBuffer:Uint8Array
):Promise<{
    valid:boolean;
    signature:FileSignature|null;
    errors:string[]
}> {
    try {
        // Load EXIF data
        const exifObj = load(jpegBuffer)

        // Extract signature from UserComment
        const userComment = exifObj.Exif![UserComment]
        if (!userComment) {
            return {
                valid: false,
                signature: null,
                errors: ['No signature found in EXIF metadata'],
            }
        }

        if (!Array.isArray(userComment) && !(typeof userComment === 'string')) {
            return {
                valid: false,
                signature: null,
                errors: ['No signature found in EXIF metadata'],
            }
        }

        // Parse signature JSON (may be embedded in description or standalone)
        //
        // Fallback checks if it was embedded in ImageDescription or
        // formatted differently
        //
        // But our signer puts it in UserComment directly mostly.
        // If the user manually put it elsewhere, we might need heuristics,
        // but stick to UserComment checking.
        let sigJson:string
        if (typeof userComment === 'string') {
            sigJson = userComment
            if (userComment.includes('Signature: ')) {
                const sigMatch = userComment.match(/Signature: (\{.+\})/)
                if (sigMatch) {
                    sigJson = sigMatch[1]
                }
            }
        } else {
            return {
                valid: false,
                signature: null,
                errors: ['No signature found in EXIF metadata'],
            }
        }

        let signature:FileSignature
        try {
            signature = JSON.parse(sigJson) as FileSignature
        } catch (_err) {
            return {
                valid: false,
                signature: null,
                errors: ['Failed to parse signature JSON from EXIF'],
            }
        }

        // Reconstruct the "clean" image (no EXIF) to verify hash
        const cleanJpegBuffer = remove(jpegBuffer)

        // Verify the signature against the CLEAN image
        const verification = await verifyFileSignature(
            signature,
            cleanJpegBuffer
        )

        return {
            valid: verification.valid,
            signature,
            errors: verification.errors,
        }
    } catch (error) {
        return {
            valid: false,
            signature: null,
            errors: [
                'Failed to verify JPEG EXIF: ' + ((error instanceof Error) ?
                    error.message :
                    String(error))
            ],
        }
    }
}

/**
 * Sign a JPEG file from disk and save with embedded EXIF
 *
 * @param inputPath - Path to input JPEG file
 * @param outputPath - Path to save signed JPEG
 * @param keypair - Ed25519 keypair
 * @param timestamp - Timestamp data from TSA
 * @param metadata - Optional metadata
 */
export async function signJpegFileWithExif (
    inputPath: string,
    outputPath: string,
    keypair: Keypair,
    timestamp: {
        authority: string;
        token: string;
        verifiedAt: string;
    },
    metadata?: {
        author?: string;
        title?: string;
        description?: string;
    }
): Promise<void> {
    const jpegBuffer = await readFile(inputPath)
    const filename = inputPath.split('/').pop() || inputPath

    const signedJpeg = await signJpegWithExif(
        new Uint8Array(jpegBuffer),
        filename,
        keypair,
        timestamp,
        metadata
    )

    await writeFile(outputPath, signedJpeg)
}

/**
 * Verify a JPEG file with embedded EXIF signature
 *
 * @param filepath - Path to JPEG file
 */
export async function verifyJpegFileExif (
    filepath: string
): Promise<{ valid: boolean; signature: FileSignature | null; errors: string[] }> {
    const jpegBuffer = await readFile(filepath)
    return verifyJpegExif(new Uint8Array(jpegBuffer))
}

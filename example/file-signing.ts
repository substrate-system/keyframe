/**
 * Example: File Signing with Sidecar JSON and EXIF Embedding
 *
 * This demonstrates the simplified file signing API:
 * - Sign any file with Ed25519 + TSA timestamp
 * - Save signature as sidecar JSON file
 * - Embed signature in JPEG EXIF metadata
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
    generateKeypair,
    signFile,
    verifyFileSignature,
    serializeFileSignature,
    parseFileSignature,
    signJpegWithExif,
    verifyJpegExif,
    type TSAConfig,
    type FileSignature,
} from '../src/node.js'

const TSA_CONFIG: TSAConfig = {
    url: 'https://freetsa.org/tsr',
}

// ============================================================================
// Example 1: Sign file with sidecar JSON
// ============================================================================

async function signWithSidecar () {
    console.log('\n📝 Example 1: Sign file with sidecar JSON\n')

    // Generate keypair
    const keypair = await generateKeypair()

    // Read the file
    const filepath = resolve(process.cwd(), 'example/20190814_102301.jpg')
    const fileBuffer = await readFile(filepath)

    // Sign the file
    console.log('Signing file...')
    const signature = await signFile(
        '20190814_102301.jpg',
        new Uint8Array(fileBuffer),
        keypair,
        TSA_CONFIG,
        {
            author: 'Your Name',
            title: 'Beach Photo',
            description: 'A beautiful beach photo',
            mimeType: 'image/jpeg',
        }
    )

    console.log('✅ File signed!')
    console.log('   - File hash:', signature.file.hash.substring(0, 16) + '...')
    console.log('   - Signature:', signature.signature.signature.substring(0, 16) + '...')
    console.log('   - TSA timestamp:', signature.timestamp.verifiedAt)

    // Save signature as sidecar JSON file
    const sidecarPath = filepath + '.sig'
    await writeFile(sidecarPath, serializeFileSignature(signature))
    console.log('   - Saved to:', sidecarPath)

    // Verify the signature
    console.log('\nVerifying signature...')
    const verification = await verifyFileSignature(
        signature,
        new Uint8Array(fileBuffer)
    )

    if (verification.valid) {
        console.log('✅ Signature is VALID')
    } else {
        console.log('❌ Signature is INVALID')
        verification.errors.forEach(err => console.log('   -', err))
    }
}

// ============================================================================
// Example 2: Verify file from sidecar JSON
// ============================================================================

async function verifyFromSidecar () {
    console.log('\n🔍 Example 2: Verify file from sidecar JSON\n')

    const filepath = resolve(process.cwd(), 'example/20190814_102301.jpg')
    const sidecarPath = filepath + '.sig'

    try {
        // Read the file and signature
        const fileBuffer = await readFile(filepath)
        const sigJson = await readFile(sidecarPath, 'utf-8')
        const signature = parseFileSignature(sigJson)

        console.log('Loaded signature:')
        console.log('   - File:', signature.file.name)
        console.log('   - Author:', signature.metadata?.author)
        console.log('   - Signed at:', signature.signature.signedAt)
        console.log('   - TSA verified:', signature.timestamp.verifiedAt)

        // Verify
        const verification = await verifyFileSignature(
            signature,
            new Uint8Array(fileBuffer)
        )

        if (verification.valid) {
            console.log('\n✅ File signature is VALID')
            console.log('   File has not been modified since signing')
        } else {
            console.log('\n❌ File signature is INVALID')
            verification.errors.forEach(err => console.log('   -', err))
        }
    } catch (error) {
        console.error('Error:', (error as Error).message)
    }
}

// ============================================================================
// Example 3: Sign JPEG with embedded EXIF
// ============================================================================

async function signJpegEmbedded () {
    console.log('\n🖼️  Example 3: Sign JPEG with embedded EXIF\n')

    // Generate keypair
    const keypair = await generateKeypair()

    // Read the JPEG
    const filepath = resolve(process.cwd(), 'example/20190814_102301.jpg')
    const jpegBuffer = await readFile(filepath)

    console.log('Signing JPEG with embedded EXIF...')

    // Sign and embed in EXIF
    const signedJpeg = await signJpegWithExif(
        new Uint8Array(jpegBuffer),
        '20190814_102301.jpg',
        keypair,
        TSA_CONFIG,
        {
            author: 'Your Name',
            title: 'Beach Photo',
            description: 'Signed with keyframe',
        }
    )

    // Save signed JPEG
    const outputPath = resolve(process.cwd(), 'example/signed-with-exif.jpg')
    await writeFile(outputPath, signedJpeg)

    console.log('✅ JPEG signed and saved!')
    console.log('   - Original:', filepath)
    console.log('   - Signed:', outputPath)
    console.log('   - Signature embedded in EXIF metadata')
}

// ============================================================================
// Example 4: Verify JPEG from EXIF
// ============================================================================

async function verifyJpegEmbedded () {
    console.log('\n🔍 Example 4: Verify JPEG from EXIF\n')

    const filepath = resolve(process.cwd(), 'example/signed-with-exif.jpg')

    try {
        const jpegBuffer = await readFile(filepath)

        console.log('Reading signature from EXIF...')

        // Extract and verify signature from EXIF
        const result = await verifyJpegExif(new Uint8Array(jpegBuffer))

        if (result.valid && result.signature) {
            console.log('✅ JPEG signature is VALID')
            console.log('   - File:', result.signature.file.name)
            console.log('   - Author:', result.signature.metadata?.author)
            console.log('   - Signed at:', result.signature.signature.signedAt)
            console.log('   - TSA verified:', result.signature.timestamp.verifiedAt)
        } else {
            console.log('❌ JPEG signature is INVALID')
            result.errors.forEach(err => console.log('   -', err))
        }
    } catch (error) {
        console.error('Error:', (error as Error).message)
    }
}

// ============================================================================
// Example 5: Compare both approaches
// ============================================================================

async function compareMethods () {
    console.log('\n⚖️  Example 5: Sidecar vs EXIF Comparison\n')

    const filepath = resolve(process.cwd(), 'example/20190814_102301.jpg')

    console.log('Sidecar JSON approach:')
    console.log('   ✅ Works with ANY file type (images, PDFs, videos, docs)')
    console.log('   ✅ Human-readable JSON format')
    console.log('   ✅ Easy to parse and verify')
    console.log('   ✅ No modification of original file')
    console.log('   ❌ Requires separate .sig file')
    console.log('   Example: photo.jpg + photo.jpg.sig')

    console.log('\nEXIF embedding approach:')
    console.log('   ✅ Signature embedded in the image file')
    console.log('   ✅ Single file contains everything')
    console.log('   ✅ Compatible with standard EXIF readers')
    console.log('   ❌ Only works with JPEG images')
    console.log('   ❌ Modifies the image file (adds metadata)')
    console.log('   Example: signed-photo.jpg (contains signature)')

    console.log('\n💡 Recommendation:')
    console.log('   - Use sidecar for maximum compatibility')
    console.log('   - Use EXIF for JPEG-specific workflows')
    console.log('   - Can use both together for redundancy!')
}

// ============================================================================
// Run all examples
// ============================================================================

async function runExamples () {
    try {
        await signWithSidecar()
        await verifyFromSidecar()
        await signJpegEmbedded()
        await verifyJpegEmbedded()
        await compareMethods()

        console.log('\n✨ All examples completed!\n')
    } catch (error) {
        console.error('\n❌ Error:', error)
        if (error instanceof Error) {
            console.error(error.stack)
        }
    }
}

runExamples()

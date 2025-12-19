import { test } from '@substrate-system/tapzero'
import {
    generateKeypair
} from '../src/index.js'
import {
    signFileFromPath,
    verifyFileFromPath,
    signAndSaveSidecar,
    verifyJpegFileExif,
    signJpegFileWithExif
} from '../src/node/index.js'
import path from 'path'
import { unlink } from 'fs/promises'

// assume this is run by piping into Node from the root project folder
const TEST_IMAGE_PATH = path.join(process.cwd(), 'test',
    '20190814_102301.jpg')
const OUTPUT_IMAGE_PATH = path.join(process.cwd(), 'test', 'test-output.jpg')
const OUTPUT_SIDECAR_PATH = path.join(process.cwd(), 'test',
    'test-output.jpg.sig')

// Mock timestamp data (simulating what would come from a TSA server)
const mockTimestamp = {
    authority: 'http://mock-tsa/timestamp',
    token: Buffer.from(new Uint8Array(10)).toString('base64'),  // Dummy token
    verifiedAt: new Date().toISOString(),
}

test('Node: signFileFromPath (sidecar signature)', async t => {
    const keypair = await generateKeypair()

    // Sign the test image
    const signature = await signFileFromPath(
        TEST_IMAGE_PATH,
        keypair,
        mockTimestamp,
        { author: 'Test Author', title: 'Test Image' }
    )

    t.ok(signature, 'should return something')
    t.equal(signature.file.name, '20190814_102301.jpg',
        'should have correct filename')
    t.ok(signature.signature.signature, 'should have a signature string')
    t.ok(signature.metadata, 'should preserve metadata')
    t.equal(signature.metadata?.author, 'Test Author',
        'should have correct author')
})

test('Node: signAndSaveSidecar & verifyFileFromPath', async t => {
    const keypair = await generateKeypair()

    // Sign and save sidecar
    const { sidecarPath } = await signAndSaveSidecar(
        TEST_IMAGE_PATH,
        keypair,
        mockTimestamp,
        OUTPUT_SIDECAR_PATH
    )

    t.equal(sidecarPath, OUTPUT_SIDECAR_PATH, 'should return correct sidecar path')

    // Verify
    const verification = await verifyFileFromPath(
        TEST_IMAGE_PATH,
        OUTPUT_SIDECAR_PATH
    )

    t.ok(verification.valid, 'signature should be valid')
    t.equal(verification.errors.length, 0, 'should have no errors')
    t.equal(verification.signature.file.name, '20190814_102301.jpg', 'verified sig should match file')

    // Cleanup
    try { await unlink(OUTPUT_SIDECAR_PATH) } catch { }
})

test('Node: JPEG EXIF signing and verification', async t => {
    const keypair = await generateKeypair()

    // Sign JPEG and embed in EXIF
    await signJpegFileWithExif(
        TEST_IMAGE_PATH,
        OUTPUT_IMAGE_PATH,
        keypair,
        mockTimestamp,
        { description: 'Embedded Signature Test' }
    )

    // Verify from disk
    const verification = await verifyJpegFileExif(OUTPUT_IMAGE_PATH)

    t.ok(verification.valid, 'EXIF signature should be valid')
    t.ok(verification.signature, 'should return extracted signature')
    t.equal(verification.signature?.metadata?.description, 'Embedded Signature Test', 'should recover metadata')

    // Cleanup
    try { await unlink(OUTPUT_IMAGE_PATH) } catch { }
})

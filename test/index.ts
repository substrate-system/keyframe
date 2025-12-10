import { test } from '@substrate-system/tapzero'
import {
    generateKeypair,
    signContent,
    hashContent,
    verifySignature,
    serializeSignedContent,
    parseSignedContent,
} from '../src/index.js'
import { bufferToHex } from '../src/util.js'

// Note: Tests that require TSA (timestamp authority) are skipped
// because they would fail with CORS errors in the browser.
// These functions work in Node.js environments.

test('generateKeypair', async t => {
    const keypair = await generateKeypair()
    t.ok(keypair.publicKey, 'should have public key')
    t.ok(keypair.privateKey, 'should have private key')
    t.equal(keypair.publicKey.length, 32, 'public key should be 32 bytes')
})

test('signContent', async t => {
    const keypair = await generateKeypair()
    const content = '# Test Post\n\nThis is a test.'

    const signature = await signContent(content, keypair)

    t.ok(signature.contentHash, 'should have content hash')
    t.ok(signature.signature, 'should have signature')
    t.ok(signature.publicKey, 'should have public key')
    t.ok(signature.timestamp, 'should have timestamp')
})

test('hashContent', async t => {
    const content = '# Test Post\n\nThis is a test.'
    const hash = await hashContent(content)

    t.ok(hash, 'should generate hash')
    t.equal(bufferToHex(hash).length, 64,
        'should be SHA-256 hash (64 hex chars)')
})

test('verifySignature', async t => {
    const keypair = await generateKeypair()
    const content = '# Test Post\n\nThis is a test.'

    const signature = await signContent(content, keypair)
    const valid = await verifySignature(
        signature.contentHash,
        signature.signature,
        keypair.publicKey
    )

    t.ok(valid, 'should verify valid signature')
})

test('verifySignature - invalid', async t => {
    const keypair = await generateKeypair()
    const content = '# Test Post\n\nThis is a test.'

    const signature = await signContent(content, keypair)

    // Modify the content hash to make signature invalid
    const tamperedHash = signature.contentHash.substring(0, 60) + '0000'

    const valid = await verifySignature(
        tamperedHash,
        signature.signature,
        keypair.publicKey
    )

    t.equal(valid, false, 'should reject invalid signature')
})

test('serialization', async t => {
    const keypair = await generateKeypair()
    const content = '# Test\n\nContent'

    const signature = await signContent(content, keypair)
    const mockSignedContent = {
        content,
        revisions: [{
            content,
            signature: {
                ...signature,
                tsaToken: 'mock-token',
                verifiedTimestamp: new Date().toISOString(),
            },
            previousHash: null,
        }],
    }

    const json = serializeSignedContent(mockSignedContent)
    t.ok(json, 'should serialize to JSON')

    const parsed = parseSignedContent(json)
    t.equal(parsed.content, content, 'should parse content correctly')
    t.equal(parsed.revisions.length, 1, 'should parse revisions correctly')
})

test('all done', () => {
    if (window) {
        // @ts-expect-error for tapout
        window.testsFinished = true
    }
})
